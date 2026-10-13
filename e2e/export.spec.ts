import { readFile } from 'node:fs/promises';
import { type Page, expect, test } from '@playwright/test';
import { centerOf, exportButton, pngWidthOption, representation, settled, showRegex, state } from './support.ts';

// Exports must not depend on the pixel density of the screen.
test.use({ deviceScaleFactor: 2 });

async function download(page: Page, button: string): Promise<{ name: string; content: Buffer }> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ]);
  return { name: file.suggestedFilename(), content: await readFile(await file.path()) };
}

/** Parses an SVG document in the browser and reports what it contains. */
const inspectSvg = (page: Page, text: string) =>
  page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    const root = document.documentElement;
    return {
      wellFormed: document.querySelector('parsererror') === null && root.localName === 'svg',
      viewBox: (root.getAttribute('viewBox') ?? '').split(' ').map(Number),
      width: Number(root.getAttribute('width')),
      height: Number(root.getAttribute('height')),
      texts: [...root.querySelectorAll('text')].map((text) => text.textContent),
      circles: root.querySelectorAll('circle').length,
    };
  }, text);

/** Zooms far into the diagram and moves it, so that only a part of it is on screen. */
async function zoomIntoDetail(page: Page): Promise<void> {
  const q0 = await centerOf(state(page, 'q0'));
  await page.mouse.move(q0.x, q0.y);
  await page.mouse.wheel(0, -1200);
  await page.mouse.move(q0.x, q0.y + 200);
  await page.mouse.down();
  await page.mouse.move(q0.x - 300, q0.y + 100, { steps: 3 });
  await page.mouse.up();
  await expect(state(page, 'q3')).not.toBeInViewport();
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await representation(page).selectOption('Minimized DFA');
  await showRegex(page, '(a|b)*abb', 4);
});

test('exports the complete diagram as an SVG file', async ({ page }) => {
  await exportButton(page).click();
  const file = await download(page, 'Download SVG');
  expect(file.name).toBe('resm-diagram.svg');

  const svg = await inspectSvg(page, file.content.toString('utf8'));
  expect(svg.wellFormed).toBe(true);
  expect(svg.texts.filter((text) => text?.startsWith('q'))).toEqual(['q0', 'q1', 'q2', 'q3']);
  expect(svg.texts.filter((text) => text?.length === 1).sort()).toEqual(['a', 'a', 'a', 'a', 'b', 'b', 'b', 'b']);
  // The alphabet is named in the image, because labels can refer to it.
  expect(svg.texts.at(-1)).toBe('Σ = {a, b}');
  // Four states, the second outline of the accepting state, and the dot of the initial arrow.
  expect(svg.circles).toBe(6);
  expect(svg.width).toBe(svg.viewBox[2]);
  expect(svg.height).toBe(svg.viewBox[3]);
});

test('exports the same SVG whatever part of the diagram is on screen', async ({ page }) => {
  await exportButton(page).click();
  const whole = await download(page, 'Download SVG');
  await page.keyboard.press('Escape');

  await zoomIntoDetail(page);
  await exportButton(page).click();
  const detail = await download(page, 'Download SVG');
  expect(detail.content.equals(whole.content)).toBe(true);
});

test('exports the complete diagram as a PNG file of the chosen width', async ({ page }) => {
  await exportButton(page).click();
  const svg = await inspectSvg(page, (await download(page, 'Download SVG')).content.toString('utf8'));

  await zoomIntoDetail(page);
  await exportButton(page).click();
  await expect(pngWidthOption(page)).toHaveValue('1600');
  await pngWidthOption(page).fill('800');
  const file = await download(page, 'Download PNG');
  expect(file.name).toBe('resm-diagram.png');

  // A PNG file starts with a fixed signature, followed by a header with its width and height.
  expect(file.content.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const width = file.content.readUInt32BE(16);
  const height = file.content.readUInt32BE(20);
  expect(width).toBe(800);
  expect(height).toBe(Math.round((800 * svg.height) / svg.width));

  // The image shows the diagram: lines and text in several shades on the background.
  const colors = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const seen = new Set<number>();
    for (let offset = 0; offset < data.length; offset += 4) {
      seen.add(((data[offset] ?? 0) << 16) | ((data[offset + 1] ?? 0) << 8) | (data[offset + 2] ?? 0));
    }
    return { count: seen.size, corner: [data[0], data[1], data[2], data[3]] };
  }, file.content.toString('base64'));
  expect(colors.count).toBeGreaterThan(10);
  expect(colors.corner).toEqual([255, 255, 255, 255]);
});

test('exports in the colors of the current theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await settled(page);
  await exportButton(page).click();
  const file = await download(page, 'Download SVG');
  expect(file.content.toString('utf8')).toContain('fill="#16181d"');
});
