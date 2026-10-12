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

/** How far below the other states the sink state is placed, between the outlines. */
const SINK_DROP = 110;

/**
 * The layer of every state: the length of the longest path of `edges` that
 * leads to it. The edges must not form a cycle.
 */
function longestPathRanks(count: number, edges: readonly (readonly [number, number])[]): number[] {
  const targets: number[][] = Array.from({ length: count }, () => []);
  const pending = new Array<number>(count).fill(0);
  for (const [from, to] of edges) {
    targets[from]?.push(to);
    pending[to] = (pending[to] ?? 0) + 1;
  }
  const ranks = new Array<number>(count).fill(0);
  const ready = pending.flatMap((incoming, state) => (incoming === 0 ? [state] : []));
  for (const state of ready) {
    for (const target of targets[state] ?? []) {
      ranks[target] = Math.max(ranks[target] ?? 0, (ranks[state] ?? 0) + 1);
      pending[target] = (pending[target] ?? 0) - 1;
      if (pending[target] === 0) ready.push(target);
    }
  }
  return ranks;
}

/**
 * Positions from a layered left-to-right layout, which keeps connections
 * short and crossings few. Not everything takes part in it:
 *
 * - Back edges and loops are drawn around the states afterwards. Reserving
 *   lanes for them would push the states of a simple chain out of line.
 * - The sink state is placed below all others, because most of them lead to it.
 * - The layout reserves a lane across every layer that an edge skips. That
 *   suits a few long edges, but its cost explodes when there are many, so
 *   only the shortest edges get lanes, up to a budget.
 */
function placeStates(diagram: Diagram): Point[] {
  const count = diagram.states.length;
  const backEdges = findBackEdges(diagram);
  const forward = diagram.edges.flatMap(({ from, to, label }, index) =>
    from === to || backEdges.has(index) || from === diagram.sink || to === diagram.sink
      ? []
      : [{ from, to, label }],
  );
  const ranks = longestPathRanks(
    count,
    forward.map(({ from, to }) => [from, to]),
  );
  const span = ({ from, to }: { from: number; to: number }) => (ranks[to] ?? 0) - (ranks[from] ?? 0);

  const graph = new Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 56, ranksep: 64 });
  diagram.states.forEach((_, index) => {
    if (index !== diagram.sink) graph.setNode(String(index), { width: STATE_RADIUS * 2, height: STATE_RADIUS * 2 });
  });
  // Every state has an edge from the layer directly before it, so the edges
  // that skip no layer are enough to keep all layers in order.
  let laneBudget = 2 * count + 50;
  for (const edge of [...forward].sort((a, b) => span(a) - span(b))) {
    laneBudget -= span(edge) - 1;
    if (laneBudget < 0) break;
    graph.setEdge(String(edge.from), String(edge.to), {
      width: estimateLabelWidth(edge.label),
      height: 18,
      labelpos: 'c',
    });
  }
  layout(graph);

  const positions = diagram.states.map((_, index): Point => {
    if (index === diagram.sink) return { x: 0, y: 0 };
    const { x, y } = graph.node(String(index));
    return { x, y };
  });
  if (diagram.sink !== undefined) {
    const others = positions.filter((_, index) => index !== diagram.sink);
    const xs = others.map((position) => position.x);
    positions[diagram.sink] = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: Math.max(...others.map((position) => position.y)) + STATE_RADIUS * 2 + SINK_DROP,
    };
  }
  return positions;
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

/** The distance between a point and the line segment from `a` to `b`. */
function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared === 0 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  const share = Math.min(1, Math.max(0, along));
  return Math.hypot(point.x - a.x - share * dx, point.y - a.y - share * dy);
}

/** Number of straight pieces that stand in for the curve of an edge when its surroundings are checked. */
const CURVE_PIECES = 20;

/** The largest radius of any obstacle. */
const MAX_OBSTACLE_RADIUS = STATE_RADIUS;

/**
 * How much more room than required there is between an edge with the given
 * bend and the obstacles; negative if something is too close. The search stops
 * early once the result is negative and below `giveUpBelow`.
 */
function roomAround(
  from: Point,
  to: Point,
  bend: number,
  labelWidth: number,
  others: readonly Obstacle[],
  giveUpBelow: number,
): number {
  const curve = arcPoints(from, to, bend, CURVE_PIECES + 1);
  const { label } = arcGeometry(from, to, bend, labelWidth);
  const labelPoints = [-labelWidth / 2, 0, labelWidth / 2].map((offset) => ({ x: label.x + offset, y: label.y }));

  // Only obstacles near the box around the curve and its label can matter.
  const reach = MAX_OBSTACLE_RADIUS + LABEL_CLEARANCE;
  const all = [...curve, ...labelPoints];
  const minX = Math.min(...all.map((point) => point.x)) - reach;
  const maxX = Math.max(...all.map((point) => point.x)) + reach;
  const minY = Math.min(...all.map((point) => point.y)) - reach;
  const maxY = Math.max(...all.map((point) => point.y)) + reach;

  let room = Infinity;
  for (const other of others) {
    if (other.x < minX || other.x > maxX || other.y < minY || other.y > maxY) continue;
    for (let piece = 0; piece < CURVE_PIECES; piece++) {
      const [start, end] = [curve[piece], curve[piece + 1]];
      if (start && end) room = Math.min(room, distanceToSegment(other, start, end) - other.radius - CLEARANCE);
    }
    for (const point of labelPoints) {
      room = Math.min(room, distance(point, other) - other.radius - LABEL_CLEARANCE);
    }
    if (room < 0 && room < giveUpBelow) return room;
  }
  return room;
}

/** The gentlest bend that keeps the edge and its label clear of all `others`, or else the clearest one. */
function chooseBend(
  from: Point,
  to: Point,
  labelWidth: number,
  others: readonly Obstacle[],
  candidates: readonly number[],
): number {
  let best = candidates[0] ?? 0;
  let bestRoom = -Infinity;
  for (const bend of candidates) {
    const room = roomAround(from, to, bend, labelWidth, others, bestRoom);
    if (room >= 0) return bend;
    if (room > bestRoom) {
      best = bend;
      bestRoom = room;
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
