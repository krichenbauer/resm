import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE_LIMIT, buildDiagram } from '../diagram/pipeline.ts';
import { layoutDiagram } from '../layout/layout.ts';
import { buildScene } from '../layout/scene.ts';
import type { Representation } from '../settings/representation.ts';
import { DARK, LIGHT } from '../theme/palette.ts';
import { EXPORT_PADDING, MAX_PNG_SIDE, exportSize, pngSize, renderSvg } from './svg.ts';

function sceneOf(regex: string, representation: Representation = 'dfa') {
  const result = buildDiagram({ regex, representation, showSink: false, stateLimit: DEFAULT_STATE_LIMIT });
  if (!result.ok) throw new Error(result.error.message);
  const layout = layoutDiagram(result.diagram);
  return buildScene(result.diagram, layout.positions, layout.shapes);
}

const count = (text: string, part: string) => text.split(part).length - 1;

describe('SVG export', () => {
  it('is a standalone SVG document', () => {
    const text = renderSvg(sceneOf('ab'), LIGHT);
    expect(text.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(text.endsWith('</svg>')).toBe(true);
    // Nothing may depend on the page it came from or on anything remote.
    expect(text).not.toMatch(/var\(|light-dark\(|class=|href=|url\(http/);
    expect(count(text, 'http')).toBe(1);
  });

  it('covers the whole diagram with modest padding, at its natural size', () => {
    const scene = sceneOf('(a|b)*abb', 'min-dfa');
    const { width, height } = exportSize(scene.bounds);
    expect(width).toBe(Math.ceil(scene.bounds.maxX - scene.bounds.minX + 2 * EXPORT_PADDING));
    expect(height).toBe(Math.ceil(scene.bounds.maxY - scene.bounds.minY + 2 * EXPORT_PADDING));

    const text = renderSvg(scene, LIGHT);
    const x = scene.bounds.minX - EXPORT_PADDING;
    const y = scene.bounds.minY - EXPORT_PADDING;
    expect(text).toContain(`viewBox="${x} ${y} ${width} ${height}"`);
    expect(text).toContain(`width="${width}" height="${height}"`);
  });

  it('draws every state, the initial arrow, and the double outline of accepting states', () => {
    const text = renderSvg(sceneOf('ab'), LIGHT);
    for (const name of ['q', '0', '1', '2']) expect(text).toContain(`>${name}<`);
    // Three states, one more outline for the accepting state, and the dot of the initial arrow.
    expect(count(text, '<circle')).toBe(5);
    // Two edges and the initial arrow end in an arrowhead.
    expect(count(text, 'marker-end="url(#resm-arrowhead)"')).toBe(3);
  });

  it('writes labels as text, escaped for XML', () => {
    const text = renderSvg(sceneOf('<|&|"', 'min-dfa'), LIGHT);
    expect(text).toContain('>[&quot;&amp;&lt;]</text>');
    expect(text).not.toContain('<]');
  });

  it('uses the colors of the given theme with a solid background', () => {
    const scene = sceneOf('a');
    expect(renderSvg(scene, LIGHT)).toContain(`<rect`);
    expect(renderSvg(scene, LIGHT)).toContain(`fill="${LIGHT.surface}"`);
    expect(renderSvg(scene, DARK)).toContain(`fill="${DARK.surface}"`);
    expect(renderSvg(scene, DARK)).toContain(`stroke="${DARK.line}"`);
    expect(renderSvg(scene, DARK)).not.toContain(LIGHT.line);
  });
});

describe('PNG size', () => {
  it('has the chosen width and a proportional height', () => {
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
