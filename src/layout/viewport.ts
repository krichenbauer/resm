import type { Bounds } from './scene.ts';

/** Free space kept around a diagram that is fitted into its area. */
export const FIT_PADDING = 24;

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The part of the diagram plane to show so that everything within `bounds` is
 * visible and centered in an area of the given size. A diagram that is smaller
 * than the area keeps its natural size instead of being enlarged.
 */
export function fitViewBox(bounds: Bounds, area: { width: number; height: number }): ViewBox {
  const width = bounds.maxX - bounds.minX + 2 * FIT_PADDING;
  const height = bounds.maxY - bounds.minY + 2 * FIT_PADDING;
  if (area.width <= 0 || area.height <= 0) {
    return { x: bounds.minX - FIT_PADDING, y: bounds.minY - FIT_PADDING, width, height };
  }
  const scale = Math.min(1, area.width / width, area.height / height);
  const shown = { width: area.width / scale, height: area.height / scale };
  return {
    x: (bounds.minX + bounds.maxX) / 2 - shown.width / 2,
    y: (bounds.minY + bounds.maxY) / 2 - shown.height / 2,
    ...shown,
  };
}
