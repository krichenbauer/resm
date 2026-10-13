import type { EdgeShape } from '../layout/layout.ts';

/** Share of the remaining change that a shape covers per second, as a rate of exponential decay. */
const RATE = 10;

/** A shape is at rest when its bend or angle is this close to the target. */
const REST = 0.002;

/** The difference between two angles, taken the short way round. */
function turn(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Changes the shapes of edges gradually when a new layout bends them
 * differently, so that edges which stay do not jump. Edges are identified by
 * key; new edges take their shape at once.
 */
export class ShapeMotion {
  private keys: string[] = [];
  private shapes: EdgeShape[] = [];
  private targets: EdgeShape[] = [];
  private atRest = true;

  get settled(): boolean {
    return this.atRest;
  }

  current(): EdgeShape[] {
    return this.shapes;
  }

  setShapes(keys: readonly string[], shapes: readonly EdgeShape[], options: { animate: boolean }): void {
    const known = new Map(this.keys.map((key, index) => [key, this.shapes[index]]));
    this.shapes = shapes.map((target, index) => {
      const previous = options.animate ? known.get(keys[index] ?? '') : undefined;
      return previous?.kind === target.kind ? previous : target;
    });
    this.keys = [...keys];
    this.targets = [...shapes];
    this.atRest = this.shapes.every((shape, index) => shape === this.targets[index]);
  }

  /** Advances the motion by the given time in seconds. */
  step(seconds: number): void {
    if (this.atRest) return;
    const share = 1 - Math.exp(-RATE * seconds);
    this.shapes = this.shapes.map((shape, index) => {
      const target = this.targets[index];
      if (!target || shape === target) return target ?? shape;
      if (shape.kind === 'arc' && target.kind === 'arc') {
        const rest = target.bend - shape.bend;
        // The label slides along its edge. Changing sides has no in-between, so that happens at once.
        const slide = target.label && shape.label ? target.label.at - shape.label.at : 0;
        if (Math.abs(rest) < REST && Math.abs(slide) < REST) return target;
        const label = target.label && { side: target.label.side, at: target.label.at - slide * (1 - share) };
        return { kind: 'arc', bend: shape.bend + rest * share, ...(label ? { label } : {}) };
      }
      if (shape.kind === 'loop' && target.kind === 'loop') {
        const rest = turn(shape.angle, target.angle);
        return Math.abs(rest) < REST ? target : { kind: 'loop', angle: shape.angle + rest * share };
      }
      return target;
    });
    this.atRest = this.shapes.every((shape, index) => shape === this.targets[index]);
  }
}
