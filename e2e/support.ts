import { type Locator, type Page, expect } from '@playwright/test';

export const regexField = (page: Page) => page.getByRole('textbox', { name: 'Regular expression' });
export const representation = (page: Page) => page.getByRole('combobox', { name: 'Automaton representation' });
export const diagramArea = (page: Page) => page.getByRole('img', { name: 'Automaton diagram' });
export const states = (page: Page) => page.locator('[data-state]');
export const state = (page: Page, name: string) => page.locator(`[data-state="${name}"]`);
export const edges = (page: Page) => page.locator('[data-edge]');
export const error = (page: Page) => page.getByRole('status');

/** Waits until nothing in the diagram moves any more. */
export async function settled(page: Page): Promise<void> {
  await expect(diagramArea(page)).toHaveAttribute('data-settled', '');
}

/**
 * Enters a regex and waits until its diagram, which has `count` states, has
 * come to rest. Waiting for the states first matters: until the new diagram
 * arrives from the worker, the old one is still shown, and it is at rest.
 */
export async function showRegex(page: Page, regex: string, count: number): Promise<void> {
  await regexField(page).fill(regex);
  await expect(states(page)).toHaveCount(count);
  await settled(page);
}

/** The center of the outline of a state on screen. */
export async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.locator('circle.outline').first().boundingBox();
  if (!box) throw new Error('state is not rendered');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The diameter of the outline of a state on screen, which shows the zoom level. */
export async function diameterOf(locator: Locator): Promise<number> {
  const box = await locator.locator('circle.outline').first().boundingBox();
  if (!box) throw new Error('state is not rendered');
  return box.width;
}

/**
 * Records where the named states are in the diagram plane on every animation
 * frame, from now until `stop` is called. A state that does not exist in a
 * frame is recorded as `null`.
 */
export async function recordPositions(page: Page, names: readonly string[]) {
  await page.evaluate((recorded) => {
    const diagram = document.querySelector('resm-app')?.shadowRoot?.querySelector('resm-diagram')?.shadowRoot;
    const frames: (number[] | null)[][] = [];
    const recording = { frames, active: true };
    (window as unknown as { recording: typeof recording }).recording = recording;
    const sample = () => {
      if (!recording.active) return;
      frames.push(
        recorded.map((name) => {
          const transform = diagram?.querySelector(`[data-state="${name}"]`)?.getAttribute('transform');
          return transform ? (transform.match(/-?\d+(\.\d+)?/g) ?? []).map(Number) : null;
        }),
      );
      requestAnimationFrame(sample);
    };
    sample();
  }, names);

  return {
    /** Ends the recording and returns, for every state, its positions frame by frame. */
    async stop(): Promise<({ x: number; y: number } | null)[][]> {
      const frames = await page.evaluate(() => {
        const { recording } = window as unknown as { recording: { frames: (number[] | null)[][]; active: boolean } };
        recording.active = false;
        return recording.frames;
      });
      return names.map((_, index) =>
        frames.map((frame) => {
          const position = frame[index];
          return position ? { x: position[0] ?? NaN, y: position[1] ?? NaN } : null;
        }),
      );
    },
  };
}

export const exportButton = (page: Page) => page.getByRole('button', { name: 'Export' });
export const shareButton = (page: Page) => page.getByRole('button', { name: 'Share' });
export const settingsButton = (page: Page) => page.getByRole('button', { name: 'Settings' });
export const sinkOption = (page: Page) => page.getByRole('checkbox', { name: 'Show sink state' });
export const stateLimitOption = (page: Page) => page.getByRole('spinbutton', { name: 'Maximum number of states' });
export const themeOption = (page: Page) => page.getByRole('combobox', { name: 'Theme' });
export const pngWidthOption = (page: Page) => page.getByRole('spinbutton', { name: 'PNG width in pixels' });

/**
 * Sends one of the gesture events with which Safari reports a pinch on a
 * trackpad, and on touch screens in addition to the pointer events. Returns
 * whether the page prevented the browser's own reaction to it.
 */
export function sendGesture(
  page: Page,
  type: 'gesturestart' | 'gesturechange' | 'gestureend',
  gesture: { scale: number; x: number; y: number },
): Promise<boolean> {
  return diagramArea(page).evaluate(
    (area, { type, scale, x, y }) => {
      const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        scale,
        clientX: x,
        clientY: y,
      });
      area.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { type, ...gesture },
  );
}

export const alphabetOption = (page: Page) => page.getByRole('combobox', { name: 'Alphabet' });
/** The caption in the corner of the canvas that names the alphabet. */
export const alphabetCaption = (page: Page) => page.locator('resm-diagram .alphabet');
/** The remark below the regex field on something that is not an error. */
export const notice = (page: Page) => page.locator('resm-app .notice');

/** Switches to the alphabet of all ASCII characters and closes the settings again. */
export async function useAsciiAlphabet(page: Page): Promise<void> {
  await settingsButton(page).click();
  await alphabetOption(page).selectOption('ASCII');
  await page.keyboard.press('Escape');
}

export const repositoryLink = (page: Page) => page.getByRole('link', { name: 'RESM on GitHub: documentation and source code' });
