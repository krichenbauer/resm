import { STATE_RADIUS, estimateLabelWidth } from '../layout/geometry.ts';
import { type Bounds, INITIAL_ARROW_LENGTH, type Scene } from '../layout/scene.ts';
import {
  ACCEPTING_GAP,
  ARROWHEAD_PATH,
  ARROWHEAD_SIZE,
  INITIAL_DOT_RADIUS,
  LABEL_FONT_FAMILY,
  LABEL_FONT_SIZE,
  LABEL_HALO_WIDTH,
  LINE_WIDTH,
  NAME_FONT_FAMILY,
  NAME_FONT_SIZE,
  NAME_INDEX_DROP,
  NAME_INDEX_FONT_SIZE,
} from '../layout/style.ts';
import type { Palette } from '../theme/palette.ts';

/** Free space around the diagram in an exported image, in diagram units. */
export const EXPORT_PADDING = 16;

/** Height of the line below the diagram that names the alphabet. */
export const CAPTION_HEIGHT = 24;

/** Longest side of an exported PNG in pixels. Larger canvases fail in some browsers. */
export const MAX_PNG_SIDE = 8192;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The natural size of the exported image: the whole diagram with padding, and
 * below it a line for the caption that names the alphabet.
 */
export function exportSize(bounds: Bounds, caption: string): Size {
  const width = Math.max(bounds.maxX - bounds.minX, estimateLabelWidth(caption));
  return {
    width: Math.ceil(width + 2 * EXPORT_PADDING),
    height: Math.ceil(bounds.maxY - bounds.minY + 2 * EXPORT_PADDING + CAPTION_HEIGHT),
  };
}

/**
 * The size in pixels of a PNG with the requested width and the proportions of
 * the image. It does not depend on the screen in any way. Both sides stay
 * within `MAX_PNG_SIDE`, which reduces the width of very tall images.
 */
export function pngSize(natural: Size, requestedWidth: number): Size {
  const requested = Number.isFinite(requestedWidth) ? requestedWidth : 0;
  const widest = Math.min(MAX_PNG_SIDE, (MAX_PNG_SIDE * natural.width) / natural.height);
  const width = Math.max(1, Math.round(Math.min(requested, widest)));
  return { width, height: Math.max(1, Math.round((width * natural.height) / natural.width)) };
}

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/**
 * Draws a scene as a standalone SVG document. It shows the whole diagram,
 * whatever part of it is visible on screen, and carries its own colors and
 * fonts instead of referring to the page. The caption names the alphabet,
 * without which labels such as `Σ` or `[^a]` could not be read. `size` is the
 * size at which the document asks to be displayed; by default the natural
 * size of the diagram.
 */
export function renderSvg(
  scene: Scene,
  palette: Palette,
  caption: string,
  size: Size = exportSize(scene.bounds, caption),
): string {
  const { width, height } = exportSize(scene.bounds, caption);
  const x = scene.bounds.minX - EXPORT_PADDING;
  const y = scene.bounds.minY - EXPORT_PADDING;
  const arrow = 'marker-end="url(#resm-arrowhead)"';
  const arrowStart = -(STATE_RADIUS + INITIAL_ARROW_LENGTH);

  const paths = scene.edges.map(({ path }) => `<path d="${path}" ${arrow}/>`);
  const labels = scene.edges.map(
    ({ label }) => `<text x="${label.x}" y="${label.y}">${escapeXml(label.text)}</text>`,
  );
  const states = scene.states.map(({ name, x: stateX, y: stateY, initial, accepting }) =>
    [
      `<g transform="translate(${stateX} ${stateY})">`,
      initial ? `<circle cx="${arrowStart}" r="${INITIAL_DOT_RADIUS}" fill="${palette.line}" stroke="none"/>` : '',
      initial ? `<path d="M${arrowStart} 0H${-STATE_RADIUS}" fill="none" ${arrow}/>` : '',
      `<circle r="${STATE_RADIUS}"/>`,
      accepting ? `<circle r="${STATE_RADIUS - ACCEPTING_GAP}"/>` : '',
      `<text fill="${palette.text}" stroke="none">${escapeXml(name.slice(0, 1))}`,
      `<tspan dy="${NAME_INDEX_DROP}" font-size="${NAME_INDEX_FONT_SIZE}">${escapeXml(name.slice(1))}</tspan></text>`,
      '</g>',
    ].join(''),
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${size.width}" height="${size.height}">`,
    // The background reaches beyond the edges, so that no edge pixel is left half transparent.
    `<rect x="${x - 1}" y="${y - 1}" width="${width + 2}" height="${height + 2}" fill="${palette.surface}"/>`,
    '<defs>',
    `<marker id="resm-arrowhead" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="${ARROWHEAD_SIZE}" markerHeight="${ARROWHEAD_SIZE}" markerUnits="userSpaceOnUse" orient="auto">`,
    `<path d="${ARROWHEAD_PATH}" fill="${palette.line}" stroke="none"/>`,
    '</marker>',
    '</defs>',
    `<g fill="none" stroke="${palette.line}" stroke-width="${LINE_WIDTH}">${paths.join('')}</g>`,
    `<g font-family="${LABEL_FONT_FAMILY}" font-size="${LABEL_FONT_SIZE}" text-anchor="middle" dominant-baseline="central" fill="${palette.text}" stroke="${palette.surface}" stroke-width="${LABEL_HALO_WIDTH}" stroke-linejoin="round" paint-order="stroke">${labels.join('')}</g>`,
    `<g font-family="${NAME_FONT_FAMILY}" font-size="${NAME_FONT_SIZE}" text-anchor="middle" dominant-baseline="central" fill="${palette.state}" stroke="${palette.line}" stroke-width="${LINE_WIDTH}">${states.join('')}</g>`,
    `<text x="${scene.bounds.minX}" y="${scene.bounds.maxY + EXPORT_PADDING + CAPTION_HEIGHT / 2}" text-anchor="start" dominant-baseline="central" font-family="${LABEL_FONT_FAMILY}" font-size="${LABEL_FONT_SIZE}" fill="${palette.text}">${escapeXml(caption)}</text>`,
    '</svg>',
  ].join('');
}
