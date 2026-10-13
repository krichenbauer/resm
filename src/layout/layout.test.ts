import { describe, expect, it } from 'vitest';
import { ORACLE_CORPUS } from '../automata/corpus.ts';
import type { Diagram } from '../diagram/diagram.ts';
import { DEFAULT_STATE_LIMIT, buildDiagram } from '../diagram/pipeline.ts';
import type { AlphabetMode } from '../settings/alphabet-mode.ts';
import { REPRESENTATIONS, type Representation } from '../settings/representation.ts';
import { STATE_RADIUS, arcPoints } from './geometry.ts';
import { findLabelCollisions } from './label-collisions.ts';
import { layoutDiagram } from './layout.ts';
import { buildScene } from './scene.ts';

function diagramOf(
  regex: string,
  representation: Representation = 'dfa',
  showSink = false,
  alphabet: AlphabetMode = 'ascii',
): Diagram {
  const result = buildDiagram({ regex, representation, showSink, stateLimit: DEFAULT_STATE_LIMIT, alphabet });
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

  it('keeps the states of a textbook DFA in a row and leads its back edges around them', () => {
    const diagram = diagramOf('(a|b)*abb', 'min-dfa');
    const { positions, shapes } = layoutDiagram(diagram);
    const xs = positions.map((position) => position.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(positions.map((position) => Math.round(position.y))).size).toBe(1);

    const bendOf = (id: string) => {
      const index = diagram.edges.findIndex(({ from, to }) => `${from}-${to}` === id);
      const shape = shapes[index];
      return shape?.kind === 'arc' ? shape.bend : undefined;
    };
    expect(bendOf('0-1')).toBe(0);
    expect(bendOf('3-0')).not.toBe(0);
    expect(bendOf('3-1')).not.toBe(0);
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

  it.each(CASES)('keeps labels off other states for $regex as $id (sink: $showSink)', ({ regex, id, showSink }) => {
    const diagram = diagramOf(regex, id, showSink);
    const { positions, shapes } = layoutDiagram(diagram);
    const scene = buildScene(diagram, positions, shapes);
    diagram.edges.forEach(({ from, to }, index) => {
      const label = scene.edges[index]?.label;
      if (!label || from === to) return;
      positions.forEach((position, state) => {
        if (state === from || state === to) return;
        expect(distance(label, position), `label of q${from} to q${to} near q${state}`).toBeGreaterThan(
          STATE_RADIUS + 6,
        );
      });
    });
  });

  it.each(CASES)('routes no edge through a loop for $regex as $id (sink: $showSink)', ({ regex, id, showSink }) => {
    const diagram = diagramOf(regex, id, showSink);
    const { positions, shapes } = layoutDiagram(diagram);
    const loops = diagram.edges.flatMap(({ from }, index) => {
      const shape = shapes[index];
      const center = positions[from];
      if (shape?.kind !== 'loop' || !center) return [];
      // The middle of the loop, between the outline of its state and its outermost point.
      const reach = STATE_RADIUS * 1.55;
      return [{ state: from, x: center.x + reach * Math.cos(shape.angle), y: center.y + reach * Math.sin(shape.angle) }];
    });
    diagram.edges.forEach(({ from, to }, index) => {
      const shape = shapes[index];
      const [start, end] = [positions[from], positions[to]];
      if (!shape || shape.kind !== 'arc' || !start || !end) return;
      for (const point of arcPoints(start, end, shape.bend, 24)) {
        for (const loop of loops) {
          if (loop.state === from || loop.state === to) continue;
          expect(distance(point, loop), `q${from} to q${to} near the loop of q${loop.state}`).toBeGreaterThan(12);
        }
      }
    });
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

describe('label placement', () => {
  /** Every corpus regex in every representation, over both alphabets. */
  const diagrams = (showSink: boolean) =>
    [...ORACLE_CORPUS.map(({ regex }) => regex), '(a|b)*abb(a|b)', '[a-z]+@[a-z]+\\.(com|org)', '(a|b)*a(a|b){3}'].flatMap(
      (regex) =>
        REPRESENTATIONS.flatMap(({ id }) =>
          (['derived', 'ascii'] as const).map((alphabet) => {
            const result = buildDiagram({ regex, representation: id, showSink, stateLimit: DEFAULT_STATE_LIMIT, alphabet });
            if (!result.ok) throw new Error(result.error.message);
            return { name: `${regex} as ${id} over ${alphabet}`, diagram: result.diagram };
          }),
        ),
    );

  it('keeps every label clear of other edges, other labels, and states', () => {
    for (const { name, diagram } of diagrams(false)) {
      expect(findLabelCollisions(diagram, layoutDiagram(diagram)), name).toEqual([]);
    }
  });

  it('keeps the labels of textbook automata readable with the sink state shown', () => {
    for (const regex of ['(a|b)*abb', 'ab', 'a|b', '(ab)*', '(a|b)*a(a|b)(a|b)', '(0|1(01*0)*1)*', '-?\\d+(\\.\\d+)?']) {
      for (const representation of ['dfa', 'min-dfa'] as const) {
        const diagram = diagramOf(regex, representation, true, 'derived');
        expect(findLabelCollisions(diagram, layoutDiagram(diagram)), `${regex} as ${representation}`).toEqual([]);
      }
    }
  });

  it('finds a free place for nearly all labels even where many edges meet at the sink state', () => {
    // Where wide labels crowd around the sink, a few cannot be placed freely.
    // This bound keeps that an exception.
    const all = diagrams(true);
    const obstructed = all.filter(({ diagram }) => findLabelCollisions(diagram, layoutDiagram(diagram)).length > 0);
    expect(obstructed.length / all.length).toBeLessThan(0.02);
  });

  it('prefers the middle of the edge on the outer side of its bend', () => {
    const diagram = diagramOf('ab');
    for (const shape of layoutDiagram(diagram).shapes) {
      expect(shape).toEqual({ kind: 'arc', bend: 0, label: { at: 0.5, side: 1 } });
    }
  });

  it('moves a label that an edge would run through', () => {
    // The edge from q0 to the sink passes where the label of the edge next to it would be.
    const diagram = diagramOf('^(a|b)c$', 'dfa', true, 'derived');
    const { shapes } = layoutDiagram(diagram);
    const moved = shapes.filter((shape) => shape.kind === 'arc' && shape.label?.at !== 0.5);
    expect(moved.length).toBeGreaterThan(0);
    expect(findLabelCollisions(diagram, layoutDiagram(diagram))).toEqual([]);
  });

  it('is deterministic', () => {
    const diagram = diagramOf('(a|b)*a(a|b)(a|b)', 'min-dfa', true);
    expect(layoutDiagram(diagram).shapes).toEqual(layoutDiagram(diagram).shapes);
  });
});

describe('layout of large diagrams', () => {
  const timed = (regex: string, representation: Representation, showSink: boolean, stateLimit = DEFAULT_STATE_LIMIT) => {
    const result = buildDiagram({ regex, representation, showSink, stateLimit, alphabet: 'ascii' });
    if (!result.ok) throw new Error(result.error.message);
    const started = performance.now();
    const layout = layoutDiagram(result.diagram);
    return { diagram: result.diagram, layout, milliseconds: performance.now() - started };
  };

  // Each case stresses something else: long chains, one state that all others
  // lead to, edges between almost all pairs of states, and many long back edges.
  it.each([
    ['a{199}', 'dfa', false],
    ['a{198}', 'dfa', true],
    ['(a?){60}', 'nfa', false],
    ['(a|b)*a(a|b){6}', 'min-dfa', false],
    ['(a|b)*a(a|b){6}', 'min-dfa', true],
    ['((a|b)(c|d)){16}', 'enfa', false],
  ] as const)('is quick for %s as %s (sink: %s)', (regex, representation, showSink) => {
    const { diagram, layout, milliseconds } = timed(regex, representation, showSink);
    expect(layout.positions).toHaveLength(diagram.states.length);
    expect(milliseconds).toBeLessThan(1500);
  });

  it('keeps all states apart', () => {
    for (const [regex, representation, showSink] of [
      ['a{198}', 'dfa', true],
      ['(a?){60}', 'nfa', false],
      ['(a|b)*a(a|b){6}', 'min-dfa', true],
    ] as const) {
      const { positions } = timed(regex, representation, showSink).layout;
      for (let a = 0; a < positions.length; a++) {
        for (let b = a + 1; b < positions.length; b++) {
          const [first, second] = [positions[a], positions[b]];
          if (!first || !second) throw new Error('missing position');
          expect(distance(first, second), `${regex}: q${a} and q${b}`).toBeGreaterThanOrEqual(STATE_RADIUS * 2 + 10);
        }
      }
    }
  });

  it('puts the sink state below the other states, where every state can reach it', () => {
    const { diagram, layout } = timed('a{20}', 'dfa', true);
    const sink = layout.positions.at(-1);
    const others = layout.positions.slice(0, -1);
    if (!sink) throw new Error('missing sink');
    expect(diagram.sink).toBe(diagram.states.length - 1);
    expect(sink.y).toBeGreaterThan(Math.max(...others.map((position) => position.y)) + STATE_RADIUS * 2);
    const xs = others.map((position) => position.x);
    expect(sink.x).toBeGreaterThan(Math.min(...xs));
    expect(sink.x).toBeLessThan(Math.max(...xs));
  });
});
