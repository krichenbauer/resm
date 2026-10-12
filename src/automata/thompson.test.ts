import { describe, expect, it } from 'vitest';
import { parseValid } from '../regex/test-support.ts';
import { StateLimitError } from './automaton.ts';
import { ORACLE_CORPUS } from './corpus.ts';
import { describeTransitions, epsilonNfa } from './test-support.ts';
import { buildEpsilonNfa } from './thompson.ts';

describe('Thompson construction', () => {
  it('builds one ε-transition for the empty regex', () => {
    const nfa = epsilonNfa('');
    expect(nfa.stateCount).toBe(2);
    expect(nfa.start).toBe(0);
    expect([...nfa.accepting]).toEqual([1]);
    expect(describeTransitions(nfa)).toEqual(['0 -ε-> 1']);
  });

  it('builds one transition for a character or a set', () => {
    expect(describeTransitions(epsilonNfa('a'))).toEqual(["0 -'a'-> 1"]);
    expect(describeTransitions(epsilonNfa('[a-c]'))).toEqual(['0 -[a-c]-> 1']);
    expect(epsilonNfa('a').stateCount).toBe(2);
  });

  it('builds no transition for a set without members', () => {
    const nfa = epsilonNfa('[^\\s\\S]');
    expect(nfa.stateCount).toBe(2);
    expect(nfa.transitions).toEqual([]);
  });

  it('concatenates by sharing the state between both parts', () => {
    const nfa = epsilonNfa('ab');
    expect(nfa.stateCount).toBe(3);
    expect(describeTransitions(nfa)).toEqual(["0 -'a'-> 1", "1 -'b'-> 2"]);
    expect([...nfa.accepting]).toEqual([2]);
  });

  it('branches into every alternative and joins them again', () => {
    const nfa = epsilonNfa('a|b');
    expect(nfa.stateCount).toBe(6);
    expect(describeTransitions(nfa)).toEqual([
      '0 -ε-> 1',
      "1 -'a'-> 2",
      '0 -ε-> 3',
      "3 -'b'-> 4",
      '2 -ε-> 5',
      '4 -ε-> 5',
    ]);
    expect([...nfa.accepting]).toEqual([5]);
    expect(epsilonNfa('a|b|c').stateCount).toBe(8);
  });

  it('builds the star with an entry, an exit, a loop, and a bypass', () => {
    const nfa = epsilonNfa('a*');
    expect(nfa.stateCount).toBe(4);
    expect(describeTransitions(nfa)).toEqual(['0 -ε-> 1', "1 -'a'-> 2", '2 -ε-> 3', '2 -ε-> 1', '0 -ε-> 3']);
    expect([...nfa.accepting]).toEqual([3]);
  });

  it('builds the plus like the star without the bypass', () => {
    expect(describeTransitions(epsilonNfa('a+'))).toEqual(['0 -ε-> 1', "1 -'a'-> 2", '2 -ε-> 3', '2 -ε-> 1']);
  });

  it('builds the optional part like the star without the loop', () => {
    expect(describeTransitions(epsilonNfa('a?'))).toEqual(['0 -ε-> 1', "1 -'a'-> 2", '2 -ε-> 3', '0 -ε-> 3']);
  });

  it('expands bounded repetition into copies', () => {
    expect(describeTransitions(epsilonNfa('a{3}'))).toEqual(["0 -'a'-> 1", "1 -'a'-> 2", "2 -'a'-> 3"]);
    expect(describeTransitions(epsilonNfa('a{1}'))).toEqual(describeTransitions(epsilonNfa('a')));
    expect(describeTransitions(epsilonNfa('a{0}'))).toEqual(describeTransitions(epsilonNfa('')));
    expect(describeTransitions(epsilonNfa('a{0,}'))).toEqual(describeTransitions(epsilonNfa('a*')));
    expect(describeTransitions(epsilonNfa('a{1,}'))).toEqual(describeTransitions(epsilonNfa('a+')));
    expect(describeTransitions(epsilonNfa('a{0,1}'))).toEqual(describeTransitions(epsilonNfa('a?')));
    expect(describeTransitions(epsilonNfa('a{2,}'))).toEqual(describeTransitions(epsilonNfa('aa+')));
    expect(describeTransitions(epsilonNfa('a{1,3}'))).toEqual(describeTransitions(epsilonNfa('aa?a?')));
    expect(describeTransitions(epsilonNfa('(a|b){2}'))).toEqual(describeTransitions(epsilonNfa('(a|b)(a|b)')));
  });

  it('keeps the shape that makes fragments composable', () => {
    for (const { regex } of ORACLE_CORPUS) {
      const nfa = epsilonNfa(regex);
      const [accepting] = [...nfa.accepting];
      expect(nfa.accepting.size, regex).toBe(1);
      expect(nfa.transitions.some((transition) => transition.to === nfa.start), regex).toBe(false);
      expect(nfa.transitions.some((transition) => transition.from === accepting), regex).toBe(false);
      // Every state is used: no state is created without being connected.
      for (let state = 1; state < nfa.stateCount; state++) {
        expect(nfa.transitions.some(({ from, to }) => from === state || to === state) || nfa.stateCount === 2, regex).toBe(true);
      }
    }
  });

  it('stops as soon as the state budget is exceeded', () => {
    const build = (regex: string, budget: number) => () => buildEpsilonNfa(parseValid(regex), budget);
    expect(build('a{9}', 10)).not.toThrow();
    expect(build('a{10}', 10)).toThrow(StateLimitError);
    expect(build('a{1000}', 200)).toThrow(StateLimitError);

    const started = performance.now();
    expect(build('((a{1000}){1000}){1000}', 5000)).toThrow(StateLimitError);
    expect(build('((((){1000}){1000}){1000}){1000}', 5000)).toThrow(StateLimitError);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
