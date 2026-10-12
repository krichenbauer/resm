import { describe, expect, it } from 'vitest';
import { CharSet } from '../regex/charset.ts';
import { type Automaton, StateLimitError } from './automaton.ts';
import { ORACLE_CORPUS } from './corpus.ts';
import { determinize } from './determinize.ts';
import { removeEpsilons } from './epsilon-removal.ts';
import { TEST_STATE_BUDGET, describeTransitions, epsilonNfa } from './test-support.ts';

const dfa = (regex: string, budget = TEST_STATE_BUDGET) => determinize(removeEpsilons(epsilonNfa(regex)), budget);

describe('determinization', () => {
  it('keeps an automaton that is already deterministic', () => {
    const result = dfa('ab');
    expect(result.stateCount).toBe(3);
    expect(describeTransitions(result)).toEqual(["0 -'a'-> 1", "1 -'b'-> 2"]);
    expect([...result.accepting]).toEqual([2]);
  });

  it('reduces the empty regex to one accepting state', () => {
    const result = dfa('');
    expect(result.stateCount).toBe(1);
    expect([...result.accepting]).toEqual([0]);
    expect(result.transitions).toEqual([]);
  });

  it('combines the states that the same input can reach', () => {
    const result = dfa('a|ab');
    expect(result.stateCount).toBe(3);
    expect(describeTransitions(result)).toEqual(["0 -'a'-> 1", "1 -'b'-> 2"]);
    expect([...result.accepting].sort()).toEqual([1, 2]);
  });

  it('splits overlapping sets where their targets differ', () => {
    const result = dfa('[a-c]|[b-d]x');
    expect(describeTransitions(result)).toEqual([
      "0 -'a'-> 1",
      '0 -[b-c]-> 2',
      "0 -'d'-> 3",
      "2 -'x'-> 4",
      "3 -'x'-> 4",
    ]);
    expect([...result.accepting].sort()).toEqual([1, 2, 4]);
  });

  it('labels one transition with all characters that lead to the same state', () => {
    expect(describeTransitions(dfa('[ab]c|da'))).toEqual([
      '0 -[a-b]-> 1',
      "0 -'d'-> 2",
      "1 -'c'-> 3",
      "2 -'a'-> 4",
    ]);
  });

  it('has no trap state: characters without a transition reject', () => {
    const result = dfa('a');
    expect(result.stateCount).toBe(2);
    expect(describeTransitions(result)).toEqual(["0 -'a'-> 1"]);
  });

  it('is deterministic for every regex of the corpus', () => {
    for (const { regex } of ORACLE_CORPUS) {
      const result = dfa(regex);
      expect(result.transitions.every((transition) => transition.set !== null), regex).toBe(true);
      for (let state = 0; state < result.stateCount; state++) {
        const sets = result.transitions.filter(({ from }) => from === state).map(({ set }) => set ?? CharSet.EMPTY);
        const total = sets.reduce((sum, set) => sum + set.size, 0);
        const union = sets.reduce((all, set) => all.union(set), CharSet.EMPTY);
        expect(union.size, `${regex}, state ${state}`).toBe(total);
        const targets = result.transitions.filter(({ from }) => from === state).map(({ to }) => to);
        expect(new Set(targets).size, `${regex}, state ${state}`).toBe(targets.length);
      }
    }
  });

  it('stops as soon as the state budget is exceeded', () => {
    // The last-but-nth character must be an `a`, which needs 2^(n+1) states.
    const needed = dfa('(a|b)*a(a|b){3}').stateCount;
    expect(needed).toBeGreaterThanOrEqual(16);
    expect(() => dfa('(a|b)*a(a|b){3}', needed)).not.toThrow();
    expect(() => dfa('(a|b)*a(a|b){3}', needed - 1)).toThrow(StateLimitError);
    expect(() => dfa('(a|b)*a(a|b){30}', 500)).toThrow(StateLimitError);
  });

  it('refuses an automaton that still has ε-transitions', () => {
    const input: Automaton = {
      stateCount: 2,
      start: 0,
      accepting: new Set([1]),
      transitions: [{ from: 0, to: 1, set: null }],
    };
    expect(() => determinize(input, TEST_STATE_BUDGET)).toThrow('ε-transitions');
  });
});
