import { describe, expect, it } from 'vitest';
import type { Automaton } from '../automata/automaton.ts';
import { determinize } from '../automata/determinize.ts';
import { removeEpsilons } from '../automata/epsilon-removal.ts';
import { complete, minimize } from '../automata/minimize.ts';
import { TEST_STATE_BUDGET, epsilonNfa } from '../automata/test-support.ts';
import { CharSet } from '../regex/charset.ts';
import { type Diagram, toDiagram } from './diagram.ts';

const dfa = (regex: string) => determinize(removeEpsilons(epsilonNfa(regex)), TEST_STATE_BUDGET);

/** States as `q0` with `>` for initial and `*` for accepting, e.g. `>q0`, `q2*`. */
const states = (diagram: Diagram) =>
  diagram.states.map(({ name, initial, accepting }) => `${initial ? '>' : ''}${name}${accepting ? '*' : ''}`);

/** Edges as `q0 -a-> q1`. */
const edges = (diagram: Diagram) =>
  diagram.edges.map(({ from, to, label }) => `${diagram.states[from]?.name} -${label}-> ${diagram.states[to]?.name}`);

describe('diagram', () => {
  it('names the states q0, q1, ... breadth-first from the initial state, in alphabet order', () => {
    const scrambled: Automaton = {
      stateCount: 4,
      start: 2,
      accepting: new Set([0]),
      transitions: [
        { from: 0, to: 3, set: CharSet.of('d') },
        { from: 2, to: 0, set: CharSet.of('b') },
        { from: 2, to: 1, set: CharSet.of('a') },
        { from: 1, to: 3, set: CharSet.of('c') },
      ],
    };
    const diagram = toDiagram(scrambled);
    expect(states(diagram)).toEqual(['>q0', 'q1', 'q2*', 'q3']);
    expect(edges(diagram)).toEqual(['q0 -a-> q1', 'q0 -b-> q2', 'q1 -c-> q3', 'q2 -d-> q3']);
  });

  it('follows ε-transitions in the order of the regex', () => {
    const diagram = toDiagram(epsilonNfa('a|b'));
    expect(states(diagram)).toEqual(['>q0', 'q1', 'q2', 'q3', 'q4', 'q5*']);
    expect(edges(diagram)).toEqual([
      'q0 -ε-> q1',
      'q0 -ε-> q2',
      'q1 -a-> q3',
      'q2 -b-> q4',
      'q3 -ε-> q5',
      'q4 -ε-> q5',
    ]);
  });

  it('shows the empty regex as a single state that is initial and accepting', () => {
    const diagram = toDiagram(dfa(''));
    expect(states(diagram)).toEqual(['>q0*']);
    expect(edges(diagram)).toEqual([]);
  });

  it('draws a loop as an edge from a state to itself', () => {
    const diagram = toDiagram(minimize(dfa('a*'), { keepSink: false }));
    expect(states(diagram)).toEqual(['>q0*']);
    expect(edges(diagram)).toEqual(['q0 -a-> q0']);
  });

  it('combines all transitions between the same two states into one edge', () => {
    const parallel: Automaton = {
      stateCount: 2,
      start: 0,
      accepting: new Set([1]),
      transitions: [
        { from: 0, to: 1, set: CharSet.of('a') },
        { from: 0, to: 1, set: null },
        { from: 0, to: 1, set: CharSet.of('c') },
        { from: 1, to: 0, set: CharSet.range('0', '9') },
      ],
    };
    expect(edges(toDiagram(parallel))).toEqual(['q0 -ε, [ac]-> q1', 'q1 -\\d-> q0']);
  });

  it('keeps states that nothing leads to', () => {
    const diagram = toDiagram(epsilonNfa('[^\\s\\S]'));
    expect(states(diagram)).toEqual(['>q0', 'q1*']);
    expect(edges(diagram)).toEqual([]);
  });

  it('names the sink last, so showing it does not rename the other states', () => {
    const hidden = toDiagram(dfa('ab'));
    const shown = toDiagram(complete(dfa('ab')));
    expect(states(hidden)).toEqual(['>q0', 'q1', 'q2*']);
    expect(states(shown)).toEqual(['>q0', 'q1', 'q2*', 'q3']);
    expect(edges(shown)).toEqual([
      'q0 -a-> q1',
      'q0 -[^a]-> q3',
      'q1 -b-> q2',
      'q1 -[^b]-> q3',
      'q2 -[\\x00-\\x7f]-> q3',
      'q3 -[\\x00-\\x7f]-> q3',
    ]);

    const minimalShown = toDiagram(minimize(dfa('(a|b)*abb'), { keepSink: true }));
    expect(states(minimalShown)).toEqual(['>q0', 'q1', 'q2', 'q3*', 'q4']);
    expect(edges(minimalShown).filter((edge) => edge.endsWith('q4'))).toEqual([
      'q0 -[^ab]-> q4',
      'q1 -[^ab]-> q4',
      'q2 -[^ab]-> q4',
      'q3 -[^ab]-> q4',
      'q4 -[\\x00-\\x7f]-> q4',
    ]);
  });
});
