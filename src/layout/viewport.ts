import type { Point } from './geometry.ts';
import type { Bounds } from './scene.ts';

/** Free space kept around a diagram that is fitted into its area, in diagram units. */
export const FIT_PADDING = 24;

/** Limits of the scale that zooming can reach. */
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 4;

/** Free space, in screen pixels, that a diagram needs around it to count as entirely visible. */
const VISIBLE_MARGIN = 4;

/** A diagram that would be this many times larger when fitted has become too small to read. */
const ZOOM_IN_FACTOR = 2.5;

/** Size of the area that shows the diagram, in screen pixels. */
export interface Area {
  readonly width: number;
  readonly height: number;
}

/** What the area shows: the point of the diagram plane at its center, and screen pixels per diagram unit. */
export interface View {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The part of the diagram plane that the area shows, as an SVG view box. */
export function viewBoxOf(view: View, area: Area): ViewBox {
  const width = area.width / view.scale;
  const height = area.height / view.scale;
  return { x: view.x - width / 2, y: view.y - height / 2, width, height };
}

/** The point of the diagram plane under a point of the area. */
export function toWorld(view: View, area: Area, point: Point): Point {
  return {
    x: view.x + (point.x - area.width / 2) / view.scale,
    y: view.y + (point.y - area.height / 2) / view.scale,
  };
}

/** Moves the diagram by a distance on screen. */
export function panBy(view: View, dx: number, dy: number): View {
  return { x: view.x - dx / view.scale, y: view.y - dy / view.scale, scale: view.scale };
}

/** Zooms by `factor` so that the diagram point under `point` stays where it is on screen. */
export function zoomAt(view: View, area: Area, point: Point, factor: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const anchor = toWorld(view, area, point);
  return {
    x: anchor.x - (point.x - area.width / 2) / scale,
    y: anchor.y - (point.y - area.height / 2) / scale,
    scale,
  };
}

/**
 * The view that shows everything within `bounds`, centered and with padding.
 * A diagram that is smaller than the area keeps its natural size instead of
 * being enlarged.
 */
export function fitView(bounds: Bounds, area: Area): View {
  const width = bounds.maxX - bounds.minX + 2 * FIT_PADDING;
  const height = bounds.maxY - bounds.minY + 2 * FIT_PADDING;
  const scale = area.width > 0 && area.height > 0 ? Math.min(1, area.width / width, area.height / height) : 1;
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, scale };
}

/** Whether everything within `bounds` is visible. */
export function shows(view: View, area: Area, bounds: Bounds): boolean {
  if (area.width <= 0 || area.height <= 0) return false;
  const box = viewBoxOf(view, area);
  const margin = VISIBLE_MARGIN / view.scale;
  return (
    bounds.minX - margin >= box.x &&
    bounds.minY - margin >= box.y &&
    bounds.maxX + margin <= box.x + box.width &&
    bounds.maxY + margin <= box.y + box.height
  );
}

/**
 * The view to show after the diagram changed. It is the current view, the
 * very same object, unless a change is needed: a diagram that is not entirely
 * visible is centered and, if it does not fit, zoomed out. A diagram that has
 * merely shrunk is left alone; the view only zooms in again once the diagram
 * has become tiny in its area.
 */
export function adjustView(view: View, area: Area, bounds: Bounds): View {
  const fit = fitView(bounds, area);
  if (fit.scale > view.scale * ZOOM_IN_FACTOR) return fit;
  if (shows(view, area, bounds)) return view;
  return { ...fit, scale: Math.min(view.scale, fit.scale) };
}
