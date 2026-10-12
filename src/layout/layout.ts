import { Graph, layout } from '@dagrejs/dagre';
import type { Diagram } from '../diagram/diagram.ts';
import {
  type Point,
  STATE_RADIUS,
  arcGeometry,
  arcPoints,
  estimateLabelWidth,
  loopGeometry,
} from './geometry.ts';

/** How an edge is drawn: as an arc between two states, or as a loop at one state. */
export type EdgeShape =
  | { readonly kind: 'arc'; readonly bend: number }
  | { readonly kind: 'loop'; readonly angle: number };

/** Where the states of a diagram go and how its edges are shaped, index by index. */
export interface DiagramLayout {
  readonly positions: readonly Point[];
  readonly shapes: readonly EdgeShape[];
}

/** Something round that edges and their labels lead around: a state, or part of a loop. */
interface Obstacle extends Point {
  readonly radius: number;
}

/** Free space that an edge keeps around an obstacle. */
const CLEARANCE = 8;

/** Free space that the label of an edge keeps around an obstacle. */
const LABEL_CLEARANCE = 10;

/** Bends to try for an edge, gentlest first. */
const BENDS = [0, 0.16, -0.16, 0.3, -0.3, 0.48, -0.48];

/** Bends to try for an edge that has a counterpart in the opposite direction. */
const PAIRED_BENDS = [0.14, 0.26, 0.4, 0.56];

/** Directions to try for a loop, preferred first: up, down, then the diagonals and sides. */
const LOOP_ANGLES = [-2, 2, -1, -3, 1, 3, 0, 4].map((eighths) => (eighths * Math.PI) / 4);

/** Angle that a loop keeps free between itself and the nearest other edge of its state. */
const LOOP_ROOM = 0.8;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The edges that lead back to a state on the path by which a depth-first
 * search from the initial state reached them. Without them, and without
 * loops, the diagram has no cycles.
 */
function findBackEdges(diagram: Diagram): Set<number> {
  const outgoing: number[][] = diagram.states.map(() => []);
  diagram.edges.forEach(({ from }, index) => outgoing[from]?.push(index));

  const backEdges = new Set<number>();
  const visited = new Set<number>();
  const onPath = new Set<number>();
  for (let root = 0; root < diagram.states.length; root++) {
    if (visited.has(root)) continue;
    // Each entry is a state with the position of its next edge to follow.
    const path: [state: number, next: number][] = [[root, 0]];
    visited.add(root);
    onPath.add(root);
    for (let top = path.at(-1); top; top = path.at(-1)) {
      const [state, next] = top;
      const index = outgoing[state]?.[next];
      const target = index === undefined ? undefined : diagram.edges[index]?.to;
      if (index === undefined || target === undefined) {
        onPath.delete(state);
        path.pop();
        continue;
      }
      top[1]++;
      if (onPath.has(target)) {
        if (target !== state) backEdges.add(index);
      } else if (!visited.has(target)) {
        visited.add(target);
        onPath.add(target);
        path.push([target, 0]);
      }
    }
  }
  return backEdges;
}

/**
 * Positions from a layered left-to-right layout, which keeps connections
 * short and crossings few. Only the edges that lead forward take part: back
 * edges and loops are drawn around the states afterwards, and reserving
 * lanes for them would push the states of a simple chain out of line.
 */
function placeStates(diagram: Diagram): Point[] {
  const graph = new Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 56, ranksep: 64 });
  diagram.states.forEach((_, index) => {
    graph.setNode(String(index), { width: STATE_RADIUS * 2, height: STATE_RADIUS * 2 });
  });
  const backEdges = findBackEdges(diagram);
  diagram.edges.forEach(({ from, to, label }, index) => {
    if (from === to || backEdges.has(index)) return;
    graph.setEdge(String(from), String(to), { width: estimateLabelWidth(label), height: 18, labelpos: 'c' });
  });
  layout(graph);
  return diagram.states.map((_, index) => {
    const { x, y } = graph.node(String(index));
    return { x, y };
  });
}

/** The space that the loop of a state takes up: the loop itself and its label. */
function loopObstacles(center: Point, angle: number): Obstacle[] {
  const { label } = loopGeometry(center, angle);
  const between = (share: number) => ({
    x: center.x + (label.x - center.x) * share,
    y: center.y + (label.y - center.y) * share,
  });
  return [
    { ...between(0.6), radius: STATE_RADIUS * 0.55 },
    { ...label, radius: STATE_RADIUS * 0.4 },
  ];
}

/** The gentlest bend that keeps the edge and its label clear of all `others`, or else the clearest one. */
function chooseBend(
  from: Point,
  to: Point,
  labelWidth: number,
  others: readonly Obstacle[],
  candidates: readonly number[],
): number {
  const samples = Math.max(8, Math.ceil(distance(from, to) / 8));
  let best = candidates[0] ?? 0;
  let bestMargin = -Infinity;
  for (const bend of candidates) {
    // How much more room than required there is; negative if something is too close.
    let margin = Infinity;
    const { label } = arcGeometry(from, to, bend, labelWidth);
    const labelPoints = [-labelWidth / 2, 0, labelWidth / 2].map((offset) => ({ x: label.x + offset, y: label.y }));
    for (const other of others) {
      for (const point of arcPoints(from, to, bend, samples)) {
        margin = Math.min(margin, distance(point, other) - other.radius - CLEARANCE);
      }
      for (const point of labelPoints) {
        margin = Math.min(margin, distance(point, other) - other.radius - LABEL_CLEARANCE);
      }
    }
    if (margin >= 0) return bend;
    if (margin > bestMargin) {
      best = bend;
      bestMargin = margin;
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

  // Loops first: the arcs then lead around them as well as around the states.
  const obstacles: Obstacle[][] = positions.map((position) => [{ ...position, radius: STATE_RADIUS }]);
  const loopAngles = new Map<number, number>();
  for (const { from, to } of diagram.edges) {
    if (from !== to) continue;
    const angle = chooseLoopAngle(occupied[from] ?? []);
    loopAngles.set(from, angle);
    obstacles[from]?.push(...loopObstacles(at(from), angle));
  }

  const shapes = diagram.edges.map(({ from, to, label }): EdgeShape => {
    if (from === to) return { kind: 'loop', angle: loopAngles.get(from) ?? 0 };
    const others = obstacles.flatMap((own, state) => (state === from || state === to ? [] : own));
    const candidates = connected.has(`${to},${from}`) ? PAIRED_BENDS : BENDS;
    return { kind: 'arc', bend: chooseBend(at(from), at(to), estimateLabelWidth(label), others, candidates) };
  });

  return { positions, shapes };
}
