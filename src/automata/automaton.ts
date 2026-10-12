import type { CharSet } from '../regex/charset.ts';

/** A transition on any character of `set`, or an ε-transition when `set` is `null`. */
export interface Transition {
  readonly from: number;
  readonly to: number;
  readonly set: CharSet | null;
}

/**
 * A finite automaton over ASCII with the states `0` to `stateCount - 1`.
 * All four representations share this shape. A missing transition rejects.
 */
export interface Automaton {
  readonly stateCount: number;
  readonly start: number;
  readonly accepting: ReadonlySet<number>;
  readonly transitions: readonly Transition[];
  /** The state that collects all rejected input, if a total DFA has one besides its initial state. */
  readonly sink?: number;
}

/** Thrown when a construction would need more states than its budget allows. */
export class StateLimitError extends Error {
  constructor(readonly limit: number) {
    super(`The automaton needs more than ${limit} states.`);
  }
}
