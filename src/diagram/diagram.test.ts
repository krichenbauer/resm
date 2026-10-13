import { describe, expect, it } from 'vitest';
import type { Automaton } from '../automata/automaton.ts';
import { ORACLE_CORPUS } from '../automata/corpus.ts';
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

  describe('state keys', () => {
    const keys = (automaton: Automaton) => toDiagram(automaton).states.map((state) => state.key);

    it('identify a state by the path that first leads to it, so that it survives an edit', () => {
      const before = keys(dfa('ab'));
      const after = keys(dfa('abc'));
      expect(after.slice(0, 3)).toEqual(before);
      expect(before).not.toContain(after[3]);
    });

    it('differ for a state that is reached by a different path', () => {
      const before = keys(dfa('ab'));
      const after = keys(dfa('axb'));
      expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
      expect(after).not.toContain(before[2]);
    });

    it('tell apart states that the same input leads to', () => {
      const nfaKeys = keys(removeEpsilons(epsilonNfa('a|ab')));
      expect(new Set(nfaKeys).size).toBe(nfaKeys.length);
      const branches = keys(epsilonNfa('a|b'));
      expect(new Set(branches).size).toBe(6);
    });

    it('give the sink the same key in every diagram', () => {
      const short = toDiagram(complete(dfa('ab')));
      const long = toDiagram(complete(dfa('abc')));
      expect(short.states.at(-1)?.key).toBe(long.states.at(-1)?.key);
      expect(keys(dfa('abc'))).not.toContain(long.states.at(-1)?.key);
    });

    it('are unique within every diagram', () => {
      for (const { regex } of ORACLE_CORPUS) {
        const automata = [
          epsilonNfa(regex),
          removeEpsilons(epsilonNfa(regex)),
          dfa(regex),
          complete(dfa(regex)),
          minimize(dfa(regex), { keepSink: true }),
        ];
        for (const automaton of automata) {
          const all = keys(automaton);
          expect(new Set(all).size, regex).toBe(all.length);
        }
      }
    });
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
      'q2 -Σ-> q3',
      'q3 -Σ-> q3',
    ]);

    const minimalShown = toDiagram(minimize(dfa('(a|b)*abb'), { keepSink: true }));
    expect(states(minimalShown)).toEqual(['>q0', 'q1', 'q2', 'q3*', 'q4']);
    expect(edges(minimalShown).filter((edge) => edge.endsWith('q4'))).toEqual([
      'q0 -[^ab]-> q4',
      'q1 -[^ab]-> q4',
      'q2 -[^ab]-> q4',
      'q3 -[^ab]-> q4',
      'q4 -Σ-> q4',
    ]);
  });
});
