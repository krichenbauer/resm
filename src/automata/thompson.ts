import type { RegexNode, RepeatNode } from '../regex/ast.ts';
import type { CharSet } from '../regex/charset.ts';
import { type Automaton, StateLimitError, type Transition } from './automaton.ts';

/**
 * Builds the ε-NFA of a regex with Thompson's construction. Every operator
 * contributes its own states and ε-transitions; concatenated parts share the
 * state between them. Throws a `StateLimitError` beyond `maxStates` states.
 */
export function buildEpsilonNfa(ast: RegexNode, maxStates: number): Automaton {
  const builder = new ThompsonBuilder(maxStates);
  const start = builder.newState();
  const accept = builder.build(ast, start);
  return {
    stateCount: builder.stateCount,
    start,
    accepting: new Set([accept]),
    transitions: builder.transitions,
  };
}

class ThompsonBuilder {
  stateCount = 0;
  readonly transitions: Transition[] = [];

  constructor(private readonly maxStates: number) {}

  newState(): number {
    if (this.stateCount === this.maxStates) throw new StateLimitError(this.maxStates);
    return this.stateCount++;
  }

  /** Adds the fragment for `node` behind the state `from` and returns the fragment's accepting state. */
  build(node: RegexNode, from: number): number {
    switch (node.type) {
      case 'empty':
        return this.step(from, null);
      case 'chars':
        return this.step(from, node.set);
      case 'concat':
        return node.parts.reduce((state, part) => this.build(part, state), from);
      case 'alternation': {
        const exits = node.options.map((option) => this.build(option, this.step(from, null)));
        const accept = this.newState();
        for (const exit of exits) this.connect(exit, accept, null);
        return accept;
      }
      case 'repeat':
        return this.buildRepeat(node, from);
    }
  }

  private buildRepeat({ body, min, max }: RepeatNode, from: number): number {
    if (max === 0) return this.step(from, null);
    let state = from;
    if (max === null) {
      if (min === 0) return this.buildLoop(body, state, { bypass: true, repeat: true });
      for (let copy = 1; copy < min; copy++) state = this.build(body, state);
      return this.buildLoop(body, state, { bypass: false, repeat: true });
    }
    for (let copy = 0; copy < min; copy++) state = this.build(body, state);
    for (let copy = min; copy < max; copy++) {
      state = this.buildLoop(body, state, { bypass: true, repeat: false });
    }
    return state;
  }

  /**
   * Wraps `body` in an entry and an exit ε-transition. The star has both a
   * bypass around the body and a loop back into it; `+` has only the loop,
   * `?` only the bypass.
   */
  private buildLoop(body: RegexNode, from: number, shape: { bypass: boolean; repeat: boolean }): number {
    const entry = this.step(from, null);
    const exit = this.build(body, entry);
    const accept = this.step(exit, null);
    if (shape.repeat) this.connect(exit, entry, null);
    if (shape.bypass) this.connect(from, accept, null);
    return accept;
  }

  /** Adds a new state behind `from` and returns it. */
  private step(from: number, set: CharSet | null): number {
    const to = this.newState();
    this.connect(from, to, set);
    return to;
  }

  private connect(from: number, to: number, set: CharSet | null): void {
    // A set without members can never be taken, so it gets no transition.
    if (set?.isEmpty) return;
    this.transitions.push({ from, to, set });
  }
}
