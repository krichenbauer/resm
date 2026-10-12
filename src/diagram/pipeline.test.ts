import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE_LIMIT, type DiagramRequest, buildDiagram, workStateLimit } from './pipeline.ts';

const request = (regex: string, overrides: Partial<DiagramRequest> = {}): DiagramRequest => ({
  regex,
  representation: 'dfa',
  showSink: false,
  stateLimit: DEFAULT_STATE_LIMIT,
  ...overrides,
});

function stateNames(regex: string, overrides: Partial<DiagramRequest> = {}): string[] {
  const result = buildDiagram(request(regex, overrides));
  if (!result.ok) throw new Error(result.error.message);
  return result.diagram.states.map((state) => state.name);
}

function failure(regex: string, overrides: Partial<DiagramRequest> = {}) {
  const result = buildDiagram(request(regex, overrides));
  if (result.ok) throw new Error(`Expected ${regex} to fail`);
  return result.error;
}

describe('diagram pipeline', () => {
  it('limits diagrams to 200 states by default', () => {
    expect(DEFAULT_STATE_LIMIT).toBe(200);
  });

  it('builds the requested representation', () => {
    expect(stateNames('a|b', { representation: 'enfa' })).toHaveLength(6);
    expect(stateNames('a|b', { representation: 'nfa' })).toHaveLength(3);
    expect(stateNames('a|b', { representation: 'dfa' })).toHaveLength(3);
    expect(stateNames('a|b', { representation: 'min-dfa' })).toHaveLength(2);
  });

  it('shows the empty regex as the single state q0', () => {
    const result = buildDiagram(request(''));
    expect(result).toEqual({
      ok: true,
      diagram: { states: [{ name: 'q0', key: '', initial: true, accepting: true }], edges: [] },
    });
  });

  it('adds the sink state to deterministic representations on request', () => {
    expect(stateNames('ab', { showSink: true })).toEqual(['q0', 'q1', 'q2', 'q3']);
    expect(stateNames('a|b', { representation: 'min-dfa', showSink: true })).toEqual(['q0', 'q1', 'q2']);
    expect(stateNames('[\\s\\S]*', { representation: 'min-dfa', showSink: true })).toEqual(['q0']);
  });

  it('ignores the sink setting for nondeterministic representations', () => {
    expect(stateNames('ab', { representation: 'enfa', showSink: true })).toHaveLength(3);
    expect(stateNames('ab', { representation: 'nfa', showSink: true })).toHaveLength(3);
  });

  it('reports a syntax error with its location', () => {
    expect(failure('a(b')).toEqual({
      kind: 'syntax',
      message: "Unterminated group: this '(' has no matching ')'.",
      range: { start: 1, end: 2 },
    });
  });

  it.each([
    ['enfa', 'a{200}', 'ε-NFA'],
    ['nfa', 'a{200}', 'NFA'],
    ['dfa', 'a{200}', 'DFA'],
    ['min-dfa', 'a{200}', 'minimized DFA'],
  ] as const)('rejects a %s with more states than the limit', (representation, regex, name) => {
    expect(stateNames('a{199}', { representation })).toHaveLength(200);
    expect(failure(regex, { representation })).toEqual({
      kind: 'limit',
      message: `The ${name} has more than 200 states, which is the display limit.`,
    });
  });

  it('applies an adjusted limit', () => {
    expect(stateNames('a{200}', { stateLimit: 201 })).toHaveLength(201);
    expect(failure('abc', { stateLimit: 3 }).message).toBe(
      'The DFA has more than 3 states, which is the display limit.',
    );
  });

  it('counts the sink state towards the limit', () => {
    expect(stateNames('ab', { stateLimit: 3 })).toHaveLength(3);
    expect(failure('ab', { stateLimit: 3, showSink: true }).kind).toBe('limit');
    expect(stateNames('ab', { stateLimit: 4, showSink: true })).toHaveLength(4);
  });

  it('judges a representation by its own size, not by the automata it is derived from', () => {
    // The ε-NFA of a|b|...|z has 54 states, but its minimized DFA only two.
    const regex = 'a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z';
    expect(failure(regex, { representation: 'enfa', stateLimit: 10 }).kind).toBe('limit');
    expect(stateNames(regex, { representation: 'min-dfa', stateLimit: 10 })).toHaveLength(2);

    // Every string of a and b is accepted, but the DFA still tracks the last nine characters.
    const redundant = '(a|b)*a(a|b){8}|(a|b)*';
    expect(failure(redundant, { representation: 'dfa' }).kind).toBe('limit');
    expect(stateNames(redundant, { representation: 'min-dfa' })).toEqual(['q0']);
  });

  it('gives up when an intermediate automaton grows too large', () => {
    const started = performance.now();
    expect(failure('(a|b)*a(a|b){14}|(a|b)*', { representation: 'min-dfa' })).toEqual({
      kind: 'limit',
      message: `This expression is too complex: an intermediate automaton has more than ${workStateLimit(200)} states.`,
    });
    expect(failure('(a{1000}){1000}', { representation: 'nfa' }).kind).toBe('limit');
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it('allows intermediate automata well beyond the display limit', () => {
    expect(workStateLimit(200)).toBe(2000);
    expect(workStateLimit(1000)).toBe(10_000);
    expect(workStateLimit(5)).toBe(2000);
  });
});
