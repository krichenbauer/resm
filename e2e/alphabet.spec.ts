import { expect, test } from '@playwright/test';
import {
  alphabetCaption,
  alphabetOption,
  centerOf,
  diagramArea,
  edges,
  error,
  notice,
  regexField,
  representation,
  settingsButton,
  showRegex,
  sinkOption,
  state,
  states,
  useAsciiAlphabet,
} from './support.ts';

const labels = (page: import('@playwright/test').Page) =>
  edges(page).evaluateAll((elements) =>
    elements.map((element) => `${element.getAttribute('data-edge')}: ${element.textContent?.trim()}`),
  );

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('names the alphabet of the regex in the bottom left corner of the canvas', async ({ page }) => {
  await expect(alphabetCaption(page)).toHaveText('Σ = {}');
  await showRegex(page, '(a|b)*abb', 5);
  await expect(alphabetCaption(page)).toHaveText('Σ = {a, b}');
  await regexField(page).fill('\\d+x');
  await expect(alphabetCaption(page)).toHaveText('Σ = {0–9, x}');

  const area = await diagramArea(page).boundingBox();
  const caption = await alphabetCaption(page).boundingBox();
  if (!area || !caption) throw new Error('caption is not rendered');
  expect(caption.x - area.x).toBeLessThan(24);
  expect(area.y + area.height - (caption.y + caption.height)).toBeLessThan(24);
  expect(caption.x).toBeGreaterThanOrEqual(area.x);
  expect(caption.y + caption.height).toBeLessThanOrEqual(area.y + area.height);
});

test('keeps the caption out of the way of gestures', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  const before = await centerOf(state(page, 'q0'));
  const caption = await alphabetCaption(page).boundingBox();
  if (!caption) throw new Error('caption is not rendered');

  const start = { x: caption.x + caption.width / 2, y: caption.y + caption.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y - 50, { steps: 3 });
  await page.mouse.up();
  const after = await centerOf(state(page, 'q0'));
  expect(after.x - before.x).toBeCloseTo(80, 0);
  expect(after.y - before.y).toBeCloseTo(-50, 0);
});

test('completes a DFA with the characters of the regex by default', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  await settingsButton(page).click();
  await sinkOption(page).check();
  await expect(states(page)).toHaveCount(4);
  expect(await labels(page)).toEqual([
    'q0-q1: a',
    'q0-q3: b',
    'q1-q2: b',
    'q1-q3: a',
    'q2-q3: a, b',
    'q3-q3: a, b',
  ]);
});

test('offers all of ASCII as the alphabet instead', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  await settingsButton(page).click();
  await sinkOption(page).check();
  await expect(alphabetOption(page)).toHaveValue('derived');
  await alphabetOption(page).selectOption('ASCII');

  await expect(alphabetCaption(page)).toHaveText('Σ = ASCII');
  await expect(page.locator('[data-edge="q3-q3"]')).toHaveText('Σ');
  await expect(page.locator('[data-edge="q0-q3"]')).toHaveText('[^a]');

  await alphabetOption(page).selectOption('From the regex');
  await expect(alphabetCaption(page)).toHaveText('Σ = {a, b}');
  await expect(page.locator('[data-edge="q0-q3"]')).toHaveText('b');
});

test('lets the dot stand for any character of the regex, or of ASCII', async ({ page }) => {
  await representation(page).selectOption('Minimized DFA');
  await showRegex(page, '(a|b)*a.', 4);
  expect(await labels(page)).toContain('q1-q2: a');
  await expect(notice(page)).toBeEmpty();

  await representation(page).selectOption('DFA');
  await showRegex(page, 'a.', 3);
  expect(await labels(page)).toEqual(['q0-q1: a', 'q1-q2: a']);
  await useAsciiAlphabet(page);
  await expect(page.locator('[data-edge="q1-q2"]')).toHaveText('.');
});

test('points out a dot or a negation that cannot match, without calling it an error', async ({ page }) => {
  await showRegex(page, 'a', 2);
  await regexField(page).fill('"[^"]*"');
  await expect(notice(page)).toHaveText(
    `'[^"]' at position 2 matches nothing, because no character of the alphabet {"} fits. ` +
      'The alphabet consists of the characters that are written in the regex.',
  );
  // The regex is valid, and its diagram is shown: two quotation marks in a row.
  await expect(error(page)).toBeEmpty();
  await expect(regexField(page)).toHaveAttribute('aria-invalid', 'false');
  await expect(states(page)).toHaveCount(3);

  await useAsciiAlphabet(page);
  await expect(notice(page)).toBeEmpty();
  await expect(page.locator('[data-edge]', { hasText: '[^"]' }).first()).toBeVisible();
});

test('keeps the notice of the last valid regex out of the way of an error', async ({ page }) => {
  await regexField(page).fill('.');
  await expect(notice(page)).toContainText('matches nothing');
  await regexField(page).fill('.(');
  await expect(error(page)).toContainText('Unterminated group');
  await expect(notice(page)).toBeEmpty();
});

test('carries the alphabet in a share link', async ({ page }) => {
  await page.goto('./#regex=a.&alphabet=ascii');
  await expect(alphabetCaption(page)).toHaveText('Σ = ASCII');
  await expect(page.locator('[data-edge="q1-q2"]')).toHaveText('.');

  await page.goto('./#regex=a.&alphabet=derived');
  await expect(alphabetCaption(page)).toHaveText('Σ = {a}');
  await expect(page.locator('[data-edge="q1-q2"]')).toHaveText('a');
});
