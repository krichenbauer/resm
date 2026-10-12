import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE_LIMIT, buildDiagram } from '../diagram/pipeline.ts';
import type { Representation } from '../settings/representation.ts';
import { STATE_RADIUS } from './geometry.ts';
import { layoutDiagram } from './layout.ts';
import { INITIAL_ARROW_LENGTH, buildScene } from './scene.ts';

function sceneOf(regex: string, representation: Representation = 'dfa') {
  const result = buildDiagram({ regex, representation, showSink: false, stateLimit: DEFAULT_STATE_LIMIT });
  if (!result.ok) throw new Error(result.error.message);
  const layout = layoutDiagram(result.diagram);
  return buildScene(result.diagram, layout.positions, layout.shapes);
}

describe('scene', () => {
  it('describes every state with its name, position, and markers', () => {
    const scene = sceneOf('ab');
    expect(scene.states.map(({ name, initial, accepting }) => ({ name, initial, accepting }))).toEqual([
      { name: 'q0', initial: true, accepting: false },
      { name: 'q1', initial: false, accepting: false },
      { name: 'q2', initial: false, accepting: true },
    ]);
    expect(scene.states.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it('describes every edge with its states, path, and label', () => {
    const scene = sceneOf('ab*', 'min-dfa');
    expect(scene.edges.map(({ id, label }) => `${id}: ${label.text}`)).toEqual(['q0-q1: a', 'q1-q1: b']);
    expect(scene.edges[0]?.path).toMatch(/^M[-\d. ]+Q[-\d. ]+$/);
    expect(scene.edges[1]?.path).toMatch(/^M[-\d. ]+C[-\d. ]+$/);
  });

  it('bounds the single state of the empty regex with its initial arrow', () => {
    const { bounds, states } = sceneOf('');
    const [state] = states;
    if (!state) throw new Error('missing state');
    expect(bounds.minX).toBeLessThanOrEqual(state.x - STATE_RADIUS - INITIAL_ARROW_LENGTH);
    expect(bounds.maxX).toBeGreaterThanOrEqual(state.x + STATE_RADIUS);
    expect(bounds.minY).toBeLessThanOrEqual(state.y - STATE_RADIUS);
    expect(bounds.maxY).toBeGreaterThanOrEqual(state.y + STATE_RADIUS);
    expect(bounds.maxX - bounds.minX).toBeLessThan(200);
  });

  it('bounds everything that is drawn', () => {
    for (const regex of ['(a|b)*abb', 'a*', '[a-z]+@[a-z]+\\.(com|org)', '(ab)*', '\\d{2}-\\d{2}']) {
      for (const representation of ['enfa', 'nfa', 'dfa', 'min-dfa'] as const) {
        const { bounds, states, edges } = sceneOf(regex, representation);
        for (const { x, y } of states) {
          expect(x - STATE_RADIUS).toBeGreaterThanOrEqual(bounds.minX);
          expect(x + STATE_RADIUS).toBeLessThanOrEqual(bounds.maxX);
          expect(y - STATE_RADIUS).toBeGreaterThanOrEqual(bounds.minY);
          expect(y + STATE_RADIUS).toBeLessThanOrEqual(bounds.maxY);
        }
        for (const { label, path } of edges) {
          expect(label.x - label.width / 2).toBeGreaterThanOrEqual(bounds.minX);
          expect(label.x + label.width / 2).toBeLessThanOrEqual(bounds.maxX);
          expect(label.y).toBeGreaterThan(bounds.minY);
          expect(label.y).toBeLessThan(bounds.maxY);
          const numbers = [...path.matchAll(/-?\d+(\.\d+)?/g)].map((match) => Number(match[0]));
          const [startX, startY] = numbers;
          expect(startX).toBeGreaterThanOrEqual(bounds.minX);
          expect(startY).toBeGreaterThanOrEqual(bounds.minY);
        }
      }
    }
  });
});
