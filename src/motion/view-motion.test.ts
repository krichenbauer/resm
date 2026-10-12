import { describe, expect, it } from 'vitest';
import { ViewMotion } from './view-motion.ts';

const FRAME = 1 / 60;

describe('view motion', () => {
  it('starts at rest', () => {
    const motion = new ViewMotion({ x: 10, y: 20, scale: 1 });
    expect(motion.current).toEqual({ x: 10, y: 20, scale: 1 });
    expect(motion.settled).toBe(true);
  });

  it('jumps without animation', () => {
    const motion = new ViewMotion({ x: 0, y: 0, scale: 1 });
    motion.jumpTo({ x: 500, y: 100, scale: 2 });
    expect(motion.current).toEqual({ x: 500, y: 100, scale: 2 });
    expect(motion.settled).toBe(true);
  });

  it('glides smoothly to a new view and comes to rest exactly there', () => {
    const motion = new ViewMotion({ x: 0, y: 0, scale: 1 });
    const target = { x: 600, y: -200, scale: 0.25 };
    motion.glideTo(target);
    expect(motion.settled).toBe(false);

    motion.step(FRAME);
    expect(motion.current.x).toBeGreaterThan(0);
    expect(motion.current.x).toBeLessThan(150);
    expect(motion.current.scale).toBeLessThan(1);
    expect(motion.current.scale).toBeGreaterThan(0.7);

    let previous = motion.current.x;
    for (let frame = 0; frame < 180; frame++) {
      motion.step(FRAME);
      expect(motion.current.x).toBeGreaterThanOrEqual(previous);
      previous = motion.current.x;
    }
    expect(motion.settled).toBe(true);
    expect(motion.current).toEqual(target);
  });

  it('stops gliding when the view is set directly', () => {
    const motion = new ViewMotion({ x: 0, y: 0, scale: 1 });
    motion.glideTo({ x: 600, y: 0, scale: 1 });
    motion.step(FRAME);
    motion.jumpTo({ x: 50, y: 0, scale: 1 });
    motion.step(1);
    expect(motion.current).toEqual({ x: 50, y: 0, scale: 1 });
  });

  it('reports where it is heading', () => {
    const motion = new ViewMotion({ x: 0, y: 0, scale: 1 });
    motion.glideTo({ x: 600, y: 0, scale: 1 });
    motion.step(FRAME);
    expect(motion.destination).toEqual({ x: 600, y: 0, scale: 1 });
  });
});
