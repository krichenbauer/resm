import type { Automaton, Transition } from '../automata/automaton.ts';
import { ASCII_SIZE, CharSet } from '../regex/charset.ts';
import { formatLabel } from './label.ts';

export interface DiagramState {
  /** `q0`, `q1`, ... */
  readonly name: string;
  readonly initial: boolean;
  readonly accepting: boolean;
}

/** All transitions from one state to another, as indexes into the states of the diagram. */
export interface DiagramEdge {
  readonly from: number;
  readonly to: number;
  readonly label: string;
}

/** What is drawn for an automaton: named states and labeled edges, without any geometry. */
export interface Diagram {
  readonly states: readonly DiagramState[];
  readonly edges: readonly DiagramEdge[];
}

/** Position of a transition among the transitions of its state: by first character, ε last. */
function sortKey({ set }: Transition): number {
  return set?.ranges()[0]?.[0] ?? ASCII_SIZE;
}

/**
 * The order in which the states are named: breadth-first from the initial
 * state, following transitions in alphabet order and ε-transitions in their
 * stored order. A sink state always comes last, so that showing or hiding it
 * does not rename the other states.
 */
function namingOrder(automaton: Automaton, outgoing: readonly Transition[][]): number[] {
  const order = [automaton.start];
  const placed = new Set(order);
  if (automaton.sink !== undefined) placed.add(automaton.sink);
  const place = (state: number) => {
    if (placed.has(state)) return;
    placed.add(state);
    order.push(state);
  };

  for (const state of order) {
    const transitions = [...(outgoing[state] ?? [])].sort((a, b) => sortKey(a) - sortKey(b));
    for (const { to } of transitions) place(to);
  }
  // States that nothing leads to are still part of the automaton.
  for (let state = 0; state < automaton.stateCount; state++) place(state);
  if (automaton.sink !== undefined && automaton.sink !== automaton.start) order.push(automaton.sink);
  return order;
}

/** Derives the diagram of an automaton: canonical state names and one labeled edge per pair of states. */
export function toDiagram(automaton: Automaton): Diagram {
  const outgoing: Transition[][] = Array.from({ length: automaton.stateCount }, () => []);
  for (const transition of automaton.transitions) outgoing[transition.from]?.push(transition);

  const order = namingOrder(automaton, outgoing);
  const indexOf = new Map(order.map((state, index) => [state, index]));

  const states = order.map((state, index) => ({
    name: `q${index}`,
    initial: state === automaton.start,
    accepting: automaton.accepting.has(state),
  }));

  const edges = order.flatMap((state, from) => {
    const byTarget = new Map<number, { epsilon: boolean; set: CharSet }>();
    for (const { to, set } of outgoing[state] ?? []) {
      const target = indexOf.get(to) ?? 0;
      const edge = byTarget.get(target) ?? { epsilon: false, set: CharSet.EMPTY };
      byTarget.set(target, set === null ? { ...edge, epsilon: true } : { ...edge, set: edge.set.union(set) });
    }
    return [...byTarget]
      .sort(([a], [b]) => a - b)
      .map(([to, { epsilon, set }]) => {
        const parts = [...(epsilon ? ['ε'] : []), ...(set.isEmpty ? [] : [formatLabel(set)])];
        return { from, to, label: parts.join(', ') };
      });
  });

  return { states, edges };
}
