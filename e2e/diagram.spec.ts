import { type Page, expect, test } from '@playwright/test';
import {
  diagramArea,
  edges,
  error,
  regexField,
  representation,
  settled,
  states,
  useAsciiAlphabet,
} from './support.ts';

/** Edge labels by the names of their states, such as `q0-q1: a`. */
async function edgeLabels(page: Page): Promise<string[]> {
  return edges(page).evaluateAll((elements) =>
    elements.map((element) => `${element.getAttribute('data-edge')}: ${element.textContent?.trim()}`),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('starts with the single state q0, which is initial and accepting', async ({ page }) => {
  await expect(states(page)).toHaveCount(1);
  const q0 = page.locator('[data-state="q0"]');
  await expect(q0).toHaveText('q0');
  await expect(q0).toHaveAttribute('data-initial', '');
  await expect(q0).toHaveAttribute('data-accepting', '');
  await expect(edges(page)).toHaveCount(0);
  await expect(error(page)).toBeEmpty();
});

test('draws the DFA of a regex while typing', async ({ page }) => {
  await regexField(page).pressSequentially('ab');
  await expect(states(page)).toHaveText(['q0', 'q1', 'q2']);
  expect(await edgeLabels(page)).toEqual(['q0-q1: a', 'q1-q2: b']);

  await regexField(page).pressSequentially('*');
  await expect(edges(page)).toHaveCount(3);
  expect(await edgeLabels(page)).toEqual(['q0-q1: a', 'q1-q2: b', 'q2-q2: b']);
});

test('marks the initial state with an arrow from a dot and accepting states with a double outline', async ({
  page,
}) => {
  await regexField(page).fill('ab');
  await expect(states(page)).toHaveCount(3);

  const q0 = page.locator('[data-state="q0"]');
  const q2 = page.locator('[data-state="q2"]');
  await expect(q0.locator('.initial-dot')).toHaveCount(1);
  await expect(q0.locator('.initial-arrow')).toHaveCount(1);
  await expect(q0.locator('circle.outline')).toHaveCount(1);
  await expect(q2.locator('circle.outline')).toHaveCount(2);
  await expect(q2.locator('.initial-dot')).toHaveCount(0);
  await expect(page.locator('[data-initial]')).toHaveCount(1);
  await expect(page.locator('[data-accepting]')).toHaveCount(1);

  // The dot lies to the left of the state it points into.
  const dot = await q0.locator('.initial-dot').boundingBox();
  const outline = await q0.locator('circle.outline').boundingBox();
  if (!dot || !outline) throw new Error('markers are not rendered');
  expect(dot.x + dot.width).toBeLessThan(outline.x);
});

test('switches between the four representations', async ({ page }) => {
  await regexField(page).fill('a|b');
  await expect(states(page)).toHaveCount(3);

  await representation(page).selectOption('ε-NFA');
  await expect(states(page)).toHaveCount(6);
  expect(await edgeLabels(page)).toEqual([
    'q0-q1: ε',
    'q0-q2: ε',
    'q1-q3: a',
    'q2-q4: b',
    'q3-q5: ε',
    'q4-q5: ε',
  ]);

  await representation(page).selectOption('NFA');
  await expect(states(page)).toHaveCount(3);

  await representation(page).selectOption('Minimized DFA');
  await expect(states(page)).toHaveCount(2);
  // The edge stands for the whole alphabet of the regex, which is short enough to be listed.
  expect(await edgeLabels(page)).toEqual(['q0-q1: a, b']);

  await representation(page).selectOption('DFA');
  await expect(states(page)).toHaveCount(3);
});

test('labels edges with exact character sets', async ({ page }) => {
  await useAsciiAlphabet(page);
  await representation(page).selectOption('Minimized DFA');
  await regexField(page).fill('\\d+|[^"]');
  await expect(states(page)).toHaveCount(3);
  expect(await edgeLabels(page)).toEqual(['q0-q1: [^"0-9]', 'q0-q2: \\d', 'q2-q2: \\d']);
});

test('shows a syntax error with its position and keeps the last valid diagram', async ({ page }) => {
  await regexField(page).fill('ab');
  await expect(states(page)).toHaveCount(3);

  await regexField(page).pressSequentially('(');
  await expect(error(page)).toHaveText("Position 3: Unterminated group: this '(' has no matching ')'.");
  await expect(regexField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(states(page)).toHaveText(['q0', 'q1', 'q2']);

  await regexField(page).pressSequentially('c)');
  await expect(error(page)).toBeEmpty();
  await expect(regexField(page)).toHaveAttribute('aria-invalid', 'false');
  await expect(states(page)).toHaveCount(4);
});

test('reports a diagram beyond 200 states and keeps the last valid diagram', async ({ page }) => {
  await regexField(page).fill('ab');
  await expect(states(page)).toHaveCount(3);

  await regexField(page).fill('a{200}');
  await expect(error(page)).toHaveText('The DFA has more than 200 states, which is the display limit.');
  await expect(states(page)).toHaveCount(3);

  await regexField(page).fill('a{199}');
  await expect(error(page)).toBeEmpty();
  await expect(states(page)).toHaveCount(200);
});

test('shows the whole diagram inside the diagram area', async ({ page }) => {
  await regexField(page).fill('[a-z]+@[a-z]+\\.(com|org)');
  await expect(states(page)).toHaveCount(11);
  await settled(page);

  const area = await diagramArea(page).boundingBox();
  if (!area) throw new Error('diagram area is not rendered');
  for (const part of [...(await states(page).all()), ...(await edges(page).locator('text').all())]) {
    const box = await part.boundingBox();
    if (!box) throw new Error('diagram part is not rendered');
    expect(box.x).toBeGreaterThanOrEqual(area.x);
    expect(box.y).toBeGreaterThanOrEqual(area.y);
    expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
  }
});

test('does not enlarge a small diagram beyond its natural size', async ({ page }) => {
  await expect(states(page)).toHaveCount(1);
  const outline = await page.locator('[data-state="q0"] circle.outline').first().boundingBox();
  if (!outline) throw new Error('state is not rendered');
  expect(outline.width).toBeGreaterThan(40);
  expect(outline.width).toBeLessThan(50);
});

test('computes diagrams in a worker that is served from the site itself', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('baseURL is not configured');
  await expect(states(page)).toHaveCount(1);
  expect(page.workers()).toHaveLength(1);
  expect(page.workers()[0]?.url().startsWith(baseURL)).toBe(true);
});
