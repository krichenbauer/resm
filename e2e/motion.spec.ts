import { expect, test } from '@playwright/test';
import {
  centerOf,
  diagramArea,
  diameterOf,
  recordPositions,
  regexField,
  representation,
  sendGesture,
  settled,
  showRegex,
  state,
  states,
} from './support.ts';

interface Position {
  x: number;
  y: number;
}
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);
const present = (positions: (Position | null)[]) => positions.filter((position): position is Position => !!position);

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('moves existing states continuously to their new places when the regex changes', async ({ page }) => {
  await showRegex(page, 'ab', 3);

  // The new branch makes room next to q1, so q1 has to move.
  const recording = await recordPositions(page, ['q1']);
  await regexField(page).fill('ab|c');
  await expect(states(page)).toHaveCount(4);
  await settled(page);
  const [q1] = (await recording.stop()).map(present);
  if (!q1?.[0]) throw new Error('q1 was not recorded');

  const first = q1[0];
  const last = q1.at(-1) ?? first;
  const travelled = distance(first, last);
  expect(travelled).toBeGreaterThan(20);

  const steps = q1.slice(1).map((position, index) => distance(position, q1[index] ?? position));
  expect(steps.filter((step) => step > 0.01).length).toBeGreaterThan(8);
  expect(Math.max(...steps)).toBeLessThan(travelled * 0.4);
});

test('lets a new state grow out of the state that leads to it', async ({ page }) => {
  await showRegex(page, 'ab', 3);

  const recording = await recordPositions(page, ['q2', 'q3']);
  await regexField(page).fill('abc');
  await expect(states(page)).toHaveCount(4);
  await settled(page);
  const [q2, q3] = await recording.stop();

  const appeared = q3?.findIndex((position) => position !== null) ?? -1;
  const [origin, start] = [q2?.[appeared], q3?.[appeared]];
  const [end, neighbor] = [q3?.at(-1), q2?.at(-1)];
  if (!origin || !start || !end || !neighbor) throw new Error('q3 never appeared');
  expect(distance(start, origin)).toBeLessThan(60);
  expect(distance(end, neighbor)).toBeGreaterThan(90);
});

test('does not animate a change of representation', async ({ page }) => {
  await showRegex(page, '(a|b)*abb', 5);

  const recording = await recordPositions(page, ['q0', 'q1']);
  await representation(page).selectOption('Minimized DFA');
  await expect(states(page)).toHaveCount(4);
  await settled(page);
  const [q0, q1] = (await recording.stop()).map(present);

  for (const positions of [q0 ?? [], q1 ?? []]) {
    const places = new Set(positions.map(({ x, y }) => `${x},${y}`));
    expect(places.size).toBeLessThanOrEqual(2);
  }
});

test('drags a state with the pointer, pulls its neighbors along, and lets it return when released', async ({
  page,
}) => {
  await showRegex(page, 'ab', 3);
  const home = await centerOf(state(page, 'q1'));
  const neighborHome = await centerOf(state(page, 'q2'));

  await page.mouse.move(home.x, home.y);
  await page.mouse.down();
  await page.mouse.move(home.x + 30, home.y + 120, { steps: 6 });

  await expect.poll(async () => distance(await centerOf(state(page, 'q1')), { x: home.x + 30, y: home.y + 120 })).toBeLessThan(2);
  await expect.poll(async () => (await centerOf(state(page, 'q2'))).y - neighborHome.y).toBeGreaterThan(8);
  await expect(diagramArea(page)).not.toHaveAttribute('data-settled', '');

  // Still held: the state stays under the pointer instead of drifting back.
  await page.waitForTimeout(300);
  expect(distance(await centerOf(state(page, 'q1')), { x: home.x + 30, y: home.y + 120 })).toBeLessThan(2);

  await page.mouse.up();
  await settled(page);
  expect(distance(await centerOf(state(page, 'q1')), home)).toBeLessThan(1);
  expect(distance(await centerOf(state(page, 'q2')), neighborHome)).toBeLessThan(1);
});

test('pans the canvas by dragging its background', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  const before = await centerOf(state(page, 'q0'));

  await page.mouse.move(before.x, before.y + 150);
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 90, { steps: 4 });
  await page.mouse.up();

  const after = await centerOf(state(page, 'q0'));
  expect(after.x - before.x).toBeCloseTo(120, 0);
  expect(after.y - before.y).toBeCloseTo(-60, 0);

  // The canvas has no edge: the diagram can be moved out of sight entirely.
  await page.mouse.move(after.x, after.y + 150);
  await page.mouse.down();
  await page.mouse.move(after.x + 3000, after.y + 150, { steps: 4 });
  await page.mouse.up();
  await expect(state(page, 'q0')).not.toBeInViewport();
});

test('zooms with the wheel around the pointer', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  const anchor = await centerOf(state(page, 'q2'));
  const size = await diameterOf(state(page, 'q2'));

  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => diameterOf(state(page, 'q2'))).toBeGreaterThan(size * 1.3);
  expect(distance(await centerOf(state(page, 'q2')), anchor)).toBeLessThan(2);

  await page.mouse.wheel(0, 2000);
  await expect.poll(() => diameterOf(state(page, 'q2'))).toBeLessThan(size * 0.5);
  expect(distance(await centerOf(state(page, 'q2')), anchor)).toBeLessThan(2);
});

test('zooms with the wheel anywhere on the canvas, not only over the diagram', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  const size = await diameterOf(state(page, 'q0'));
  const area = await diagramArea(page).boundingBox();
  if (!area) throw new Error('diagram area is not rendered');

  // The corners of the canvas are far from anything that is drawn.
  const corners = [
    { x: area.x + 10, y: area.y + 10 },
    { x: area.x + area.width - 10, y: area.y + area.height - 10 },
  ];
  let expected = size;
  for (const corner of corners) {
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.wheel(0, 200);
    expected *= Math.exp(-0.4);
    await expect.poll(() => diameterOf(state(page, 'q0'))).toBeCloseTo(expected, 0);
  }
});

test('zooms with a pinch on a Safari trackpad, which arrives as gesture events', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  const anchor = await centerOf(state(page, 'q2'));
  const size = await diameterOf(state(page, 'q2'));

  // Preventing the default keeps Safari from magnifying the whole page instead.
  expect(await sendGesture(page, 'gesturestart', { scale: 1, ...anchor })).toBe(true);
  expect(await sendGesture(page, 'gesturechange', { scale: 1.4, ...anchor })).toBe(true);
  await sendGesture(page, 'gesturechange', { scale: 2, ...anchor });
  await sendGesture(page, 'gestureend', { scale: 2, ...anchor });
  await expect.poll(() => diameterOf(state(page, 'q2'))).toBeCloseTo(size * 2, 0);
  expect(distance(await centerOf(state(page, 'q2')), anchor)).toBeLessThan(2);

  // Every gesture starts at scale 1 again, whatever the zoom level is by then.
  await sendGesture(page, 'gesturestart', { scale: 1, ...anchor });
  await sendGesture(page, 'gesturechange', { scale: 0.5, ...anchor });
  await sendGesture(page, 'gestureend', { scale: 0.5, ...anchor });
  await expect.poll(() => diameterOf(state(page, 'q2'))).toBeCloseTo(size, 0);
});

test('lets the canvas, not the browser, handle touch gestures', async ({ page }) => {
  const touchAction = (selector: string) =>
    page.locator(selector).first().evaluate((element) => getComputedStyle(element).touchAction);
  expect(await touchAction('resm-diagram')).toBe('none');
  expect(await touchAction('resm-diagram .canvas')).toBe('none');
});

test('never selects or highlights anything on the canvas', async ({ page }) => {
  await showRegex(page, 'ab', 3);

  // Nothing in the diagram can be selected, in any browser's spelling of the property.
  for (const selector of ['resm-diagram', 'resm-diagram .canvas', '[data-state="q1"] text', '[data-edge] text']) {
    const selectable = await page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return style.userSelect || style.getPropertyValue('-webkit-user-select');
      });
    expect(selectable, selector).toBe('none');
  }

  // A browser that starts a selection anyway is stopped.
  const prevented = await page.locator('[data-state="q1"] text').evaluate((text) => {
    const event = new Event('selectstart', { bubbles: true, cancelable: true, composed: true });
    text.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);

  // Dragging a state across the diagram and up into the controls leaves nothing selected.
  const from = await centerOf(state(page, 'q0'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 300, from.y + 40, { steps: 5 });
  await page.mouse.move(from.x + 100, 10, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
});

test('listens for gestures on a painted element that covers the whole canvas', async ({ page }) => {
  // Browsers decide where wheel and touch events need the page's attention
  // from what is painted. An SVG paints nothing where the diagram is not,
  // so the listeners sit on an element with a background around it.
  const canvas = page.locator('resm-diagram .canvas');
  const area = await diagramArea(page).boundingBox();
  const box = await canvas.boundingBox();
  expect(box).toEqual(area);
  const background = await canvas.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toMatch(/^rgb\(/);
});

test('brings the whole diagram back into view when it changes, even after zooming and panning', async ({
  page,
}) => {
  await showRegex(page, 'ab', 3);
  const q0 = await centerOf(state(page, 'q0'));
  await page.mouse.move(q0.x, q0.y);
  await page.mouse.wheel(0, -1500);
  await expect(state(page, 'q2')).not.toBeInViewport();

  await showRegex(page, 'abcd', 5);
  for (const part of await states(page).all()) await expect(part).toBeInViewport({ ratio: 1 });
});

test('zooms out for a growing diagram but does not zoom in again just because it shrinks', async ({ page }) => {
  await settled(page);
  const natural = await diameterOf(state(page, 'q0'));

  await showRegex(page, 'a{30}', 31);
  const small = await diameterOf(state(page, 'q0'));
  expect(small).toBeLessThan(natural * 0.6);
  for (const part of await states(page).all()) await expect(part).toBeInViewport({ ratio: 1 });

  await showRegex(page, 'a{20}', 21);
  expect(await diameterOf(state(page, 'q0'))).toBeCloseTo(small, 1);

  // Once the diagram is tiny in its area, the view returns to the natural size.
  await showRegex(page, '', 1);
  expect(await diameterOf(state(page, 'q0'))).toBeCloseTo(natural, 1);
});

test('keeps animating at a steady rate with a diagram at the state limit', async ({ page }) => {
  await showRegex(page, 'a{150}', 151);
  const recording = await recordPositions(page, ['q0']);
  const started = Date.now();
  await regexField(page).fill('a{150}b{49}');
  await expect(states(page)).toHaveCount(200);
  await settled(page);
  const frames = (await recording.stop())[0]?.length ?? 0;
  const seconds = (Date.now() - started) / 1000;
  // Headless browsers render at 60 frames per second; leave room for slow machines.
  expect(frames / seconds).toBeGreaterThan(30);
});
