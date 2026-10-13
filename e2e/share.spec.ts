import { expect, test } from '@playwright/test';
import { regexField, representation, settingsButton, shareButton, showRegex, states, themeOption } from './support.ts';

// Only Chromium lets a test read the real clipboard. The other browsers get a
// stand-in that records what the page copies.
test.beforeEach(async ({ context, browserName }) => {
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    return;
  }
  await context.addInitScript(() => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          copied = text;
          return Promise.resolve();
        },
        readText: () => Promise.resolve(copied),
      },
    });
  });
});

const clipboard = (page: import('@playwright/test').Page) => page.evaluate(() => navigator.clipboard.readText());

test('copies a link with the regex and the settings, not with the diagram', async ({ page, baseURL }) => {
  await page.goto('./');
  await representation(page).selectOption('Minimized DFA');
  await showRegex(page, '(a|b)*abb', 4);

  await shareButton(page).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  expect(await clipboard(page)).toBe(`${baseURL}#regex=%28a%7Cb%29*abb&automaton=min-dfa&alphabet=derived&sink=0&limit=200`);
  await expect(shareButton(page)).toBeVisible({ timeout: 10_000 });
});

test('opens a share link with its regex and settings', async ({ page }) => {
  await page.goto('./#regex=a%7Cb&automaton=min-dfa&sink=1&limit=10');
  await expect(regexField(page)).toHaveValue('a|b');
  await expect(representation(page)).toHaveValue('min-dfa');
  await expect(states(page)).toHaveText(['q0', 'q1', 'q2']);
});

test('lets a share link take precedence over what is stored, except for the theme', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('./');
  await representation(page).selectOption('NFA');
  await regexField(page).fill('xyz');
  await settingsButton(page).click();
  await themeOption(page).selectOption('Dark');
  await expect(states(page)).toHaveCount(4);

  const visitor = await context.newPage();
  await visitor.goto('./#regex=ab&automaton=enfa&sink=0&limit=200');
  await expect(regexField(visitor)).toHaveValue('ab');
  await expect(representation(visitor)).toHaveValue('enfa');
  await expect(states(visitor)).toHaveCount(3);
  await settingsButton(visitor).click();
  await expect(themeOption(visitor)).toHaveValue('dark');

  // The link has done its job: it leaves the address bar and becomes the remembered state.
  await expect(visitor).toHaveURL(baseURL ?? '');
  await visitor.reload();
  await expect(regexField(visitor)).toHaveValue('ab');
  await expect(representation(visitor)).toHaveValue('enfa');
});

test('applies a share link that is opened in a page that is already open', async ({ page, baseURL }) => {
  await page.goto('./');
  await showRegex(page, 'xyz', 4);
  await page.evaluate(() => {
    location.hash = 'regex=a&automaton=min-dfa';
  });
  await expect(regexField(page)).toHaveValue('a');
  await expect(representation(page)).toHaveValue('min-dfa');
  await expect(states(page)).toHaveCount(2);
  await expect(page).toHaveURL(baseURL ?? '');
});

test('ignores a fragment that is not a share link', async ({ page }) => {
  await page.goto('./');
  await showRegex(page, 'ab', 3);
  await page.goto('./#top');
  await page.reload();
  await expect(regexField(page)).toHaveValue('ab');
});

test('round-trips a regex full of special characters through a link', async ({ page, context }) => {
  const regex = '#&=?%+ /\\\\\\.[^"]*';
  await page.goto('./');
  await regexField(page).fill(regex);
  await shareButton(page).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();

  const visitor = await context.newPage();
  await visitor.goto(await clipboard(page));
  await expect(regexField(visitor)).toHaveValue(regex);
});
