import { describe, expect, it } from 'vitest';
import { FIT_PADDING, fitViewBox } from './viewport.ts';

const bounds = { minX: 100, minY: 50, maxX: 300, maxY: 150 };

describe('fitting a diagram into its area', () => {
  it('shows a small diagram at its natural size in the middle of the area', () => {
    const box = fitViewBox(bounds, { width: 1000, height: 600 });
    expect(box).toEqual({ x: 200 - 500, y: 100 - 300, width: 1000, height: 600 });
  });

  it('shrinks a large diagram until it fits with padding on all sides', () => {
    const box = fitViewBox(bounds, { width: 100, height: 400 });
    const scale = 100 / box.width;
    expect(scale).toBeCloseTo(100 / (200 + 2 * FIT_PADDING));
    expect(box.height * scale).toBeCloseTo(400);
    expect(box.x).toBeCloseTo(bounds.minX - FIT_PADDING);
    expect(box.x + box.width).toBeCloseTo(bounds.maxX + FIT_PADDING);
    // The diagram is centered in the direction that has room to spare.
    expect(box.y + box.height / 2).toBeCloseTo(100);
  });

  it('is limited by the height when that is the tighter side', () => {
    const box = fitViewBox(bounds, { width: 2000, height: 50 });
    expect(box.y).toBeCloseTo(bounds.minY - FIT_PADDING);
    expect(box.height).toBeCloseTo(100 + 2 * FIT_PADDING);
    expect(box.width / box.height).toBeCloseTo(2000 / 50);
  });

  it('falls back to the padded bounds while the area has no size yet', () => {
    expect(fitViewBox(bounds, { width: 0, height: 0 })).toEqual({
      x: 100 - FIT_PADDING,
      y: 50 - FIT_PADDING,
      width: 200 + 2 * FIT_PADDING,
      height: 100 + 2 * FIT_PADDING,
    });
  });
});
