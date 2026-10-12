import { expect, test } from '@playwright/test';
import {
  edges,
  error,
  regexField,
  representation,
  settingsButton,
  showRegex,
  sinkOption,
  state,
  stateLimitOption,
  states,
  themeOption,
} from './support.ts';

const LIGHT_SURFACE = 'rgb(255, 255, 255)';
const DARK_SURFACE = 'rgb(22, 24, 29)';
const surface = (page: import('@playwright/test').Page) =>
  page.locator('resm-app').evaluate((app) => getComputedStyle(app).backgroundColor);

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('keeps the settings in a menu that opens on demand', async ({ page }) => {
  await expect(sinkOption(page)).toBeHidden();
  await settingsButton(page).click();
  await expect(sinkOption(page)).toBeVisible();
  await expect(sinkOption(page)).not.toBeChecked();
  await expect(stateLimitOption(page)).toHaveValue('200');
  await expect(themeOption(page)).toHaveValue('system');

  await page.keyboard.press('Escape');
  await expect(sinkOption(page)).toBeHidden();
});

test('shows the sink state of a DFA on request and names it last', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  await settingsButton(page).click();
  await sinkOption(page).check();

  await expect(states(page)).toHaveText(['q0', 'q1', 'q2', 'q3']);
  await expect(state(page, 'q3')).not.toHaveAttribute('data-accepting', '');
  await expect(edges(page)).toHaveCount(6);
  await expect(page.locator('[data-edge="q3-q3"]')).toHaveText('[\\x00-\\x7f]');

  await sinkOption(page).uncheck();
  await expect(states(page)).toHaveText(['q0', 'q1', 'q2']);
});

test('applies an adjusted state limit', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  await settingsButton(page).click();
  await stateLimitOption(page).fill('3');
  await stateLimitOption(page).press('Enter');
  await page.keyboard.press('Escape');

  await regexField(page).fill('abc');
  await expect(error(page)).toHaveText('The DFA has more than 3 states, which is the display limit.');
  await expect(states(page)).toHaveCount(3);
});

test('keeps the state limit within its range', async ({ page }) => {
  await settingsButton(page).click();
  await stateLimitOption(page).fill('99999');
  await stateLimitOption(page).press('Enter');
  await expect(stateLimitOption(page)).toHaveValue('500');
  await stateLimitOption(page).fill('0');
  await stateLimitOption(page).press('Enter');
  await expect(stateLimitOption(page)).toHaveValue('1');
  await stateLimitOption(page).fill('');
  await stateLimitOption(page).press('Enter');
  await expect(stateLimitOption(page)).toHaveValue('1');
});

test('follows the theme of the operating system unless one is chosen', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await surface(page)).toBe(LIGHT_SURFACE);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await surface(page)).toBe(DARK_SURFACE);

  await settingsButton(page).click();
  await themeOption(page).selectOption('Light');
  expect(await surface(page)).toBe(LIGHT_SURFACE);

  await page.emulateMedia({ colorScheme: 'light' });
  await themeOption(page).selectOption('Dark');
  expect(await surface(page)).toBe(DARK_SURFACE);

  await themeOption(page).selectOption('System');
  expect(await surface(page)).toBe(LIGHT_SURFACE);
});

test('remembers the regex and all settings for the next visit', async ({ page }) => {
  await regexField(page).fill('a|b');
  await representation(page).selectOption('Minimized DFA');
  await settingsButton(page).click();
  await sinkOption(page).check();
  await stateLimitOption(page).fill('50');
  await stateLimitOption(page).press('Enter');
  await themeOption(page).selectOption('Dark');
  await expect(states(page)).toHaveCount(3);

  await page.reload();
  await expect(regexField(page)).toHaveValue('a|b');
  await expect(representation(page)).toHaveValue('min-dfa');
  await expect(states(page)).toHaveText(['q0', 'q1', 'q2']);
  expect(await surface(page)).toBe(DARK_SURFACE);
  await settingsButton(page).click();
  await expect(sinkOption(page)).toBeChecked();
  await expect(stateLimitOption(page)).toHaveValue('50');
  await expect(themeOption(page)).toHaveValue('dark');
});

test('stores nothing but the regex and the settings, under a single key', async ({ page }) => {
  await showRegex(page, 'ab', 3);
  const stored = await page.evaluate(() => ({ ...localStorage }));
  expect(Object.keys(stored)).toEqual(['resm']);
  expect(JSON.parse(stored.resm ?? '')).toEqual({
    regex: 'ab',
    settings: { representation: 'dfa', showSink: false, stateLimit: 200, theme: 'system' },
  });
});

test('opens each menu below its button and inside the window, also on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 600 });
  for (const name of ['Export', 'Settings']) {
    const button = page.getByRole('button', { name });
    await button.click();
    const menu = page.locator('[popover]:popover-open');
    const [buttonBox, menuBox] = [await button.boundingBox(), await menu.boundingBox()];
    if (!buttonBox || !menuBox) throw new Error('menu is not rendered');
    expect(menuBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
    expect(menuBox.y).toBeLessThan(buttonBox.y + buttonBox.height + 12);
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(340);
    await page.keyboard.press('Escape');
  }
});
