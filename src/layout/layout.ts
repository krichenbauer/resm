import { Graph, layout } from '@dagrejs/dagre';
import type { Diagram } from '../diagram/diagram.ts';
import { type Point, STATE_RADIUS, arcPoints, estimateLabelWidth } from './geometry.ts';

/** How an edge is drawn: as an arc between two states, or as a loop at one state. */
export type EdgeShape =
  | { readonly kind: 'arc'; readonly bend: number }
  | { readonly kind: 'loop'; readonly angle: number };

/** Where the states of a diagram go and how its edges are shaped, index by index. */
export interface DiagramLayout {
  readonly positions: readonly Point[];
  readonly shapes: readonly EdgeShape[];
}

/** Free space that an edge keeps around states it only passes. */
const CLEARANCE = STATE_RADIUS + 8;

/** Bends to try for an edge, gentlest first. */
const BENDS = [0, 0.16, -0.16, 0.3, -0.3, 0.48, -0.48];

/** Bends to try for an edge that has a counterpart in the opposite direction. */
const PAIRED_BENDS = [0.14, 0.26, 0.4, 0.56];

/** Directions to try for a loop, preferred first: up, down, then the diagonals and sides. */
const LOOP_ANGLES = [-2, 2, -1, -3, 1, 3, 0, 4].map((eighths) => (eighths * Math.PI) / 4);

/** Angle that a loop keeps free between itself and the nearest other edge of its state. */
const LOOP_ROOM = 0.8;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Positions from a layered left-to-right layout, which keeps connections short and crossings few. */
function placeStates(diagram: Diagram): Point[] {
  const graph = new Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 56, ranksep: 64 });
  diagram.states.forEach((_, index) => {
    graph.setNode(String(index), { width: STATE_RADIUS * 2, height: STATE_RADIUS * 2 });
  });
  for (const { from, to, label } of diagram.edges) {
    // Loops need no room between the layers.
    if (from === to) continue;
    graph.setEdge(String(from), String(to), { width: estimateLabelWidth(label), height: 18, labelpos: 'c' });
  }
  layout(graph);
  return diagram.states.map((_, index) => {
    const { x, y } = graph.node(String(index));
    return { x, y };
  });
}

/** The gentlest bend that keeps the edge clear of all `others`, or else the clearest one. */
function chooseBend(from: Point, to: Point, others: readonly Point[], candidates: readonly number[]): number {
  const samples = Math.max(8, Math.ceil(distance(from, to) / 8));
  let best = candidates[0] ?? 0;
  let bestClearance = -Infinity;
  for (const bend of candidates) {
    let clearance = Infinity;
    for (const point of arcPoints(from, to, bend, samples)) {
      for (const other of others) clearance = Math.min(clearance, distance(point, other));
    }
    if (clearance >= CLEARANCE) return bend;
    if (clearance > bestClearance) {
      best = bend;
      bestClearance = clearance;
    }
  }
  return best;
}

/** The first preferred direction with enough room, or else the one farthest from all `occupied` directions. */
function chooseLoopAngle(occupied: readonly number[]): number {
  let best = LOOP_ANGLES[0] ?? 0;
  let bestGap = -Infinity;
  for (const angle of LOOP_ANGLES) {
    const gap = Math.min(
      Infinity,
      ...occupied.map((other) => Math.abs(Math.atan2(Math.sin(angle - other), Math.cos(angle - other)))),
    );
    if (gap >= LOOP_ROOM) return angle;
    if (gap > bestGap + 1e-9) {
      best = angle;
      bestGap = gap;
    }
  }
  return best;
}

/** Computes where to draw the states of a diagram and how to shape its edges. */
export function layoutDiagram(diagram: Diagram): DiagramLayout {
  const positions = placeStates(diagram);
  const at = (state: number): Point => positions[state] ?? { x: 0, y: 0 };
  const connected = new Set(diagram.edges.map(({ from, to }) => `${from},${to}`));

  // Directions in which something already leaves or enters each state.
  const occupied: number[][] = diagram.states.map(({ initial }) => (initial ? [Math.PI] : []));
  for (const { from, to } of diagram.edges) {
    if (from === to) continue;
    const angle = Math.atan2(at(to).y - at(from).y, at(to).x - at(from).x);
    occupied[from]?.push(angle);
    occupied[to]?.push(angle + Math.PI);
  }

  const shapes = diagram.edges.map(({ from, to }): EdgeShape => {
    if (from === to) return { kind: 'loop', angle: chooseLoopAngle(occupied[from] ?? []) };
    const others = positions.filter((_, state) => state !== from && state !== to);
    const candidates = connected.has(`${to},${from}`) ? PAIRED_BENDS : BENDS;
    return { kind: 'arc', bend: chooseBend(at(from), at(to), others, candidates) };
  });

  return { positions, shapes };
}
