import { REPRESENTATIONS, type Representation } from '../settings/representation.ts';
import type { Diagram } from './diagram.ts';

const counted = (count: number, noun: string) =>
  `${count === 0 ? 'no' : count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Describes a diagram in words, for readers who cannot see it: what kind of
 * automaton it is, its alphabet as in `Σ = {a, b}`, its initial and accepting
 * states, and every transition.
 */
export function describeDiagram(diagram: Diagram, representation: Representation, alphabet: string): string {
  const kind = REPRESENTATIONS.find(({ id }) => id === representation)?.label ?? 'Automaton';
  const name = (index: number) => diagram.states[index]?.name ?? '?';
  const initial = diagram.states.filter((state) => state.initial).map((state) => state.name);
  const accepting = diagram.states.filter((state) => state.accepting).map((state) => state.name);

  const sentences = [
    `${kind} with ${counted(diagram.states.length, 'state')} and ${counted(diagram.edges.length, 'transition')}.`,
    `Alphabet: ${alphabet.replace('Σ = ', '')}.`,
    `Initial state: ${initial.join(', ')}.`,
    accepting.length === 0
      ? 'No accepting states.'
      : `Accepting state${accepting.length === 1 ? '' : 's'}: ${accepting.join(', ')}.`,
  ];
  if (diagram.edges.length > 0) {
    const transitions = diagram.edges.map(({ from, to, label }) => `${name(from)} to ${name(to)} on ${label}`);
    sentences.push(`Transitions: ${transitions.join('; ')}.`);
  }
  return sentences.join(' ');
}
