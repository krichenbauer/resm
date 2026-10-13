import { Graph, layout } from '@dagrejs/dagre';
import type { Diagram } from '../diagram/diagram.ts';
import {
  type LabelPlacement,
  type Point,
  STATE_RADIUS,
  arcGeometry,
  arcPoints,
  estimateLabelWidth,
  loopGeometry,
  loopPoints,
} from './geometry.ts';
import { INITIAL_ARROW_LENGTH } from './scene.ts';

/** How an edge is drawn: as an arc between two states, or as a loop at one state. */
export type EdgeShape =
  | { readonly kind: 'arc'; readonly bend: number; readonly label?: LabelPlacement }
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
const SINK_DROP = 150;

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

/** An axis-parallel box. */
interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** A straight piece of the curve of an edge, with the index of that edge. */
interface Piece {
  readonly edge: number;
  readonly a: Point;
  readonly b: Point;
}

/** Half the height of the text of a label, and the free space that a label keeps around its text. */
const LABEL_HALF_HEIGHT = 7;
const LABEL_MARGIN = 3;

/** Places to try for a label along its edge, the middle first, and the sides of the edge. */
const LABEL_SHARES = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.12, 0.88];

/** How bad it is for a label to lie on a state, to be crossed by an edge, and to touch another label. */
const STATE_COST = 100;
const CROSSING_COST = 30;
const OVERLAP_COST = 30;

/** Size of the cells of the grid in which the pieces of all curves are looked up. */
const GRID_CELL = 64;

const gridKey = (column: number, row: number) => ((column & 0xffff) << 16) | (row & 0xffff);

function cellsOf(box: Box): number[] {
  const keys: number[] = [];
  for (let column = Math.floor(box.minX / GRID_CELL); column <= Math.floor(box.maxX / GRID_CELL); column++) {
    for (let row = Math.floor(box.minY / GRID_CELL); row <= Math.floor(box.maxY / GRID_CELL); row++) {
      keys.push(gridKey(column, row));
    }
  }
  return keys;
}

const boxesOverlap = (a: Box, b: Box) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/** Whether the line segment from `a` to `b` passes through the box. */
function pieceCrossesBox({ a, b }: Piece, box: Box): boolean {
  // Clip the segment against the four sides of the box; something is left if it passes through.
  let enter = 0;
  let leave = 1;
  const clip = (delta: number, distanceToMin: number, distanceToMax: number): boolean => {
    if (delta === 0) return distanceToMin <= 0 && distanceToMax >= 0;
    const first = distanceToMin / delta;
    const second = distanceToMax / delta;
    enter = Math.max(enter, Math.min(first, second));
    leave = Math.min(leave, Math.max(first, second));
    return enter <= leave;
  };
  return clip(b.x - a.x, box.minX - a.x, box.maxX - a.x) && clip(b.y - a.y, box.minY - a.y, box.maxY - a.y);
}

function labelBox(center: Point, width: number): Box {
  return {
    minX: center.x - width / 2 - LABEL_MARGIN,
    maxX: center.x + width / 2 + LABEL_MARGIN,
    minY: center.y - LABEL_HALF_HEIGHT - LABEL_MARGIN,
    maxY: center.y + LABEL_HALF_HEIGHT + LABEL_MARGIN,
  };
}

/**
 * Finds a place for the label of every edge between two states where it can
 * be read: not on a state, not crossed by another edge, and not on another
 * label. Labels prefer the middle of their edge on the outer side of its
 * bend, and move along the edge or to its other side only as far as needed.
 * Where no free place exists, the least obstructed one is taken.
 */
function placeLabels(diagram: Diagram, positions: readonly Point[], shapes: readonly EdgeShape[]): EdgeShape[] {
  const at = (state: number): Point => positions[state] ?? { x: 0, y: 0 };
  const widths = diagram.edges.map(({ label }) => estimateLabelWidth(label));

  // All curves as straight pieces, in a grid for quick lookup of those near a label.
  const pieces: Piece[] = [];
  const grid = new Map<number, number[]>();
  const addCurve = (edge: number, points: readonly Point[]) => {
    for (let index = 0; index + 1 < points.length; index++) {
      const [a, b] = [points[index], points[index + 1]];
      if (!a || !b) continue;
      const box = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
      for (const key of cellsOf(box)) {
        let cell = grid.get(key);
        if (!cell) grid.set(key, (cell = []));
        cell.push(pieces.length);
      }
      pieces.push({ edge, a, b });
    }
  };
  diagram.edges.forEach(({ from, to }, index) => {
    const shape = shapes[index];
    if (shape?.kind === 'loop') addCurve(index, loopPoints(at(from), shape.angle, 13));
    else if (shape) addCurve(index, arcPoints(at(from), at(to), shape.bend, CURVE_PIECES + 1));
  });
  diagram.states.forEach(({ initial }, state) => {
    const { x, y } = at(state);
    // The initial arrow is in the way of labels like any edge.
    if (initial) addCurve(-1, [{ x: x - STATE_RADIUS - INITIAL_ARROW_LENGTH, y }, { x: x - STATE_RADIUS, y }]);
  });

  // The labels of loops have their fixed place; the others are found one by one.
  const boxes: (Box | undefined)[] = diagram.edges.map(({ from }, index) => {
    const shape = shapes[index];
    return shape?.kind === 'loop' ? labelBox(loopGeometry(at(from), shape.angle).label, widths[index] ?? 0) : undefined;
  });

  /** What is in the way of a label in the given box, apart from other labels: states and edges. */
  const obstruction = (edge: number, box: Box): number => {
    let cost = 0;
    for (const center of positions) {
      const dx = Math.max(box.minX - center.x, 0, center.x - box.maxX);
      const dy = Math.max(box.minY - center.y, 0, center.y - box.maxY);
      if (Math.hypot(dx, dy) < STATE_RADIUS) cost += STATE_COST;
    }
    const crossing = new Set<number>();
    for (const key of cellsOf(box)) {
      for (const index of grid.get(key) ?? []) {
        const piece = pieces[index];
        if (piece && piece.edge !== edge && !crossing.has(piece.edge) && pieceCrossesBox(piece, box)) {
          crossing.add(piece.edge);
        }
      }
    }
    return cost + crossing.size * CROSSING_COST;
  };

  // The places that each label could take, in order of preference, with what obstructs them.
  const candidates = diagram.edges.map(({ from, to }, index) => {
    const shape = shapes[index];
    if (shape?.kind !== 'arc') return [];
    const width = widths[index] ?? 0;
    const outer: 1 | -1 = shape.bend < 0 ? -1 : 1;
    const inner: 1 | -1 = outer === 1 ? -1 : 1;
    return LABEL_SHARES.flatMap((share) =>
      [outer, inner].map((side) => {
        const placement: LabelPlacement = { at: share, side };
        const box = labelBox(arcGeometry(at(from), at(to), shape.bend, width, placement).label, width);
        // Small costs express the preference for the middle and the outer side among free places.
        const preference = Math.abs(share - 0.5) * 4 + (side === outer ? 0 : 1);
        return { placement, box, cost: obstruction(index, box) + preference };
      }),
    );
  });

  // Labels with the fewest free places choose first; otherwise a label with
  // plenty of room could take the only place that is left for another one.
  const freePlaces = candidates.map((places) => places.filter(({ cost }) => cost < CROSSING_COST).length);
  const order = candidates
    .flatMap((places, index) => (places.length > 0 ? [index] : []))
    .sort((a, b) => (freePlaces[a] ?? 0) - (freePlaces[b] ?? 0) || (widths[b] ?? 0) - (widths[a] ?? 0) || a - b);

  // The labels that are placed so far, in the same kind of grid as the curves.
  const labelGrid = new Map<number, Set<number>>();
  const moveLabel = (index: number, box: Box | undefined) => {
    const previous = boxes[index];
    if (previous) for (const key of cellsOf(previous)) labelGrid.get(key)?.delete(index);
    boxes[index] = box;
    if (!box) return;
    for (const key of cellsOf(box)) {
      let cell = labelGrid.get(key);
      if (!cell) labelGrid.set(key, (cell = new Set()));
      cell.add(index);
    }
  };
  boxes.forEach((box, index) => moveLabel(index, box));

  const overlappingLabels = (index: number, box: Box): number => {
    const overlapping = new Set<number>();
    for (const key of cellsOf(box)) {
      for (const other of labelGrid.get(key) ?? []) {
        const otherBox = boxes[other];
        if (other !== index && otherBox && boxesOverlap(box, otherBox)) overlapping.add(other);
      }
    }
    return overlapping.size;
  };

  const placements: (LabelPlacement | undefined)[] = shapes.map(() => undefined);
  // The second round lets every label react to the labels that were placed after it.
  for (let round = 0; round < 2; round++) {
    for (const index of order) {
      let best: { placement: LabelPlacement; box: Box; cost: number } | undefined;
      for (const { placement, box, cost: ownCost } of candidates[index] ?? []) {
        if (best && best.cost <= ownCost) continue;
        const cost = ownCost + overlappingLabels(index, box) * OVERLAP_COST;
        if (!best || cost < best.cost) best = { placement, box, cost };
      }
      placements[index] = best?.placement;
      moveLabel(index, best?.box);
    }
  }

  return shapes.map((shape, index) => {
    const label = placements[index];
    return shape.kind === 'arc' && label ? { ...shape, label } : shape;
  });
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
    let candidates = connected.has(`${to},${from}`) ? PAIRED_BENDS : BENDS;
    // The edges to a sink state fill the space below the other states, so the
    // edges among those states make way and bend upwards where they can. Up is
    // to the left of an edge that leads to the right, and the other way round.
    const leadsLeft = at(to).x < at(from).x;
    if (diagram.sink !== undefined && from !== diagram.sink && to !== diagram.sink && leadsLeft && candidates === BENDS) {
      candidates = BENDS.map((bend) => -bend);
    }
    return { kind: 'arc', bend: chooseBend(at(from), at(to), estimateLabelWidth(label), others, candidates) };
  });

  return { positions, shapes: placeLabels(diagram, positions, shapes) };
}
