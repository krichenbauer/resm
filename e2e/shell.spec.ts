import { expect, test } from '@playwright/test';

test('starts with an empty single-line regex field', async ({ page }) => {
  await page.goto('./');

  const regexField = page.getByRole('textbox', { name: 'Regular expression' });
  await expect(regexField).toBeVisible();
  await expect(regexField).toHaveValue('');
  expect(await regexField.evaluate((element) => element.tagName)).toBe('INPUT');
});

test('offers the four representations with the DFA selected', async ({ page }) => {
  await page.goto('./');

  const selector = page.getByRole('combobox', { name: 'Automaton representation' });
  await expect(selector.getByRole('option')).toHaveText(['ε-NFA', 'NFA', 'DFA', 'Minimized DFA']);
  await expect(selector).toHaveValue('dfa');
});

test('lets the diagram fill the space below the controls', async ({ page }) => {
  await page.goto('./');

  const diagram = page.getByRole('img', { name: 'Automaton diagram' });
  await expect(diagram).toBeVisible();

  const viewport = page.viewportSize();
  const diagramBox = await diagram.boundingBox();
  const fieldBox = await page.getByRole('textbox', { name: 'Regular expression' }).boundingBox();
  if (!viewport || !diagramBox || !fieldBox) throw new Error('layout boxes are unavailable');

  expect(diagramBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height);
  expect(diagramBox.width).toBeCloseTo(viewport.width, 0);
  expect(diagramBox.y + diagramBox.height).toBeCloseTo(viewport.height, 0);
});

test('keeps the controls usable on a narrow phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./');

  await expect(page.getByRole('textbox', { name: 'Regular expression' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('combobox', { name: 'Automaton representation' })).toBeInViewport({
    ratio: 1,
  });
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(320);
});

test('loads every resource from its own host and base path', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('baseURL is not configured');
  const requestedUrls: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', (request) => requestedUrls.push(request.url()));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('./', { waitUntil: 'networkidle' });

  const networkUrls = requestedUrls.filter((url) => !url.startsWith('data:'));
  expect(networkUrls.length).toBeGreaterThan(1);
  expect(networkUrls.filter((url) => !url.startsWith(baseURL))).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
