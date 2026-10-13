import { describe, expect, it } from 'vitest';
import { deriveAlphabet, restrictToAlphabet } from '../regex/alphabet.ts';
import { CharSet } from '../regex/charset.ts';
import { parseValid } from '../regex/test-support.ts';
import type { Automaton } from './automaton.ts';
import { HAND_CORPUS, ORACLE_CORPUS } from './corpus.ts';
import { determinize } from './determinize.ts';
import { removeEpsilons } from './epsilon-removal.ts';
import { complete, minimize } from './minimize.ts';
import { TEST_STATE_BUDGET, accepts, epsilonNfa, stringsUpTo } from './test-support.ts';
import { buildEpsilonNfa } from './thompson.ts';

const dfa = (regex: string) => determinize(removeEpsilons(epsilonNfa(regex)), TEST_STATE_BUDGET);

const REPRESENTATIONS: Record<string, (regex: string) => Automaton> = {
  'ε-NFA': epsilonNfa,
  NFA: (regex) => removeEpsilons(epsilonNfa(regex)),
  DFA: dfa,
  'DFA with sink state': (regex) => complete(dfa(regex)),
  'minimized DFA': (regex) => minimize(dfa(regex), { keepSink: false }),
  'minimized DFA with sink state': (regex) => minimize(dfa(regex), { keepSink: true }),
};

/** Longest test string for an alphabet, chosen to keep each case to roughly a thousand strings. */
function maxLengthFor(alphabet: string): number {
  return ({ 2: 9, 3: 6, 4: 5, 5: 4 } as Record<number, number>)[alphabet.length] ?? 3;
}

describe.each(Object.entries(REPRESENTATIONS))('language of the %s', (_name, build) => {
  it.each(ORACLE_CORPUS)('matches the oracle for $regex', ({ regex, alphabet }) => {
    const oracle = new RegExp(`^(?:${regex})$`);
    const automaton = build(regex);
    const disagreements = stringsUpTo(alphabet, maxLengthFor(alphabet)).filter(
      (input) => accepts(automaton, input) !== oracle.test(input),
    );
    expect(disagreements).toEqual([]);
  });

  it.each(HAND_CORPUS)('matches the hand-derived strings for $regex', ({ regex, accepted, rejected }) => {
    const automaton = build(regex);
    expect(accepted.filter((input) => !accepts(automaton, input))).toEqual([]);
    expect(rejected.filter((input) => accepts(automaton, input))).toEqual([]);
  });
});

describe('language over the alphabet derived from the regex', () => {
  /** The automata of a regex over its own alphabet, with and without sink. */
  function derived(regex: string): { alphabet: CharSet; automata: Record<string, Automaton> } {
    const parsed = parseValid(regex);
    const alphabet = deriveAlphabet(parsed);
    const enfa = buildEpsilonNfa(restrictToAlphabet(parsed, alphabet), TEST_STATE_BUDGET);
    const deterministic = determinize(removeEpsilons(enfa), TEST_STATE_BUDGET);
    return {
      alphabet,
      automata: {
        'ε-NFA': enfa,
        NFA: removeEpsilons(enfa),
        DFA: deterministic,
        'DFA with sink state': complete(deterministic, alphabet),
        'minimized DFA': minimize(deterministic, { keepSink: false, alphabet }),
        'minimized DFA with sink state': minimize(deterministic, { keepSink: true, alphabet }),
      },
    };
  }

  // Over its own alphabet, a regex matches what it matches over ASCII, and
  // it matches no string with any other character.
  it.each(ORACLE_CORPUS)('is the language over ASCII without foreign characters for $regex', ({ regex, alphabet: characters }) => {
    const oracle = new RegExp(`^(?:${regex})$`);
    const { alphabet, automata } = derived(regex);
    const strings = stringsUpTo(characters, maxLengthFor(characters));
    const expected = (input: string) => oracle.test(input) && [...input].every((char) => alphabet.has(char));
    for (const [name, automaton] of Object.entries(automata)) {
      expect(strings.filter((input) => accepts(automaton, input) !== expected(input)), name).toEqual([]);
    }
  });

  it('completes a DFA for exactly the characters of the alphabet', () => {
    for (const { regex } of ORACLE_CORPUS) {
      const { alphabet, automata } = derived(regex);
      const complete = automata['DFA with sink state'];
      if (!complete) throw new Error('missing automaton');
      for (let state = 0; state < complete.stateCount; state++) {
        const covered = complete.transitions
          .filter(({ from }) => from === state)
          .reduce((union, { set }) => union.union(set ?? CharSet.EMPTY), CharSet.EMPTY);
        expect(covered.equals(alphabet), `${regex}, state ${state}`).toBe(true);
      }
    }
  });
});
