import type { Automaton } from './automaton.ts';
import { formatSet, parseValid } from '../regex/test-support.ts';
import { buildEpsilonNfa } from './thompson.ts';

/** Generous state budget for tests that are not about limits. */
export const TEST_STATE_BUDGET = 10_000;

/** The Thompson ε-NFA of a regex that is expected to be valid. */
export function epsilonNfa(regex: string): Automaton {
  return buildEpsilonNfa(parseValid(regex), TEST_STATE_BUDGET);
}

/** Transitions in a compact notation such as `0 -'a'-> 1` or `0 -ε-> 1`, in their stored order. */
export function describeTransitions(automaton: Automaton): string[] {
  return automaton.transitions.map(
    ({ from, to, set }) => `${from} -${set === null ? 'ε' : formatSet(set)}-> ${to}`,
  );
}

function epsilonClosure(automaton: Automaton, states: ReadonlySet<number>): Set<number> {
  const closure = new Set(states);
  const pending = [...states];
  for (let state = pending.pop(); state !== undefined; state = pending.pop()) {
    for (const { from, to, set } of automaton.transitions) {
      if (from === state && set === null && !closure.has(to)) {
        closure.add(to);
        pending.push(to);
      }
    }
  }
  return closure;
}

/**
 * Whether the automaton accepts the whole input. A straightforward reference
 * simulation that works for every representation, written for tests only.
 */
export function accepts(automaton: Automaton, input: string): boolean {
  let current = epsilonClosure(automaton, new Set([automaton.start]));
  for (const char of input) {
    const next = new Set<number>();
    for (const { from, to, set } of automaton.transitions) {
      if (set !== null && current.has(from) && set.has(char)) next.add(to);
    }
    current = epsilonClosure(automaton, next);
  }
  return [...current].some((state) => automaton.accepting.has(state));
}

/** All strings over `alphabet` with at most `maxLength` characters, shortest first. */
export function stringsUpTo(alphabet: string, maxLength: number): string[] {
  const strings = [''];
  let previous = [''];
  for (let length = 1; length <= maxLength; length++) {
    previous = previous.flatMap((prefix) => [...alphabet].map((char) => prefix + char));
    strings.push(...previous);
  }
  return strings;
}
