import { describe, expect, it } from 'vitest';
import { CharSet } from '../regex/charset.ts';
import type { Automaton } from './automaton.ts';
import { ORACLE_CORPUS } from './corpus.ts';
import { removeEpsilons } from './epsilon-removal.ts';
import { describeTransitions, epsilonNfa } from './test-support.ts';

const nfa = (regex: string) => removeEpsilons(epsilonNfa(regex));

describe('ε-elimination', () => {
  it('reduces the empty regex to one accepting state', () => {
    const result = nfa('');
    expect(result.stateCount).toBe(1);
    expect(result.start).toBe(0);
    expect([...result.accepting]).toEqual([0]);
    expect(result.transitions).toEqual([]);
  });

  it('keeps an automaton without ε-transitions as it is', () => {
    const result = nfa('ab');
    expect(result.stateCount).toBe(3);
    expect(describeTransitions(result)).toEqual(["0 -'a'-> 1", "1 -'b'-> 2"]);
    expect([...result.accepting]).toEqual([2]);
  });

  it('lets a state take the transitions of everything it reaches by ε', () => {
    const result = nfa('a|b');
    expect(result.stateCount).toBe(3);
    expect(describeTransitions(result)).toEqual(["0 -'a'-> 1", "0 -'b'-> 2"]);
    expect([...result.accepting].sort()).toEqual([1, 2]);
  });

  it('makes a state accepting when it reaches an accepting state by ε', () => {
    const result = nfa('a*');
    expect(result.stateCount).toBe(2);
    expect(describeTransitions(result)).toEqual(["0 -'a'-> 1", "1 -'a'-> 1"]);
    expect([...result.accepting].sort()).toEqual([0, 1]);
  });

  it('stays nondeterministic where the ε-NFA was', () => {
    expect(describeTransitions(nfa('a|ab'))).toEqual(["0 -'a'-> 1", "0 -'a'-> 2", "2 -'b'-> 3"]);
  });

  it('merges parallel transitions between the same two states', () => {
    const input: Automaton = {
      stateCount: 3,
      start: 0,
      accepting: new Set([2]),
      transitions: [
        { from: 0, to: 1, set: null },
        { from: 0, to: 2, set: CharSet.of('a') },
        { from: 1, to: 2, set: CharSet.of('b') },
      ],
    };
    const result = removeEpsilons(input);
    expect(result.stateCount).toBe(2);
    expect(describeTransitions(result)).toEqual(['0 -[a-b]-> 1']);
  });

  it('follows chains and cycles of ε-transitions', () => {
    const input: Automaton = {
      stateCount: 4,
      start: 0,
      accepting: new Set([3]),
      transitions: [
        { from: 0, to: 1, set: null },
        { from: 1, to: 2, set: null },
        { from: 2, to: 0, set: null },
        { from: 2, to: 3, set: CharSet.of('a') },
      ],
    };
    const result = removeEpsilons(input);
    expect(describeTransitions(result)).toEqual(["0 -'a'-> 1"]);
    expect([...result.accepting]).toEqual([1]);
  });

  it('leaves no ε-transition and no unreachable state', () => {
    for (const { regex } of ORACLE_CORPUS) {
      const result = nfa(regex);
      expect(result.transitions.every((transition) => transition.set !== null), regex).toBe(true);
      const reached = new Set([result.start, ...result.transitions.map((transition) => transition.to)]);
      expect(reached.size, regex).toBe(result.stateCount);
    }
  });
});
