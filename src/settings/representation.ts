/** The automaton representations a regular expression can be shown as. */
export const REPRESENTATIONS = [
  { id: 'enfa', label: 'ε-NFA' },
  { id: 'nfa', label: 'NFA' },
  { id: 'dfa', label: 'DFA' },
  { id: 'min-dfa', label: 'Minimized DFA' },
] as const;

export type Representation = (typeof REPRESENTATIONS)[number]['id'];

export const DEFAULT_REPRESENTATION: Representation = 'dfa';

export function isRepresentation(value: string): value is Representation {
  return REPRESENTATIONS.some((representation) => representation.id === value);
}
