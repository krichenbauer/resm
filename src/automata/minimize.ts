import { CharSet } from '../regex/charset.ts';
import { partitionAlphabet } from './alphabet.ts';
import type { Automaton, Transition } from './automaton.ts';

function at<T>(items: ArrayLike<T>, index: number): T {
  const item = items[index];
  if (item === undefined) throw new RangeError(`Index ${index} is out of bounds.`);
  return item;
}

/**
 * Makes a DFA total: a new non-accepting sink state collects the transitions
 * for all characters that a state has no transition for. Returns the DFA
 * itself if nothing is missing.
 */
export function complete(dfa: Automaton): Automaton {
  const outgoing: Transition[][] = Array.from({ length: dfa.stateCount }, () => []);
  for (const transition of dfa.transitions) at(outgoing, transition.from).push(transition);

  const missing = outgoing.map((transitions) =>
    transitions.reduce((rest, { set }) => rest.minus(set ?? CharSet.EMPTY), CharSet.ALL),
  );
  if (missing.every((set) => set.isEmpty)) return dfa;

  const sink = dfa.stateCount;
  const transitions = outgoing.flatMap((own, state) => {
    const rest = at(missing, state);
    return rest.isEmpty ? own : [...own, { from: state, to: sink, set: rest }];
  });
  transitions.push({ from: sink, to: sink, set: CharSet.ALL });
  return { stateCount: dfa.stateCount + 1, start: dfa.start, accepting: dfa.accepting, transitions, sink };
}

/**
 * Builds the DFA with the fewest states for the language of `dfa`. States are
 * numbered in the order a breadth-first search from the initial state finds
 * them, following the transitions in alphabet order.
 *
 * States from which no accepting state can be reached are all equivalent.
 * With `keepSink` they remain as one sink state and the result is total;
 * without it they are dropped, so a missing transition rejects. The initial
 * state is kept either way.
 */
export function minimize(dfa: Automaton, options: { keepSink: boolean }): Automaton {
  const total = complete(dfa);
  const blocks = partitionAlphabet(total.transitions.map(({ set }) => set ?? CharSet.EMPTY));
  const stateCount = total.stateCount;
  const blockCount = blocks.length;

  // The transition function as a table: one target per state and alphabet block.
  const targets = new Int32Array(stateCount * blockCount);
  for (const { from, to, set } of total.transitions) {
    blocks.forEach((block, index) => {
      if (set?.contains(block)) targets[from * blockCount + index] = to;
    });
  }
  const targetsOf = (state: number) => targets.subarray(state * blockCount, (state + 1) * blockCount);

  // Moore's algorithm: start from accepting versus non-accepting states and
  // split classes until all states of a class agree on the class of every target.
  let classOf = Int32Array.from({ length: stateCount }, (_, state) => (total.accepting.has(state) ? 1 : 0));
  let classCount = new Set(classOf).size;
  for (;;) {
    const classOfSignature = new Map<string, number>();
    const refined = classOf.map((ownClass, state) => {
      const signature = `${ownClass}:${targetsOf(state).map((target) => at(classOf, target)).join(',')}`;
      let refinedClass = classOfSignature.get(signature);
      if (refinedClass === undefined) classOfSignature.set(signature, (refinedClass = classOfSignature.size));
      return refinedClass;
    });
    // Rounds only ever split classes, so an unchanged count means nothing was split.
    // Adopting the last round anyway leaves the classes numbered from zero.
    const stable = classOfSignature.size === classCount;
    classOf = refined;
    classCount = classOfSignature.size;
    if (stable) break;
  }

  const representative = new Int32Array(classCount).fill(-1);
  classOf.forEach((ownClass, state) => {
    if (at(representative, ownClass) === -1) representative[ownClass] = state;
  });
  const classTargets = (ownClass: number) =>
    targetsOf(at(representative, ownClass)).map((target) => at(classOf, target));

  // A class is live if an accepting class can be reached from it.
  const predecessors: number[][] = Array.from({ length: classCount }, () => []);
  for (let ownClass = 0; ownClass < classCount; ownClass++) {
    for (const target of classTargets(ownClass)) at(predecessors, target).push(ownClass);
  }
  const live = new Set<number>();
  const pending = [...new Set(Array.from(total.accepting, (state) => at(classOf, state)))];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    if (live.has(current)) continue;
    live.add(current);
    pending.push(...at(predecessors, current));
  }

  const startClass = at(classOf, total.start);
  const numberOf = new Map([[startClass, 0]]);
  const accepting = new Set<number>();
  const transitions: Transition[] = [];
  for (const [ownClass, state] of numberOf) {
    if (total.accepting.has(at(representative, ownClass))) accepting.add(state);

    const setByTarget = new Map<number, CharSet>();
    classTargets(ownClass).forEach((targetClass, blockIndex) => {
      if (!options.keepSink && !live.has(targetClass)) return;
      let target = numberOf.get(targetClass);
      if (target === undefined) numberOf.set(targetClass, (target = numberOf.size));
      const block = at(blocks, blockIndex);
      setByTarget.set(target, setByTarget.get(target)?.union(block) ?? block);
    });
    for (const [to, set] of setByTarget) transitions.push({ from: state, to, set });
  }

  // After minimization at most one class is not live. It is only reachable here if it was kept.
  const sink = [...numberOf].find(([ownClass, state]) => state !== 0 && !live.has(ownClass))?.[1];
  return {
    stateCount: numberOf.size,
    start: 0,
    accepting,
    transitions,
    ...(sink === undefined ? {} : { sink }),
  };
}
