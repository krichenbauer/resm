import { describe, expect, it } from 'vitest';
import { STATE_RADIUS, arcGeometry, arcPoints, loopGeometry } from './geometry.ts';

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** The first and last point of a path such as `M1 2Q3 4 5 6`. */
function endpoints(path: string) {
  const numbers = [...path.matchAll(/-?\d+(\.\d+)?/g)].map((match) => Number(match[0]));
  return {
    start: { x: numbers[0] ?? NaN, y: numbers[1] ?? NaN },
    end: { x: numbers.at(-2) ?? NaN, y: numbers.at(-1) ?? NaN },
  };
}

describe('edge geometry', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 0 };

  it('draws an unbent edge as a straight line between the outlines of both states', () => {
    const { path, label } = arcGeometry(from, to, 0, 10);
    expect(path).toBe(`M${STATE_RADIUS} 0Q50 0 ${100 - STATE_RADIUS} 0`);
    expect(label.x).toBeCloseTo(50);
    expect(label.y).toBeLessThan(0);
  });

  it('bends towards the left of the direction of travel for a positive bend', () => {
    const forward = arcGeometry(from, to, 0.2, 10);
    const backward = arcGeometry(to, from, 0.2, 10);
    // In screen coordinates, left of "to the right" is up, which is negative y.
    expect(forward.label.y).toBeLessThan(-20);
    expect(backward.label.y).toBeGreaterThan(20);
    expect(arcGeometry(from, to, -0.2, 10).label.y).toBeGreaterThan(20);
  });

  it('starts and ends on the outlines of the states, whatever the bend', () => {
    for (const bend of [0, 0.15, -0.3, 0.6]) {
      for (const target of [to, { x: 30, y: -80 }, { x: -60, y: 45 }]) {
        const { start, end } = endpoints(arcGeometry(from, target, bend, 10).path);
        expect(distance(start, from)).toBeCloseTo(STATE_RADIUS, 1);
        expect(distance(end, target)).toBeCloseTo(STATE_RADIUS, 1);
      }
    }
  });

  it('keeps a wide label clear of a vertical edge', () => {
    const narrow = arcGeometry(from, { x: 0, y: 100 }, 0, 10);
    const wide = arcGeometry(from, { x: 0, y: 100 }, 0, 80);
    expect(Math.abs(wide.label.x)).toBeGreaterThan(Math.abs(narrow.label.x) + 30);
    expect(wide.label.y).toBeCloseTo(50);
  });

  it('samples points along the same curve that is drawn', () => {
    const points = arcPoints(from, to, 0.25, 5);
    const { start, end } = endpoints(arcGeometry(from, to, 0.25, 10).path);
    expect(points).toHaveLength(5);
    expect(distance(points[0] ?? from, start)).toBeLessThan(0.1);
    expect(distance(points[4] ?? from, end)).toBeLessThan(0.1);
    // The apex of the curve is at least the bend times the distance away from the straight line.
    expect(points[2]?.y).toBeLessThanOrEqual(-25);
    expect(points[2]?.y).toBeGreaterThan(-40);
  });

  it('draws a loop that leaves and re-enters the outline on the chosen side', () => {
    const center = { x: 10, y: 20 };
    for (const angle of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
      const { path, label } = loopGeometry(center, angle);
      const { start, end } = endpoints(path);
      expect(distance(start, center)).toBeCloseTo(STATE_RADIUS, 1);
      expect(distance(end, center)).toBeCloseTo(STATE_RADIUS, 1);
      expect(distance(start, end)).toBeGreaterThan(5);
      // The label sits beyond the loop, in the direction the loop points to.
      const along = (label.x - center.x) * Math.cos(angle) + (label.y - center.y) * Math.sin(angle);
      const across = -(label.x - center.x) * Math.sin(angle) + (label.y - center.y) * Math.cos(angle);
      expect(along).toBeGreaterThan(STATE_RADIUS * 2);
      expect(across).toBeCloseTo(0);
    }
  });
});
