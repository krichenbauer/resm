import { describe, expect, it } from 'vitest';
import { STATE_RADIUS } from '../layout/geometry.ts';
import { Simulation } from './simulation.ts';

const FRAME = 1 / 60;

/** A chain a - b - c with 100 units between neighbors, shifted by `dx`. */
const chain = (dx = 0) => ({
  nodes: [
    { key: 'a', target: { x: dx, y: 0 } },
    { key: 'b', target: { x: dx + 100, y: 0 } },
    { key: 'c', target: { x: dx + 200, y: 0 } },
  ],
  links: [
    [0, 1],
    [1, 2],
  ] as const,
});

function started(dx = 0): Simulation {
  const simulation = new Simulation();
  const { nodes, links } = chain(dx);
  simulation.setGraph(nodes, links, { animate: false });
  return simulation;
}

function run(simulation: Simulation, seconds: number, onFrame?: () => void): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    simulation.step(FRAME);
    onFrame?.();
  }
}

describe('spring simulation', () => {
  it('starts at rest in the target positions', () => {
    const simulation = started();
    expect(simulation.positions()).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ]);
    expect(simulation.settled).toBe(true);
  });

  it('moves known nodes from where they are to their new targets and comes to rest there', () => {
    const simulation = started();
    const { nodes, links } = chain(300);
    simulation.setGraph(nodes, links, { animate: true });
    expect(simulation.positions()[0]).toEqual({ x: 0, y: 0 });
    expect(simulation.settled).toBe(false);

    run(simulation, 6);
    expect(simulation.settled).toBe(true);
    expect(simulation.positions()).toEqual(nodes.map((node) => node.target));
  });

  it('moves continuously instead of jumping', () => {
    const simulation = started();
    const { nodes, links } = chain(300);
    simulation.setGraph(nodes, links, { animate: true });
    let previous = simulation.positions()[0]?.x ?? 0;
    let largestStep = 0;
    run(simulation, 3, () => {
      const current = simulation.positions()[0]?.x ?? 0;
      largestStep = Math.max(largestStep, Math.abs(current - previous));
      previous = current;
    });
    expect(largestStep).toBeGreaterThan(1);
    expect(largestStep).toBeLessThan(30);
  });

  it('overshoots a little before it settles, like a spring', () => {
    const simulation = started();
    const { nodes, links } = chain(300);
    simulation.setGraph(nodes, links, { animate: true });
    let farthest = 0;
    run(simulation, 3, () => {
      farthest = Math.max(farthest, simulation.positions()[0]?.x ?? 0);
    });
    expect(farthest).toBeGreaterThan(300 * 1.01);
    expect(farthest).toBeLessThan(300 * 1.25);
  });

  it('lets a new node grow out of the node that leads to it', () => {
    const simulation = started();
    const { nodes, links } = chain();
    simulation.setGraph(
      [...nodes, { key: 'd', target: { x: 300, y: 0 } }],
      [...links, [2, 3]],
      { animate: true },
    );
    const spawn = simulation.positions()[3];
    expect(spawn?.x).toBeGreaterThan(200);
    expect(spawn?.x).toBeLessThan(230);
    expect(spawn?.y).toBe(0);

    run(simulation, 6);
    expect(simulation.positions()[3]).toEqual({ x: 300, y: 0 });
  });

  it('lets a chain of new nodes unfold from the last known node', () => {
    const simulation = started();
    const { nodes, links } = chain();
    simulation.setGraph(
      [...nodes, { key: 'd', target: { x: 300, y: 0 } }, { key: 'e', target: { x: 400, y: 0 } }],
      [...links, [2, 3], [3, 4]],
      { animate: true },
    );
    const [, , c, d, e] = simulation.positions();
    expect(d?.x).toBeGreaterThan(c?.x ?? NaN);
    expect(e?.x).toBeGreaterThan(d?.x ?? NaN);
    expect(e?.x).toBeLessThan(260);
  });

  it('forgets nodes that are gone and identifies the others by key, not by position in the list', () => {
    const simulation = started();
    simulation.setGraph(
      [
        { key: 'c', target: { x: 0, y: 50 } },
        { key: 'a', target: { x: 100, y: 50 } },
      ],
      [[0, 1]],
      { animate: true },
    );
    expect(simulation.positions()).toEqual([
      { x: 200, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it('puts everything in place at once when asked not to animate', () => {
    const simulation = started();
    const { nodes, links } = chain(300);
    simulation.setGraph(nodes, links, { animate: false });
    expect(simulation.positions()).toEqual(nodes.map((node) => node.target));
    expect(simulation.settled).toBe(true);
  });

  it('holds a grabbed node where it is put and pulls its neighbors along', () => {
    const simulation = started();
    simulation.grab(1);
    simulation.moveTo(1, { x: 100, y: 150 });
    expect(simulation.settled).toBe(false);
    run(simulation, 1);

    const [a, b, c] = simulation.positions();
    expect(b).toEqual({ x: 100, y: 150 });
    expect(a?.y).toBeGreaterThan(10);
    expect(a?.y).toBeLessThan(140);
    expect(c?.y).toBeCloseTo(a?.y ?? NaN, 5);
    expect(simulation.settled).toBe(false);
  });

  it('pulls directly connected nodes harder than distant ones', () => {
    const simulation = started();
    simulation.grab(0);
    simulation.moveTo(0, { x: 0, y: 150 });
    run(simulation, 1);
    const [, b, c] = simulation.positions();
    expect(b?.y).toBeGreaterThan((c?.y ?? NaN) + 5);
    expect(c?.y).toBeGreaterThan(1);
  });

  it('does not pin a released node: everything returns to its target', () => {
    const simulation = started();
    simulation.grab(1);
    simulation.moveTo(1, { x: 160, y: 150 });
    run(simulation, 0.5);
    simulation.release(1);
    run(simulation, 6);
    expect(simulation.settled).toBe(true);
    expect(simulation.positions()).toEqual(chain().nodes.map((node) => node.target));
  });

  it('keeps nodes from being pushed into each other', () => {
    const simulation = started();
    simulation.grab(0);
    simulation.moveTo(0, { x: 100, y: 5 });
    run(simulation, 1);
    const [a, b] = simulation.positions();
    expect(Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))).toBeGreaterThan(STATE_RADIUS);
  });

  it('is deterministic', () => {
    const trace = () => {
      const simulation = started();
      const { nodes, links } = chain(300);
      simulation.setGraph(nodes, links, { animate: true });
      run(simulation, 0.5);
      return simulation.positions();
    };
    expect(trace()).toEqual(trace());
  });

  it('stays stable for a node with hundreds of connections and after a long pause', () => {
    const simulation = new Simulation();
    const count = 400;
    const nodes = Array.from({ length: count }, (_, index) => ({
      key: String(index),
      target: { x: (index % 20) * 80, y: Math.floor(index / 20) * 80 },
    }));
    const links = nodes.slice(1).map((_, index) => [0, index + 1] as const);
    simulation.setGraph(nodes, links, { animate: false });
    simulation.grab(0);
    simulation.moveTo(0, { x: 5000, y: -3000 });
    simulation.step(30);
    run(simulation, 2);
    simulation.release(0);
    run(simulation, 8);
    for (const { x, y } of simulation.positions()) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(Math.abs(x)).toBeLessThan(10_000);
    }
    expect(simulation.settled).toBe(true);
  });

  it('advances a diagram at the state limit much faster than real time', () => {
    const simulation = new Simulation();
    const nodes = Array.from({ length: 200 }, (_, index) => ({
      key: String(index),
      target: { x: (index % 20) * 80, y: Math.floor(index / 20) * 80 },
    }));
    const links = nodes.slice(1).flatMap((_, index) => [[index, index + 1], [index + 1, index % 7]] as const);
    simulation.setGraph(nodes, links, { animate: false });
    simulation.grab(0);
    simulation.moveTo(0, { x: -500, y: -500 });

    const started = performance.now();
    run(simulation, 2);
    // Two seconds of animation are 120 frames; each must take well under a frame's 16 ms.
    expect((performance.now() - started) / 120).toBeLessThan(4);
  });
});
