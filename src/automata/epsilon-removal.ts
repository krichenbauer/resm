import type { CharSet } from '../regex/charset.ts';
import type { Automaton, Transition } from './automaton.ts';

/**
 * Removes the ε-transitions of an NFA without changing its language. A state
 * takes over the transitions of every state it reaches by ε alone, and becomes
 * accepting if one of those states is. States that are no longer reachable are
 * dropped; the remaining ones are renumbered in the order they are discovered.
 */
export function removeEpsilons(nfa: Automaton): Automaton {
  const epsilonTargets: number[][] = Array.from({ length: nfa.stateCount }, () => []);
  const charTransitions: number[][] = Array.from({ length: nfa.stateCount }, () => []);
  nfa.transitions.forEach(({ from, to, set }, index) => {
    if (set === null) epsilonTargets[from]?.push(to);
    else charTransitions[from]?.push(index);
  });

  const closureOf = (state: number): Set<number> => {
    const closure = new Set([state]);
    const pending = [state];
    for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
      for (const target of epsilonTargets[current] ?? []) {
        if (!closure.has(target)) {
          closure.add(target);
          pending.push(target);
        }
      }
    }
    return closure;
  };

  // Maps the kept states of the input to their new numbers, in discovery order.
  const renumbered = new Map([[nfa.start, 0]]);
  const accepting = new Set<number>();
  const transitions: Transition[] = [];

  for (const [oldState, newState] of renumbered) {
    const closure = closureOf(oldState);
    if ([...closure].some((state) => nfa.accepting.has(state))) accepting.add(newState);

    // Follow the transitions in their stored order, so the result is deterministic.
    const outgoing = [...closure].flatMap((state) => charTransitions[state] ?? []).sort((a, b) => a - b);
    const setByTarget = new Map<number, CharSet>();
    for (const index of outgoing) {
      const transition = nfa.transitions[index];
      if (!transition?.set) continue;
      const merged = setByTarget.get(transition.to)?.union(transition.set) ?? transition.set;
      setByTarget.set(transition.to, merged);
    }
    for (const [oldTarget, set] of setByTarget) {
      let target = renumbered.get(oldTarget);
      if (target === undefined) {
        target = renumbered.size;
        renumbered.set(oldTarget, target);
      }
      transitions.push({ from: newState, to: target, set });
    }
  }

  return { stateCount: renumbered.size, start: 0, accepting, transitions };
}
