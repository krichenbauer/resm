import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE_LIMIT, buildDiagram } from '../diagram/pipeline.ts';
import { layoutDiagram } from '../layout/layout.ts';
import { buildScene } from '../layout/scene.ts';
import type { Representation } from '../settings/representation.ts';
import { DARK, LIGHT } from '../theme/palette.ts';
import { CAPTION_HEIGHT, EXPORT_PADDING, MAX_PNG_SIDE, exportSize, pngSize, renderSvg } from './svg.ts';

const CAPTION = 'Σ = {a, b}';

function sceneOf(regex: string, representation: Representation = 'dfa') {
  const result = buildDiagram({ regex, representation, showSink: false, stateLimit: DEFAULT_STATE_LIMIT, alphabet: 'ascii' });
  if (!result.ok) throw new Error(result.error.message);
  const layout = layoutDiagram(result.diagram);
  return buildScene(result.diagram, layout.positions, layout.shapes);
}

const count = (text: string, part: string) => text.split(part).length - 1;

describe('SVG export', () => {
  it('is a standalone SVG document', () => {
    const text = renderSvg(sceneOf('ab'), LIGHT, CAPTION);
    expect(text.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(text.endsWith('</svg>')).toBe(true);
    // Nothing may depend on the page it came from or on anything remote.
    expect(text).not.toMatch(/var\(|light-dark\(|class=|href=|url\(http/);
    expect(count(text, 'http')).toBe(1);
  });

  it('covers the whole diagram with modest padding, at its natural size', () => {
    const scene = sceneOf('(a|b)*abb', 'min-dfa');
    const { width, height } = exportSize(scene.bounds, CAPTION);
    expect(width).toBe(Math.ceil(scene.bounds.maxX - scene.bounds.minX + 2 * EXPORT_PADDING));
    // The caption with the alphabet has a line of its own below the diagram.
    expect(height).toBe(Math.ceil(scene.bounds.maxY - scene.bounds.minY + 2 * EXPORT_PADDING + CAPTION_HEIGHT));

    const text = renderSvg(scene, LIGHT, CAPTION);
    const x = scene.bounds.minX - EXPORT_PADDING;
    const y = scene.bounds.minY - EXPORT_PADDING;
    expect(text).toContain(`viewBox="${x} ${y} ${width} ${height}"`);
    expect(text).toContain(`width="${width}" height="${height}"`);
  });

  it('can ask to be displayed at another size without changing what it shows', () => {
    const scene = sceneOf('ab');
    const { width, height } = exportSize(scene.bounds, CAPTION);
    const text = renderSvg(scene, LIGHT, CAPTION, { width: 3000, height: 500 });
    expect(text).toContain('width="3000" height="500"');
    expect(text).toContain(` ${width} ${height}"`);
  });

  it('draws every state, the initial arrow, and the double outline of accepting states', () => {
    const text = renderSvg(sceneOf('ab'), LIGHT, CAPTION);
    for (const name of ['q', '0', '1', '2']) expect(text).toContain(`>${name}<`);
    // Three states, one more outline for the accepting state, and the dot of the initial arrow.
    expect(count(text, '<circle')).toBe(5);
    // Two edges and the initial arrow end in an arrowhead.
    expect(count(text, 'marker-end="url(#resm-arrowhead)"')).toBe(3);
  });

  it('names the alphabet in the bottom left corner', () => {
    const scene = sceneOf('ab');
    const text = renderSvg(scene, LIGHT, 'Σ = {<, &}');
    expect(text).toContain('>Σ = {&lt;, &amp;}</text>');
    const [, x, y] = /<text x="([-\d.]+)" y="([-\d.]+)" text-anchor="start"[^>]*>Σ/.exec(text) ?? [];
    expect(Number(x)).toBeCloseTo(scene.bounds.minX);
    expect(Number(y)).toBeGreaterThan(scene.bounds.maxY + EXPORT_PADDING);
    expect(Number(y)).toBeLessThan(scene.bounds.maxY + EXPORT_PADDING + CAPTION_HEIGHT);
  });

  it('is wide enough for a caption that is longer than the diagram', () => {
    const scene = sceneOf('');
    const narrow = exportSize(scene.bounds, 'Σ = {}');
    const wide = exportSize(scene.bounds, 'Σ = {0–9, A–Z, _, a–z, and a lot more to read}');
    expect(wide.width).toBeGreaterThan(narrow.width + 100);
    expect(wide.height).toBe(narrow.height);
  });

  it('writes labels as text, escaped for XML', () => {
    const text = renderSvg(sceneOf('<|&|"', 'min-dfa'), LIGHT, CAPTION);
    expect(text).toContain('>[&quot;&amp;&lt;]</text>');
    expect(text).not.toContain('<]');
  });

  it('uses the colors of the given theme with a solid background', () => {
    const scene = sceneOf('a');
    expect(renderSvg(scene, LIGHT, CAPTION)).toContain(`<rect`);
    expect(renderSvg(scene, LIGHT, CAPTION)).toContain(`fill="${LIGHT.surface}"`);
    expect(renderSvg(scene, DARK, CAPTION)).toContain(`fill="${DARK.surface}"`);
    expect(renderSvg(scene, DARK, CAPTION)).toContain(`stroke="${DARK.line}"`);
    expect(renderSvg(scene, DARK, CAPTION)).not.toContain(LIGHT.line);
  });
});

describe('PNG size', () => {
  it('has the chosen width and a proportional height', () => {
    expect(pngSize(exportSize({ minX: 0, minY: 0, maxX: 368, maxY: 44 }, ''), 800).width).toBe(800);
    expect(pngSize({ width: 400, height: 100 }, 1600)).toEqual({ width: 1600, height: 400 });
    expect(pngSize({ width: 300, height: 200 }, 1000)).toEqual({ width: 1000, height: 667 });
  });

  it('keeps both sides within what browsers can draw', () => {
    expect(pngSize({ width: 400, height: 100 }, 1_000_000)).toEqual({ width: MAX_PNG_SIDE, height: MAX_PNG_SIDE / 4 });
    expect(pngSize({ width: 100, height: 400 }, 4000)).toEqual({ width: MAX_PNG_SIDE / 4, height: MAX_PNG_SIDE });
  });

  it('is at least one pixel on each side', () => {
    expect(pngSize({ width: 4000, height: 10 }, 0)).toEqual({ width: 1, height: 1 });
    expect(pngSize({ width: 4000, height: 10 }, Number.NaN)).toEqual({ width: 1, height: 1 });
    expect(pngSize({ width: 4000, height: 10 }, 100)).toEqual({ width: 100, height: 1 });
  });
});
