import { type CDPSession, type Page, expect, test } from '@playwright/test';
import { centerOf, diameterOf, sendGesture, settled, showRegex, state } from './support.ts';

test.use({ hasTouch: true, viewport: { width: 400, height: 700 } });

interface Touch {
  x: number;
  y: number;
  id: number;
}

/** Touch gestures need the browser's own input pipeline, which only Chromium exposes for testing. */
async function touchscreen(page: Page) {
  const session: CDPSession = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: Touch[]) =>
    session.send('Input.dispatchTouchEvent', { type, touchPoints });
  return {
    start: (...touches: Touch[]) => send('touchStart', touches),
    move: (...touches: Touch[]) => send('touchMove', touches),
    end: (...remaining: Touch[]) => send('touchEnd', remaining),
  };
}

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch input is simulated through the Chrome DevTools Protocol');
  await page.goto('./');
  await showRegex(page, 'ab', 3);
});

test('pans with one finger on the background', async ({ page }) => {
  const touch = await touchscreen(page);
  const before = await centerOf(state(page, 'q0'));

  await touch.start({ x: 200, y: 600, id: 0 });
  await touch.move({ x: 230, y: 560, id: 0 });
  await touch.move({ x: 260, y: 520, id: 0 });
  await touch.end();

  const after = await centerOf(state(page, 'q0'));
  expect(after.x - before.x).toBeCloseTo(60, 0);
  expect(after.y - before.y).toBeCloseTo(-80, 0);
});

test('zooms by pinching with two fingers, around the point between them', async ({ page }) => {
  const touch = await touchscreen(page);
  const size = await diameterOf(state(page, 'q1'));
  const middle = await centerOf(state(page, 'q1'));

  await touch.start({ x: middle.x - 40, y: middle.y + 100, id: 0 });
  await touch.start({ x: middle.x - 40, y: middle.y + 100, id: 0 }, { x: middle.x + 40, y: middle.y - 100, id: 1 });
  await touch.move({ x: middle.x - 60, y: middle.y + 150, id: 0 }, { x: middle.x + 60, y: middle.y - 150, id: 1 });
  await touch.move({ x: middle.x - 80, y: middle.y + 200, id: 0 }, { x: middle.x + 80, y: middle.y - 200, id: 1 });
  await touch.end();

  await expect.poll(() => diameterOf(state(page, 'q1'))).toBeCloseTo(size * 2, 0);
  const after = await centerOf(state(page, 'q1'));
  expect(Math.hypot(after.x - middle.x, after.y - middle.y)).toBeLessThan(3);
});

test('does not zoom twice when a browser reports a pinch both as touches and as a gesture', async ({ page }) => {
  const touch = await touchscreen(page);
  const size = await diameterOf(state(page, 'q1'));
  const middle = await centerOf(state(page, 'q1'));

  await touch.start({ x: middle.x - 40, y: middle.y + 100, id: 0 });
  await touch.start({ x: middle.x - 40, y: middle.y + 100, id: 0 }, { x: middle.x + 40, y: middle.y - 100, id: 1 });
  await sendGesture(page, 'gesturestart', { scale: 1, ...middle });
  await touch.move({ x: middle.x - 80, y: middle.y + 200, id: 0 }, { x: middle.x + 80, y: middle.y - 200, id: 1 });
  expect(await sendGesture(page, 'gesturechange', { scale: 2, ...middle })).toBe(true);
  await touch.end();
  await sendGesture(page, 'gestureend', { scale: 2, ...middle });

  await expect.poll(() => diameterOf(state(page, 'q1'))).toBeCloseTo(size * 2, 0);
});

test('drags a state with one finger and lets it return when released', async ({ page }) => {
  const touch = await touchscreen(page);
  const home = await centerOf(state(page, 'q1'));

  await touch.start({ x: home.x, y: home.y, id: 0 });
  await touch.move({ x: home.x + 10, y: home.y + 60, id: 0 });
  await touch.move({ x: home.x + 20, y: home.y + 120, id: 0 });
  await expect
    .poll(async () => {
      const held = await centerOf(state(page, 'q1'));
      return Math.hypot(held.x - home.x - 20, held.y - home.y - 120);
    })
    .toBeLessThan(2);

  await touch.end();
  await settled(page);
  const released = await centerOf(state(page, 'q1'));
  expect(Math.hypot(released.x - home.x, released.y - home.y)).toBeLessThan(1);
});
