/* eslint-disable @typescript-eslint/no-non-null-assertion --
   All indexes are below the number of nodes, and these loops run several times per frame. */
import { type Point, STATE_RADIUS } from '../layout/geometry.ts';

/** A node of the simulated graph: `key` identifies it across graphs, `target` is where it belongs. */
export interface SimulationNode {
  readonly key: string;
  readonly target: Point;
}

/** A connection between two nodes, as indexes into the list of nodes. */
export type SimulationLink = readonly [from: number, to: number];

/** Length of one integration step in seconds. Short steps keep stiff springs stable. */
const STEP = 1 / 120;

/** Longest time that one call advances, so a pause of the page does not cause a burst of work. */
const MAX_ADVANCE = 0.1;

/** Pull of a node towards its target, per unit of distance. */
const TARGET_STIFFNESS = 70;

/** Pull between connected nodes towards their relative target position. */
const LINK_STIFFNESS = 50;

/** Friction. With the target stiffness it leaves a slight overshoot, which makes the motion springy. */
const DAMPING = 11;

/** Push between nodes that are closer than `MIN_DISTANCE`. */
const REPULSION_STIFFNESS = 300;
const MIN_DISTANCE = STATE_RADIUS * 2 + 10;

/** A node is at rest when it is this close to its target and this slow. */
const REST_DISTANCE = 0.25;
const REST_SPEED = 1;

/** How far a new node starts from the node it grows out of, as a share of the way to its target. */
const SPAWN_SHARE = 0.15;

/** Fastest speed a released node keeps from being dragged, in units per second. */
const MAX_RELEASE_SPEED = 3000;

/**
 * Moves the states of a diagram as a system of damped springs. Every node is
 * pulled towards the target position that the layout gave it, connected nodes
 * are pulled towards their relative target position, and nodes that get too
 * close push each other away. So the graph settles into its layout, and a
 * dragged node takes its neighbors along.
 */
export class Simulation {
  private keys: string[] = [];
  private x = new Float64Array(0);
  private y = new Float64Array(0);
  private vx = new Float64Array(0);
  private vy = new Float64Array(0);
  private targetX = new Float64Array(0);
  private targetY = new Float64Array(0);
  private held: boolean[] = [];
  /** Where each held node was when time last advanced, to measure how fast it is dragged. */
  private draggedFromX = new Float64Array(0);
  private draggedFromY = new Float64Array(0);
  private links: { readonly a: number; readonly b: number; readonly stiffness: number }[] = [];
  private remainder = 0;
  private atRest = true;

  /** Whether every node is at rest in its target position and none is held. */
  get settled(): boolean {
    return this.atRest;
  }

  /**
   * Replaces the simulated graph. With `animate`, nodes whose key is already
   * known keep their position and velocity, and new nodes start next to a node
   * that leads to them. Without it, every node starts at rest in its target.
   */
  setGraph(
    nodes: readonly SimulationNode[],
    links: readonly SimulationLink[],
    options: { animate: boolean },
  ): void {
    const known = new Map(this.keys.map((key, index) => [key, index]));
    const count = nodes.length;
    const x = new Float64Array(count);
    const y = new Float64Array(count);
    const vx = new Float64Array(count);
    const vy = new Float64Array(count);
    const placed = new Array<boolean>(count).fill(false);

    nodes.forEach(({ key, target }, index) => {
      const previous = options.animate ? known.get(key) : undefined;
      if (previous === undefined) return;
      x[index] = this.x[previous] ?? target.x;
      y[index] = this.y[previous] ?? target.y;
      vx[index] = this.vx[previous] ?? 0;
      vy[index] = this.vy[previous] ?? 0;
      placed[index] = true;
    });

    // New nodes, in order, so that a chain of them unfolds from the last known node.
    nodes.forEach(({ target }, index) => {
      if (placed[index]) return;
      const origin = options.animate
        ? (links.find(([from, to]) => to === index && placed[from]) ??
            links.find(([from, to]) => from === index && placed[to]))
        : undefined;
      const neighbor = origin?.[0] === index ? origin[1] : origin?.[0];
      if (neighbor === undefined) {
        x[index] = target.x;
        y[index] = target.y;
      } else {
        const neighborX = x[neighbor] ?? target.x;
        const neighborY = y[neighbor] ?? target.y;
        x[index] = neighborX + (target.x - neighborX) * SPAWN_SHARE;
        y[index] = neighborY + (target.y - neighborY) * SPAWN_SHARE;
      }
      placed[index] = true;
    });

    const degree = new Array<number>(count).fill(0);
    const proper = links.filter(([a, b]) => a !== b);
    for (const [a, b] of proper) {
      degree[a] = (degree[a] ?? 0) + 1;
      degree[b] = (degree[b] ?? 0) + 1;
    }

    this.keys = nodes.map((node) => node.key);
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.targetX = Float64Array.from(nodes, (node) => node.target.x);
    this.targetY = Float64Array.from(nodes, (node) => node.target.y);
    this.held = new Array<boolean>(count).fill(false);
    this.draggedFromX = new Float64Array(count);
    this.draggedFromY = new Float64Array(count);
    // Weaker links for nodes with many connections keep their combined pull,
    // and with it the highest frequency in the system, within stable bounds.
    this.links = proper.map(([a, b]) => ({
      a,
      b,
      stiffness: LINK_STIFFNESS / Math.sqrt(Math.max(degree[a] ?? 1, degree[b] ?? 1)),
    }));
    this.remainder = 0;
    this.atRest = false;
    this.rest();
  }

  /** The current positions of the nodes, in the order they were given. */
  positions(): Point[] {
    return Array.from(this.x, (x, index) => ({ x, y: this.y[index] ?? 0 }));
  }

  /** Takes a node out of the simulation: it stays where `moveTo` puts it until it is released. */
  grab(index: number): void {
    if (index < 0 || index >= this.keys.length) return;
    this.held[index] = true;
    this.vx[index] = 0;
    this.vy[index] = 0;
    this.draggedFromX[index] = this.x[index]!;
    this.draggedFromY[index] = this.y[index]!;
    this.atRest = false;
  }

  moveTo(index: number, point: Point): void {
    if (!this.held[index]) return;
    this.x[index] = point.x;
    this.y[index] = point.y;
  }

  /** Hands a grabbed node back to the springs, which return it to its target. */
  release(index: number): void {
    if (!this.held[index]) return;
    this.held[index] = false;
    // The node keeps the speed at which it was dragged, within reason.
    const speed = Math.hypot(this.vx[index]!, this.vy[index]!);
    if (speed > MAX_RELEASE_SPEED) {
      this.vx[index]! *= MAX_RELEASE_SPEED / speed;
      this.vy[index]! *= MAX_RELEASE_SPEED / speed;
    }
  }

  /** Advances the simulation by the given time in seconds. */
  step(seconds: number): void {
    if (this.atRest) return;
    this.remainder += Math.min(seconds, MAX_ADVANCE);
    let advanced = 0;
    while (this.remainder >= STEP) {
      this.integrate();
      this.remainder -= STEP;
      advanced += STEP;
    }
    if (advanced === 0) return;

    for (let index = 0; index < this.keys.length; index++) {
      if (!this.held[index]) continue;
      this.vx[index] = (this.x[index]! - this.draggedFromX[index]!) / advanced;
      this.vy[index] = (this.y[index]! - this.draggedFromY[index]!) / advanced;
      this.draggedFromX[index] = this.x[index]!;
      this.draggedFromY[index] = this.y[index]!;
    }
    this.rest();
  }

  private integrate(): void {
    const { x, y, vx, vy, targetX, targetY, held } = this;
    const count = this.keys.length;
    const ax = new Float64Array(count);
    const ay = new Float64Array(count);

    for (let index = 0; index < count; index++) {
      ax[index] = TARGET_STIFFNESS * (targetX[index]! - x[index]!) - DAMPING * vx[index]!;
      ay[index] = TARGET_STIFFNESS * (targetY[index]! - y[index]!) - DAMPING * vy[index]!;
    }

    for (const { a, b, stiffness } of this.links) {
      // How far the two nodes are from their relative target position.
      const dx = x[b]! - x[a]! - (targetX[b]! - targetX[a]!);
      const dy = y[b]! - y[a]! - (targetY[b]! - targetY[a]!);
      ax[a]! += stiffness * dx;
      ay[a]! += stiffness * dy;
      ax[b]! -= stiffness * dx;
      ay[b]! -= stiffness * dy;
    }

    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) {
        const dx = x[b]! - x[a]!;
        const dy = y[b]! - y[a]!;
        if (Math.abs(dx) >= MIN_DISTANCE || Math.abs(dy) >= MIN_DISTANCE) continue;
        const distance = Math.hypot(dx, dy);
        if (distance >= MIN_DISTANCE) continue;
        // Nodes in exactly the same place are pushed apart along a fixed direction.
        const ux = distance > 0 ? dx / distance : 1;
        const uy = distance > 0 ? dy / distance : 0;
        const push = REPULSION_STIFFNESS * (MIN_DISTANCE - distance);
        ax[a]! -= push * ux;
        ay[a]! -= push * uy;
        ax[b]! += push * ux;
        ay[b]! += push * uy;
      }
    }

    for (let index = 0; index < count; index++) {
      if (held[index]) continue;
      vx[index]! += ax[index]! * STEP;
      vy[index]! += ay[index]! * STEP;
      x[index]! += vx[index]! * STEP;
      y[index]! += vy[index]! * STEP;
    }
  }

  /** Stops the simulation in the target positions once nothing visibly moves any more. */
  private rest(): void {
    const count = this.keys.length;
    for (let index = 0; index < count; index++) {
      if (this.held[index]) return;
      const distance = Math.hypot(this.targetX[index]! - this.x[index]!, this.targetY[index]! - this.y[index]!);
      const speed = Math.hypot(this.vx[index]!, this.vy[index]!);
      if (distance > REST_DISTANCE || speed > REST_SPEED) return;
    }
    this.x.set(this.targetX);
    this.y.set(this.targetY);
    this.vx.fill(0);
    this.vy.fill(0);
    this.atRest = true;
  }
}
