import { describe, expect, it } from 'vitest';
import { ShapeMotion } from './shape-motion.ts';

const FRAME = 1 / 60;

describe('shape motion', () => {
  it('shows new edges in their final shape at once', () => {
    const motion = new ShapeMotion();
    motion.setShapes(['a', 'b'], [{ kind: 'arc', bend: 0.2 }, { kind: 'loop', angle: 1 }], { animate: true });
    expect(motion.current()).toEqual([
      { kind: 'arc', bend: 0.2 },
      { kind: 'loop', angle: 1 },
    ]);
    expect(motion.settled).toBe(true);
  });

  it('bends a known edge gradually into its new shape', () => {
    const motion = new ShapeMotion();
    motion.setShapes(['a'], [{ kind: 'arc', bend: 0 }], { animate: true });
    motion.setShapes(['a'], [{ kind: 'arc', bend: 0.4 }], { animate: true });
    expect(motion.current()).toEqual([{ kind: 'arc', bend: 0 }]);
    expect(motion.settled).toBe(false);

    motion.step(FRAME);
    const [early] = motion.current();
    expect(early?.kind === 'arc' && early.bend > 0 && early.bend < 0.2).toBe(true);

    for (let frame = 0; frame < 120; frame++) motion.step(FRAME);
    expect(motion.current()).toEqual([{ kind: 'arc', bend: 0.4 }]);
    expect(motion.settled).toBe(true);
  });

  it('turns a loop the short way round', () => {
    const motion = new ShapeMotion();
    motion.setShapes(['a'], [{ kind: 'loop', angle: (-3 * Math.PI) / 4 }], { animate: true });
    motion.setShapes(['a'], [{ kind: 'loop', angle: Math.PI }], { animate: true });
    motion.step(FRAME);
    const [shape] = motion.current();
    // From -135° to 180° the short way leads through -180°, not through 0°.
    expect(shape?.kind === 'loop' && shape.angle < (-3 * Math.PI) / 4).toBe(true);

    for (let frame = 0; frame < 120; frame++) motion.step(FRAME);
    expect(motion.current()).toEqual([{ kind: 'loop', angle: Math.PI }]);
  });

  it('identifies edges by key and forgets those that are gone', () => {
    const motion = new ShapeMotion();
    motion.setShapes(['a', 'b'], [{ kind: 'arc', bend: 0 }, { kind: 'arc', bend: 0.3 }], { animate: true });
    motion.setShapes(['b', 'c'], [{ kind: 'arc', bend: 0.1 }, { kind: 'arc', bend: -0.2 }], { animate: true });
    expect(motion.current()).toEqual([
      { kind: 'arc', bend: 0.3 },
      { kind: 'arc', bend: -0.2 },
    ]);
  });

  it('changes at once when asked not to animate or when the kind of shape changes', () => {
    const motion = new ShapeMotion();
    motion.setShapes(['a', 'b'], [{ kind: 'arc', bend: 0 }, { kind: 'arc', bend: 0 }], { animate: true });
    motion.setShapes(['a', 'b'], [{ kind: 'arc', bend: 0.4 }, { kind: 'arc', bend: 0.4 }], { animate: false });
    expect(motion.settled).toBe(true);
    motion.setShapes(['a'], [{ kind: 'loop', angle: 1 }], { animate: true });
    expect(motion.current()).toEqual([{ kind: 'loop', angle: 1 }]);
  });
});
