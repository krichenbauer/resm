import { expect, test } from '@playwright/test';
import {
  centerOf,
  diagramArea,
  diameterOf,
  exportButton,
  recordPositions,
  regexField,
  representation,
  settingsButton,
  shareButton,
  showRegex,
  state,
  states,
} from './support.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('describes the diagram in words', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  await expect(diagramArea(page)).toHaveAccessibleDescription(
    'DFA with 3 states and 2 transitions. Initial state: q0. Accepting state: q2. ' +
      'Transitions: q0 to q1 on a; q1 to q2 on b.',
  );
  await representation(page).selectOption('Minimized DFA');
  await expect(diagramArea(page)).toHaveAccessibleDescription(/^Minimized DFA with 3 states/);
});

test('reaches every control and the diagram with the keyboard, in reading order', async ({ page }) => {
  await regexField(page).focus();
  for (const next of [representation(page), exportButton(page), shareButton(page), settingsButton(page), diagramArea(page)]) {
    await page.keyboard.press('Tab');
    await expect(next).toBeFocused();
  }
});

test('opens a menu with the keyboard and returns the focus when it closes', async ({ page }) => {
  await settingsButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Show sink state' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('checkbox', { name: 'Show sink state' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'Show sink state' })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(settingsButton(page)).toBeFocused();
});

test('pans and zooms the diagram with the keyboard', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  const before = await centerOf(state(page, 'q0'));
  const size = await diameterOf(state(page, 'q0'));
  await diagramArea(page).focus();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const panned = await centerOf(state(page, 'q0'));
  expect(panned.x - before.x).toBeCloseTo(-40, 0);
  expect(panned.y - before.y).toBeCloseTo(-80, 0);

  await page.keyboard.press('+');
  await expect.poll(() => diameterOf(state(page, 'q0'))).toBeCloseTo(size * 1.25, 0);
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  await expect.poll(() => diameterOf(state(page, 'q0'))).toBeCloseTo(size / 1.25, 0);

  // The zero key brings the whole diagram back, at its natural size.
  for (let step = 0; step < 40; step++) await page.keyboard.press('ArrowRight');
  await expect(state(page, 'q0')).not.toBeInViewport();
  await page.keyboard.press('0');
  for (const part of await states(page).all()) await expect(part).toBeInViewport({ ratio: 1 });
  await expect.poll(() => diameterOf(state(page, 'q0'))).toBeCloseTo(size, 0);
});

test('does not animate for people who prefer reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await showRegex(page, 'ab', 3);

  const recording = await recordPositions(page, ['q1']);
  await regexField(page).fill('ab|c');
  await expect(states(page)).toHaveCount(4);
  await page.waitForTimeout(400);
  const [q1] = await recording.stop();
  const places = new Set((q1 ?? []).flatMap((position) => (position ? [`${position.x},${position.y}`] : [])));
  expect(places.size).toBeLessThanOrEqual(2);
});
