import { describe, expect, it } from 'vitest';
import { describeDiagram } from './describe.ts';
import { DEFAULT_STATE_LIMIT, buildDiagram } from './pipeline.ts';

function description(regex: string, representation: 'enfa' | 'nfa' | 'dfa' | 'min-dfa' = 'dfa'): string {
  const result = buildDiagram({ regex, representation, showSink: false, stateLimit: DEFAULT_STATE_LIMIT, alphabet: 'ascii' });
  if (!result.ok) throw new Error(result.error.message);
  return describeDiagram(result.diagram, representation, result.alphabet);
}

describe('diagram description', () => {
  it('names the automaton, its states, and every transition', () => {
    expect(description('ab')).toBe(
      'DFA with 3 states and 2 transitions. Alphabet: ASCII. Initial state: q0. Accepting state: q2. ' +
        'Transitions: q0 to q1 on a; q1 to q2 on b.',
    );
  });

  it('uses the singular where there is one of something', () => {
    expect(description('')).toBe(
      'DFA with 1 state and no transitions. Alphabet: ASCII. Initial state: q0. Accepting state: q0.',
    );
    expect(description('a*', 'min-dfa')).toBe(
      'Minimized DFA with 1 state and 1 transition. Alphabet: ASCII. Initial state: q0. Accepting state: q0. ' +
        'Transitions: q0 to q0 on a.',
    );
  });

  it('lists several accepting states and says so if there are none', () => {
    expect(description('a|b')).toContain('Accepting states: q1, q2.');
    expect(description('[^\\s\\S]')).toContain('No accepting states.');
  });

  it('names the alphabet that the labels refer to', () => {
    const result = buildDiagram({
      regex: 'ab',
      representation: 'dfa',
      showSink: true,
      stateLimit: DEFAULT_STATE_LIMIT,
      alphabet: 'derived',
    });
    if (!result.ok) throw new Error(result.error.message);
    const text = describeDiagram(result.diagram, 'dfa', result.alphabet);
    expect(text).toContain('Alphabet: {a, b}.');
    expect(text).toContain('q3 to q3 on a, b.');
  });

  it('spells out ε-transitions', () => {
    expect(description('', 'enfa')).toBe(
      'ε-NFA with 2 states and 1 transition. Alphabet: ASCII. Initial state: q0. Accepting state: q1. ' +
        'Transitions: q0 to q1 on ε.',
    );
  });
});
