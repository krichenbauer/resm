import type { Automaton, Transition } from '../automata/automaton.ts';
import { ASCII_SIZE, CharSet } from '../regex/charset.ts';
import { formatLabel } from './label.ts';

export interface DiagramState {
  /** `q0`, `q1`, ... */
  readonly name: string;
  /**
   * Identifies the state across edits of the regex, unlike its name: the
   * labels along the path on which the state is first reached. A state keeps
   * its key as long as that path exists, whatever else changes.
   */
  readonly key: string;
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
  /** The index of the sink state, if the diagram shows one. Most other states lead to it. */
  readonly sink?: number;
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
function namingOrder(
  automaton: Automaton,
  outgoing: readonly Transition[][],
): { order: number[]; parentOf: Map<number, number> } {
  const order = [automaton.start];
  // The state from which each state was first reached.
  const parentOf = new Map<number, number>();
  const placed = new Set(order);
  if (automaton.sink !== undefined) placed.add(automaton.sink);
  const place = (state: number, parent?: number) => {
    if (placed.has(state)) return;
    placed.add(state);
    order.push(state);
    if (parent !== undefined) parentOf.set(state, parent);
  };

  for (const state of order) {
    const transitions = [...(outgoing[state] ?? [])].sort((a, b) => sortKey(a) - sortKey(b));
    for (const { to } of transitions) place(to, state);
  }
  // States that nothing leads to are still part of the automaton.
  for (let state = 0; state < automaton.stateCount; state++) place(state);
  if (automaton.sink !== undefined && automaton.sink !== automaton.start) order.push(automaton.sink);
  return { order, parentOf };
}

/** Separates the parts of a state key. It cannot occur in a label, which spells out control characters. */
const KEY_SEPARATOR = '\u001f';

/** The keys of the states in naming order; see `DiagramState.key`. */
function stateKeys(
  automaton: Automaton,
  order: readonly number[],
  parentOf: ReadonlyMap<number, number>,
  labelOf: (from: number, to: number) => string,
): string[] {
  const keyOf = new Map<number, string>();
  const used = new Set<string>();
  return order.map((state) => {
    const parent = parentOf.get(state);
    let key: string;
    if (state === automaton.start) key = '';
    else if (state === automaton.sink) key = `${KEY_SEPARATOR}sink`;
    else if (parent === undefined) key = `${KEY_SEPARATOR}unreached${KEY_SEPARATOR}${state}`;
    else {
      const path = `${keyOf.get(parent) ?? ''}${KEY_SEPARATOR}${labelOf(parent, state)}`;
      // In an NFA, edges with the same label can lead from one state to several others.
      key = path;
      for (let twin = 1; used.has(key); twin++) key = `${path}${KEY_SEPARATOR}${twin}`;
    }
    keyOf.set(state, key);
    used.add(key);
    return key;
  });
}

/**
 * Derives the diagram of an automaton: canonical state names and one labeled
 * edge per pair of states. The labels are relative to the alphabet; see
 * `formatLabel`.
 */
export function toDiagram(automaton: Automaton, alphabet: CharSet = CharSet.ALL): Diagram {
  const outgoing: Transition[][] = Array.from({ length: automaton.stateCount }, () => []);
  for (const transition of automaton.transitions) outgoing[transition.from]?.push(transition);

  const { order, parentOf } = namingOrder(automaton, outgoing);
  const indexOf = new Map(order.map((state, index) => [state, index]));

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
        const parts = [...(epsilon ? ['ε'] : []), ...(set.isEmpty ? [] : [formatLabel(set, alphabet)])];
        return { from, to, label: parts.join(', ') };
      });
  });

  const labels = new Map(edges.map(({ from, to, label }) => [`${from},${to}`, label]));
  const keys = stateKeys(
    automaton,
    order,
    parentOf,
    (from, to) => labels.get(`${indexOf.get(from)},${indexOf.get(to)}`) ?? '',
  );
  const states = order.map((state, index) => ({
    name: `q${index}`,
    key: keys[index] ?? '',
    initial: state === automaton.start,
    accepting: automaton.accepting.has(state),
  }));

  const hasSink = automaton.sink !== undefined && automaton.sink !== automaton.start;
  return { states, edges, ...(hasSink ? { sink: states.length - 1 } : {}) };
}
