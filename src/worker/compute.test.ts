import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE_LIMIT } from '../diagram/pipeline.ts';
import { computeDiagram } from './compute.ts';

const request = (regex: string) =>
  ({ regex, representation: 'dfa', showSink: false, stateLimit: DEFAULT_STATE_LIMIT }) as const;

describe('diagram computation', () => {
  it('returns the diagram together with its layout', () => {
    const result = computeDiagram(request('a*b'));
    if (!result.ok) throw new Error(result.error.message);
    expect(result.diagram.states).toHaveLength(3);
    expect(result.layout.positions).toHaveLength(result.diagram.states.length);
    expect(result.layout.shapes).toHaveLength(result.diagram.edges.length);
  });

  it('returns errors unchanged', () => {
    expect(computeDiagram(request('a{'))).toMatchObject({ ok: false, error: { kind: 'syntax' } });
    expect(computeDiagram(request('a{300}'))).toMatchObject({ ok: false, error: { kind: 'limit' } });
  });

  it('returns only data that can be sent from a worker', () => {
    const result = computeDiagram(request('(a|b)*abb'));
    expect(structuredClone(result)).toEqual(result);
  });
});
