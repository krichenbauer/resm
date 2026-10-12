import { describe, expect, it } from 'vitest';
import {
  FIT_PADDING,
  MAX_SCALE,
  MIN_SCALE,
  adjustView,
  fitView,
  panBy,
  shows,
  toWorld,
  viewBoxOf,
  zoomAt,
} from './viewport.ts';

const bounds = { minX: 100, minY: 50, maxX: 300, maxY: 150 };
const area = { width: 1000, height: 600 };

describe('fitting a diagram into its area', () => {
  it('shows a small diagram at its natural size in the middle of the area', () => {
    expect(fitView(bounds, area)).toEqual({ x: 200, y: 100, scale: 1 });
  });

  it('shrinks a large diagram until it fits with padding on all sides', () => {
    const view = fitView(bounds, { width: 100, height: 400 });
    expect(view.scale).toBeCloseTo(100 / (200 + 2 * FIT_PADDING));
    expect(view.x).toBe(200);
    expect(view.y).toBe(100);
  });

  it('is limited by the height when that is the tighter side', () => {
    expect(fitView(bounds, { width: 2000, height: 50 }).scale).toBeCloseTo(50 / (100 + 2 * FIT_PADDING));
  });

  it('uses the natural size while the area has no size yet', () => {
    expect(fitView(bounds, { width: 0, height: 0 })).toEqual({ x: 200, y: 100, scale: 1 });
  });
});

describe('view', () => {
  it('maps to the part of the diagram plane that the area shows', () => {
    expect(viewBoxOf({ x: 200, y: 100, scale: 1 }, area)).toEqual({ x: -300, y: -200, width: 1000, height: 600 });
    expect(viewBoxOf({ x: 200, y: 100, scale: 2 }, area)).toEqual({ x: -50, y: -50, width: 500, height: 300 });
  });

  it('converts a point of the area to the diagram plane', () => {
    const view = { x: 200, y: 100, scale: 2 };
    expect(toWorld(view, area, { x: 500, y: 300 })).toEqual({ x: 200, y: 100 });
    expect(toWorld(view, area, { x: 0, y: 0 })).toEqual({ x: -50, y: -50 });
  });

  it('pans by a distance on screen', () => {
    expect(panBy({ x: 200, y: 100, scale: 2 }, 40, -20)).toEqual({ x: 180, y: 110, scale: 2 });
  });

  it('zooms around a point that stays where it is on screen', () => {
    const view = { x: 200, y: 100, scale: 1 };
    const pointer = { x: 750, y: 150 };
    const zoomed = zoomAt(view, area, pointer, 2);
    expect(zoomed.scale).toBe(2);
    expect(toWorld(zoomed, area, pointer).x).toBeCloseTo(toWorld(view, area, pointer).x);
    expect(toWorld(zoomed, area, pointer).y).toBeCloseTo(toWorld(view, area, pointer).y);
  });

  it('keeps the scale within its limits', () => {
    const view = { x: 0, y: 0, scale: 1 };
    expect(zoomAt(view, area, { x: 0, y: 0 }, 1000).scale).toBe(MAX_SCALE);
    expect(zoomAt(view, area, { x: 0, y: 0 }, 0.0001).scale).toBe(MIN_SCALE);
  });

  it('tells whether a diagram is entirely visible', () => {
    expect(shows({ x: 200, y: 100, scale: 1 }, area, bounds)).toBe(true);
    expect(shows({ x: 200, y: 100, scale: 5 }, area, bounds)).toBe(false);
    expect(shows({ x: 900, y: 100, scale: 1 }, area, bounds)).toBe(false);
    expect(shows({ x: 200, y: 100, scale: 1 }, { width: 0, height: 0 }, bounds)).toBe(false);
  });
});

describe('adjusting the view after the diagram changed', () => {
  it('leaves the view alone while the whole diagram is visible', () => {
    const view = { x: 250, y: 120, scale: 1.5 };
    expect(adjustView(view, area, bounds)).toBe(view);
  });

  it('zooms out to fit a diagram that has grown beyond the area', () => {
    const large = { minX: 0, minY: 0, maxX: 3000, maxY: 400 };
    const adjusted = adjustView({ x: 200, y: 100, scale: 1 }, area, large);
    expect(adjusted).toEqual(fitView(large, area));
    expect(shows(adjusted, area, large)).toBe(true);
  });

  it('zooms out even if the user had zoomed in', () => {
    expect(adjustView({ x: 200, y: 100, scale: 6 }, area, bounds)).toEqual({ x: 200, y: 100, scale: 1 });
  });

  it('only pans to a diagram that fits at the current scale but lies outside the area', () => {
    expect(adjustView({ x: 5000, y: 5000, scale: 0.5 }, area, bounds)).toEqual({ x: 200, y: 100, scale: 0.5 });
  });

  it('does not zoom in just because the diagram has shrunk', () => {
    const view = { x: 200, y: 100, scale: 0.5 };
    expect(adjustView(view, area, bounds)).toBe(view);
  });

  it('zooms in once the diagram has become tiny in the area', () => {
    const view = { x: 200, y: 100, scale: 0.2 };
    expect(adjustView(view, area, bounds)).toEqual({ x: 200, y: 100, scale: 1 });
  });
});
