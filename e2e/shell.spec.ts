import { expect, test } from '@playwright/test';
import { repositoryLink } from './support.ts';

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

test('links to the documentation and the source code from the top right corner', async ({ page }) => {
  await page.goto('./');
  const link = repositoryLink(page);
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://github.com/krichenbauer/resm#readme');
  // The link leaves RESM, so it opens a new tab and tells the other site nothing about this one.
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link.locator('svg')).toHaveCount(1);

  for (const width of [1280, 340]) {
    await page.setViewportSize({ width, height: 600 });
    const box = await link.boundingBox();
    const field = await page.getByRole('textbox', { name: 'Regular expression' }).boundingBox();
    if (!box || !field) throw new Error('link is not rendered');
    expect(width - (box.x + box.width), `at a width of ${width}`).toBeLessThan(16);
    // In the first row of the controls, next to the regex field.
    expect(Math.abs(box.y + box.height / 2 - (field.y + field.height / 2)), `at a width of ${width}`).toBeLessThan(4);
    expect(box.x, `at a width of ${width}`).toBeGreaterThanOrEqual(field.x + field.width);
  }
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

test('ships the license notices of bundled dependencies', async ({ request }) => {
  const response = await request.get('./third-party-licenses.md');
  expect(response.ok()).toBe(true);

  const notices = await response.text();
  expect(notices).toMatch(/^## lit - .* \(BSD-3-Clause\)$/m);
  expect(notices).toContain('Copyright (c) 2017 Google LLC');
  // The layout library is only part of the worker bundle. Its distribution
  // already contains its graph library, which has the same notice.
  expect(notices).toMatch(/^## @dagrejs\/dagre - .* \(MIT\)$/m);
  expect(notices).toContain('Copyright (c) 2012-2014 Chris Pettitt');
  // The GitHub mark is copied into the page, not installed as a package.
  expect(notices).toMatch(/^## Octicons, GitHub mark \(MIT\)$/m);
  expect(notices).toContain('GitHub Inc.');
});
