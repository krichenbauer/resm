import { describe, expect, it } from 'vitest';
import { DEFAULT_REPRESENTATION, REPRESENTATIONS, isRepresentation } from './representation.ts';

describe('representations', () => {
  it('offers the four automaton representations in construction order', () => {
    expect(REPRESENTATIONS.map((representation) => representation.id)).toEqual([
      'enfa',
      'nfa',
      'dfa',
      'min-dfa',
    ]);
  });

  it('gives every representation a distinct, non-empty label', () => {
    const labels = REPRESENTATIONS.map((representation) => representation.label);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('defaults to the DFA', () => {
    expect(DEFAULT_REPRESENTATION).toBe('dfa');
  });

  it('recognizes known representation ids only', () => {
    expect(isRepresentation('min-dfa')).toBe(true);
    expect(isRepresentation('DFA')).toBe(false);
    expect(isRepresentation('')).toBe(false);
  });
});
