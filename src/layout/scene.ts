import type { Diagram } from '../diagram/diagram.ts';
import {
  type Point,
  STATE_RADIUS,
  arcGeometry,
  arcPoints,
  estimateLabelWidth,
  loopGeometry,
} from './geometry.ts';
import type { EdgeShape } from './layout.ts';

/** Length of the arrow that leads from a dot into the initial state. */
export const INITIAL_ARROW_LENGTH = 34;

/** Height reserved for a line of label text. */
const LABEL_HEIGHT = 18;

export interface SceneState {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly initial: boolean;
  readonly accepting: boolean;
}

export interface SceneEdge {
  /** The names of both states, such as `q0-q1`. */
  readonly id: string;
  /** SVG path data that ends at the outline of the target state. */
  readonly path: string;
  /** The label text with the middle of its box and its estimated width. */
  readonly label: { readonly text: string; readonly x: number; readonly y: number; readonly width: number };
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Everything that is drawn for a diagram, with concrete coordinates. */
export interface Scene {
  readonly states: readonly SceneState[];
  readonly edges: readonly SceneEdge[];
  /** The smallest box around all states, edges, labels, and the initial arrow. */
  readonly bounds: Bounds;
}

/**
 * Combines a diagram with the current positions of its states into what is
 * drawn. Edges are derived from the positions, so they follow moving states.
 */
export function buildScene(
  diagram: Diagram,
  positions: readonly Point[],
  shapes: readonly EdgeShape[],
): Scene {
  let bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const include = (x: number, y: number, halfWidth: number, halfHeight: number) => {
    bounds = {
      minX: Math.min(bounds.minX, x - halfWidth),
      minY: Math.min(bounds.minY, y - halfHeight),
      maxX: Math.max(bounds.maxX, x + halfWidth),
      maxY: Math.max(bounds.maxY, y + halfHeight),
    };
  };
  const at = (state: number): Point => positions[state] ?? { x: 0, y: 0 };

  const states = diagram.states.map((state, index) => {
    const { x, y } = at(index);
    include(x, y, STATE_RADIUS, STATE_RADIUS);
    if (state.initial) include(x - STATE_RADIUS - INITIAL_ARROW_LENGTH, y, 0, 0);
    return { ...state, x, y };
  });

  const edges = diagram.edges.map(({ from, to, label: text }, index) => {
    const shape = shapes[index] ?? { kind: 'arc', bend: 0 };
    const width = estimateLabelWidth(text);
    let geometry;
    if (shape.kind === 'loop') {
      geometry = loopGeometry(at(from), shape.angle);
      // The label lies just beyond the outermost point of the loop.
      include(geometry.label.x, geometry.label.y, STATE_RADIUS, STATE_RADIUS);
    } else {
      geometry = arcGeometry(at(from), at(to), shape.bend, width);
      for (const point of arcPoints(at(from), at(to), shape.bend, 9)) include(point.x, point.y, 0, 0);
    }
    include(geometry.label.x, geometry.label.y, width / 2, LABEL_HEIGHT / 2);
    const id = `${diagram.states[from]?.name}-${diagram.states[to]?.name}`;
    return { id, path: geometry.path, label: { text, ...geometry.label, width } };
  });

  return { states, edges, bounds };
}
