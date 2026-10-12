import { describe, expect, it } from 'vitest';
import type { Automaton } from './automaton.ts';
import { HAND_CORPUS, ORACLE_CORPUS } from './corpus.ts';
import { determinize } from './determinize.ts';
import { removeEpsilons } from './epsilon-removal.ts';
import { TEST_STATE_BUDGET, accepts, epsilonNfa, stringsUpTo } from './test-support.ts';

const REPRESENTATIONS: Record<string, (regex: string) => Automaton> = {
  'ε-NFA': epsilonNfa,
  NFA: (regex) => removeEpsilons(epsilonNfa(regex)),
  DFA: (regex) => determinize(removeEpsilons(epsilonNfa(regex)), TEST_STATE_BUDGET),
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
