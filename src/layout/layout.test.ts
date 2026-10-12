import { describe, expect, it } from 'vitest';
import { ORACLE_CORPUS } from '../automata/corpus.ts';
import type { Diagram } from '../diagram/diagram.ts';
import { DEFAULT_STATE_LIMIT, buildDiagram } from '../diagram/pipeline.ts';
import { REPRESENTATIONS, type Representation } from '../settings/representation.ts';
import { STATE_RADIUS, arcPoints } from './geometry.ts';
import { layoutDiagram } from './layout.ts';

function diagramOf(regex: string, representation: Representation = 'dfa', showSink = false): Diagram {
  const result = buildDiagram({ regex, representation, showSink, stateLimit: DEFAULT_STATE_LIMIT });
  if (!result.ok) throw new Error(result.error.message);
  return result.diagram;
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Every corpus regex in every representation, with and without the sink state. */
const CASES = ORACLE_CORPUS.flatMap(({ regex }) =>
  REPRESENTATIONS.flatMap(({ id }) => [false, true].map((showSink) => ({ regex, id, showSink }))),
);

describe('layout', () => {
  it('places every state and shapes every edge', () => {
    const diagram = diagramOf('(a|b)*abb');
    const layout = layoutDiagram(diagram);
    expect(layout.positions).toHaveLength(diagram.states.length);
    expect(layout.shapes).toHaveLength(diagram.edges.length);
  });

  it('places the single state of the empty regex', () => {
    const layout = layoutDiagram(diagramOf(''));
    expect(layout.positions).toHaveLength(1);
    expect(Number.isFinite(layout.positions[0]?.x)).toBe(true);
    expect(layout.shapes).toEqual([]);
  });

  it('lays out a chain from left to right on one line', () => {
    const { positions } = layoutDiagram(diagramOf('abc'));
    const xs = positions.map((position) => position.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(4);
    expect(new Set(positions.map((position) => Math.round(position.y))).size).toBe(1);
  });

  it('puts the initial state at the left edge', () => {
    for (const regex of ['(a|b)*abb', '(0|1(01*0)*1)*', 'a(b|c)*d', '-?\\d+(\\.\\d+)?', '(ab)*']) {
      for (const { id } of REPRESENTATIONS) {
        const { positions } = layoutDiagram(diagramOf(regex, id));
        const leftmost = Math.min(...positions.map((position) => position.x));
        expect(positions[0]?.x, `${regex} as ${id}`).toBe(leftmost);
      }
    }
  });

  it('is deterministic', () => {
    const diagram = diagramOf('(a|b)*a(a|b)(a|b)');
    expect(layoutDiagram(diagram)).toEqual(layoutDiagram(diagram));
  });

  it('draws a transition from a state to itself as a loop and all others as arcs', () => {
    const diagram = diagramOf('a*b');
    const { shapes } = layoutDiagram(diagram);
    diagram.edges.forEach((edge, index) => {
      expect(shapes[index]?.kind).toBe(edge.from === edge.to ? 'loop' : 'arc');
    });
  });

  it('points a loop upwards when nothing is in the way', () => {
    const { shapes } = layoutDiagram(diagramOf('a*', 'min-dfa'));
    expect(shapes).toEqual([{ kind: 'loop', angle: -Math.PI / 2 }]);
  });

  it('bends the two edges between a pair of states apart', () => {
    const diagram = diagramOf('(ab)*', 'min-dfa');
    const { shapes } = layoutDiagram(diagram);
    expect(diagram.edges.map(({ from, to }) => `${from}-${to}`)).toEqual(['0-1', '1-0']);
    for (const shape of shapes) expect(shape.kind === 'arc' && shape.bend > 0).toBe(true);
  });

  it.each(CASES)('keeps states apart for $regex as $id (sink: $showSink)', ({ regex, id, showSink }) => {
    const { positions } = layoutDiagram(diagramOf(regex, id, showSink));
    for (let a = 0; a < positions.length; a++) {
      for (let b = a + 1; b < positions.length; b++) {
        const [first, second] = [positions[a], positions[b]];
        if (!first || !second) throw new Error('missing position');
        expect(distance(first, second), `q${a} and q${b}`).toBeGreaterThanOrEqual(STATE_RADIUS * 2 + 10);
      }
    }
  });

  it.each(CASES)('routes no edge through a state for $regex as $id (sink: $showSink)', ({ regex, id, showSink }) => {
    const diagram = diagramOf(regex, id, showSink);
    const { positions, shapes } = layoutDiagram(diagram);
    diagram.edges.forEach(({ from, to }, index) => {
      const shape = shapes[index];
      const [start, end] = [positions[from], positions[to]];
      if (!shape || shape.kind !== 'arc' || !start || !end) return;
      for (const point of arcPoints(start, end, shape.bend, 24)) {
        positions.forEach((position, state) => {
          if (state === from || state === to) return;
          expect(distance(point, position), `q${from} to q${to} near q${state}`).toBeGreaterThan(STATE_RADIUS);
        });
      }
    });
  });
});
