import { describe, expect, it } from 'vitest';
import { CharSet } from '../regex/charset.ts';
import type { Automaton } from './automaton.ts';
import { ORACLE_CORPUS } from './corpus.ts';
import { determinize } from './determinize.ts';
import { removeEpsilons } from './epsilon-removal.ts';
import { complete, minimize } from './minimize.ts';
import { TEST_STATE_BUDGET, describeTransitions, epsilonNfa } from './test-support.ts';

const dfa = (regex: string) => determinize(removeEpsilons(epsilonNfa(regex)), TEST_STATE_BUDGET);
const minimal = (regex: string, keepSink = false) => minimize(dfa(regex), { keepSink });

const ALL = '[\\x00-\\x7f]';

describe('completion', () => {
  it('adds a sink state that collects every missing transition', () => {
    const result = complete(dfa('a'));
    expect(result.stateCount).toBe(3);
    expect(describeTransitions(result)).toEqual([
      "0 -'a'-> 1",
      '0 -[\\x00-`b-\\x7f]-> 2',
      `1 -${ALL}-> 2`,
      `2 -${ALL}-> 2`,
    ]);
    expect([...result.accepting]).toEqual([1]);
  });

  it('leaves a DFA alone that already has every transition', () => {
    const input = dfa('[\\s\\S]*');
    expect(complete(input)).toBe(input);
  });

  it('gives every state a transition for every character', () => {
    for (const { regex } of ORACLE_CORPUS) {
      const result = complete(dfa(regex));
      for (let state = 0; state < result.stateCount; state++) {
        const covered = result.transitions
          .filter(({ from }) => from === state)
          .reduce((union, { set }) => union.union(set ?? CharSet.EMPTY), CharSet.EMPTY);
        expect(covered.equals(CharSet.ALL), `${regex}, state ${state}`).toBe(true);
      }
    }
  });
});

describe('minimization', () => {
  it.each([
    ['', 1],
    ['a', 2],
    ['ab', 3],
    ['a|b', 2],
    ['a*', 1],
    ['a+', 2],
    ['a?', 2],
    ['(a*)*', 1],
    ['(a|)+', 1],
    ['a{2,4}', 5],
    ['(a|b)*abb', 4],
    ['(a|b)*a(a|b)(a|b)', 8],
    ['(a|b)*a(a|b){3}', 16],
    ['(ab|a)(bc|c)?', 5],
    ['(0|1(01*0)*1)*', 3],
    ['-?\\d+(\\.\\d+)?', 5],
    ['[^\\s\\S]', 1],
    ['a[^\\d\\D]|b', 2],
  ])('reduces %s to its %i distinguishable states', (regex, states) => {
    expect(minimal(regex).stateCount).toBe(states);
  });

  it('merges equivalent states and their transitions', () => {
    const result = minimal('a|b');
    expect(describeTransitions(result)).toEqual(['0 -[a-b]-> 1']);
    expect([...result.accepting]).toEqual([1]);
  });

  it('numbers the states in the order a breadth-first search finds them', () => {
    expect(describeTransitions(minimal('(a|b)*abb'))).toEqual([
      "0 -'a'-> 1",
      "0 -'b'-> 0",
      "1 -'a'-> 1",
      "1 -'b'-> 2",
      "2 -'a'-> 1",
      "2 -'b'-> 3",
      "3 -'a'-> 1",
      "3 -'b'-> 0",
    ]);
    expect([...minimal('(a|b)*abb').accepting]).toEqual([3]);
  });

  it('drops the states from which nothing can be accepted any more', () => {
    const result = minimal('a[^\\d\\D]|b');
    expect(describeTransitions(result)).toEqual(["0 -'b'-> 1"]);
    expect([...result.accepting]).toEqual([1]);
  });

  it('keeps them as a single sink state on request', () => {
    const result = minimal('a[^\\d\\D]|b', true);
    expect(result.stateCount).toBe(3);
    expect(describeTransitions(result)).toEqual([
      '0 -[\\x00-ac-\\x7f]-> 1',
      "0 -'b'-> 2",
      `1 -${ALL}-> 1`,
      `2 -${ALL}-> 1`,
    ]);
    expect([...result.accepting]).toEqual([2]);
  });

  it('adds no sink state when every input can still be accepted', () => {
    expect(minimal('[\\s\\S]*', true).stateCount).toBe(1);
    expect(describeTransitions(minimal('[\\s\\S]*', true))).toEqual([`0 -${ALL}-> 0`]);
  });

  it('keeps the initial state even if the language is empty', () => {
    const hidden = minimal('[^\\s\\S]');
    expect(hidden.stateCount).toBe(1);
    expect(hidden.accepting.size).toBe(0);
    expect(hidden.transitions).toEqual([]);

    const shown = minimal('a[^\\s\\S]', true);
    expect(shown.stateCount).toBe(1);
    expect(shown.accepting.size).toBe(0);
    expect(describeTransitions(shown)).toEqual([`0 -${ALL}-> 0`]);
  });

  it('ignores states that cannot be reached', () => {
    const input: Automaton = {
      stateCount: 3,
      start: 0,
      accepting: new Set([1, 2]),
      transitions: [
        { from: 0, to: 1, set: CharSet.of('a') },
        { from: 2, to: 2, set: CharSet.of('b') },
      ],
    };
    const result = minimize(input, { keepSink: false });
    expect(result.stateCount).toBe(2);
    expect(describeTransitions(result)).toEqual(["0 -'a'-> 1"]);
  });

  it('changes nothing when applied twice', () => {
    for (const { regex } of ORACLE_CORPUS) {
      for (const keepSink of [false, true]) {
        const once = minimize(dfa(regex), { keepSink });
        const twice = minimize(once, { keepSink });
        expect(describeTransitions(twice), regex).toEqual(describeTransitions(once));
        expect([...twice.accepting], regex).toEqual([...once.accepting]);
        expect(twice.stateCount, regex).toBe(once.stateCount);
      }
    }
  });

  it('never has more states than the DFA it started from', () => {
    for (const { regex } of ORACLE_CORPUS) {
      expect(minimal(regex).stateCount, regex).toBeLessThanOrEqual(dfa(regex).stateCount);
    }
  });

  it('handles a long chain, the worst case for the number of refinement rounds', () => {
    const started = performance.now();
    expect(minimal('[a-m]{500}[h-z]{500}').stateCount).toBe(1001);
    expect(performance.now() - started).toBeLessThan(3000);
  });
});
