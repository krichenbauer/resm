import type { CharSet } from '../regex/charset.ts';
import { partitionAlphabet } from './alphabet.ts';
import { type Automaton, StateLimitError, type Transition } from './automaton.ts';

/**
 * Converts an NFA without ε-transitions into a DFA with the subset
 * construction. Each DFA state stands for the set of NFA states that the same
 * input can reach. The empty set gets no state: the DFA is partial, and a
 * missing transition rejects. Throws a `StateLimitError` beyond `maxStates`.
 */
export function determinize(nfa: Automaton, maxStates: number): Automaton {
  const sets: CharSet[] = [];
  for (const { set } of nfa.transitions) {
    if (set === null) throw new Error('Cannot determinize an automaton with ε-transitions.');
    sets.push(set);
  }
  const blocks = partitionAlphabet(sets);

  // For every NFA state: its transitions as (alphabet block, target) pairs.
  const moves: [block: number, target: number][][] = Array.from({ length: nfa.stateCount }, () => []);
  for (const { from, to, set } of nfa.transitions) {
    blocks.forEach((block, index) => {
      if (set?.contains(block)) moves[from]?.push([index, to]);
    });
  }

  const subsets: number[][] = [[nfa.start]];
  const numberOf = new Map([[String(nfa.start), 0]]);
  const accepting = new Set<number>();
  const transitions: Transition[] = [];

  for (let state = 0; state < subsets.length; state++) {
    const members = subsets[state] ?? [];
    if (members.some((member) => nfa.accepting.has(member))) accepting.add(state);

    const targetsByBlock = new Map<number, Set<number>>();
    for (const member of members) {
      for (const [block, target] of moves[member] ?? []) {
        let targets = targetsByBlock.get(block);
        if (!targets) targetsByBlock.set(block, (targets = new Set()));
        targets.add(target);
      }
    }

    // Visit the blocks in alphabet order, so the numbering is deterministic.
    const setByTarget = new Map<number, CharSet>();
    for (const blockIndex of [...targetsByBlock.keys()].sort((a, b) => a - b)) {
      const block = blocks[blockIndex];
      const subset = [...(targetsByBlock.get(blockIndex) ?? [])].sort((a, b) => a - b);
      if (!block) continue;
      const key = subset.join(',');
      let target = numberOf.get(key);
      if (target === undefined) {
        if (subsets.length === maxStates) throw new StateLimitError(maxStates);
        target = subsets.length;
        numberOf.set(key, target);
        subsets.push(subset);
      }
      setByTarget.set(target, setByTarget.get(target)?.union(block) ?? block);
    }
    for (const [to, set] of setByTarget) transitions.push({ from: state, to, set });
  }

  return { stateCount: subsets.length, start: 0, accepting, transitions };
}
