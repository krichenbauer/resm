import { LitElement, type PropertyValues, css, html, nothing, svg } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import type { Diagram } from '../diagram/diagram.ts';
import { type Point, STATE_RADIUS } from '../layout/geometry.ts';
import type { DiagramLayout } from '../layout/layout.ts';
import {
  type Bounds,
  INITIAL_ARROW_LENGTH,
  type SceneEdge,
  type SceneState,
  buildScene,
  edgeKey,
} from '../layout/scene.ts';
import { type Area, adjustView, fitView, panBy, toWorld, viewBoxOf, zoomAt } from '../layout/viewport.ts';
import { ShapeMotion } from '../motion/shape-motion.ts';
import { Simulation } from '../motion/simulation.ts';
import { ViewMotion } from '../motion/view-motion.ts';

/** Gap between the two outlines of an accepting state. */
const ACCEPTING_GAP = 4;

/** Zoom per pixel of wheel movement, as an exponent. One notch of a mouse wheel is about 100 pixels. */
const WHEEL_ZOOM = 0.002;

/** Pinching on a trackpad arrives as wheel events with small distances and the control key set. */
const TRACKPAD_PINCH_ZOOM = 0.01;

/** Longest time between two frames that is simulated, in seconds. */
const MAX_FRAME = 0.1;

/** A diagram to show, and whether to move there from the diagram shown before or to switch at once. */
export interface DiagramUpdate {
  readonly diagram: Diagram;
  readonly layout: DiagramLayout;
  readonly animate: boolean;
}

/** What the pointers on the canvas are currently doing. */
type Gesture =
  | { readonly kind: 'drag'; readonly state: number; readonly grip: Point }
  | { readonly kind: 'pan'; readonly last: Point }
  | { readonly kind: 'pinch'; readonly center: Point; readonly spread: number };

/**
 * Draws a diagram on an infinite canvas that can be panned and zoomed. The
 * states are moved by a spring simulation towards the positions of the layout,
 * so the graph settles into place after every change and after dragging.
 */
@customElement('resm-diagram')
export class ResmDiagram extends LitElement {
  static override styles = css`
    :host {
      display: block;
      flex: 1;
      min-height: 0;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      cursor: grab;
      /* Panning, pinching, and dragging are handled here, not by the browser. */
      touch-action: none;
    }

    svg.grabbing,
    svg.grabbing .state {
      cursor: grabbing;
    }

    .state,
    .edge {
      animation: appear 250ms ease-out;
    }

    @keyframes appear {
      from {
        opacity: 0;
      }
    }

    path {
      fill: none;
      stroke: var(--resm-line);
      stroke-width: 1.5;
    }

    marker path,
    .initial-dot {
      fill: var(--resm-line);
      stroke: none;
    }

    .outline {
      fill: var(--resm-state);
      stroke: var(--resm-line);
      stroke-width: 1.5;
    }

    text {
      fill: var(--resm-text);
      text-anchor: middle;
      dominant-baseline: central;
      user-select: none;
      -webkit-user-select: none;
    }

    .name {
      font: 15px system-ui, sans-serif;
    }

    .index {
      font-size: 11px;
    }

    .edge text {
      font: 13px ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
      /* A halo in the background color keeps labels legible where they cross a line. */
      paint-order: stroke;
      stroke: var(--resm-surface);
      stroke-width: 4px;
      stroke-linejoin: round;
    }
  `;

  @property({ attribute: false }) shown?: DiagramUpdate;

  private diagram?: Diagram;
  /** The bounds of the diagram once it has settled; the view is fitted to these, not to states in motion. */
  private settledBounds?: Bounds;
  private area: Area = { width: 0, height: 0 };
  private readonly simulation = new Simulation();
  private readonly shapeMotion = new ShapeMotion();
  private readonly viewMotion = new ViewMotion({ x: 0, y: 0, scale: 1 });
  /** Whether the view has been fitted to a diagram yet. Until then there is nothing to move it from. */
  private viewFitted = false;

  private readonly pointers = new Map<number, Point>();
  private gesture?: Gesture;
  private frame = 0;
  private lastFrameTime = 0;

  private readonly resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;
    this.area = { width: entry.contentRect.width, height: entry.contentRect.height };
    this.keepDiagramVisible(true);
    this.wake();
  });

  override connectedCallback(): void {
    super.connectedCallback();
    this.resizeObserver.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('shown') && this.shown) this.show(this.shown);
  }

  private show({ diagram, layout, animate }: DiagramUpdate): void {
    const move = animate && this.diagram !== undefined;
    this.endGesture();
    this.diagram = diagram;
    this.simulation.setGraph(
      diagram.states.map(({ key }, index) => ({ key, target: layout.positions[index] ?? { x: 0, y: 0 } })),
      diagram.edges.map(({ from, to }) => [from, to]),
      { animate: move },
    );
    this.shapeMotion.setShapes(
      diagram.edges.map(({ from, to }) => edgeKey(diagram, from, to)),
      layout.shapes,
      { animate: move },
    );
    this.settledBounds = buildScene(diagram, layout.positions, layout.shapes).bounds;
    this.keepDiagramVisible(move);
    this.wake();
  }

  /** Moves the view if the diagram, where it is going to settle, would not be entirely visible. */
  private keepDiagramVisible(smoothly: boolean): void {
    if (!this.settledBounds || this.area.width <= 0 || this.area.height <= 0) return;
    if (!this.viewFitted) {
      this.viewMotion.jumpTo(fitView(this.settledBounds, this.area));
      this.viewFitted = true;
      return;
    }
    const heading = this.viewMotion.destination;
    const adjusted = adjustView(heading, this.area, this.settledBounds);
    if (adjusted === heading) return;
    if (smoothly) this.viewMotion.glideTo(adjusted);
    else this.viewMotion.jumpTo(adjusted);
  }

  private get settled(): boolean {
    return this.simulation.settled && this.shapeMotion.settled && this.viewMotion.settled;
  }

  /** Redraws, and keeps redrawing frame by frame for as long as something moves. */
  private wake(): void {
    this.requestUpdate();
    if (this.frame !== 0 || this.settled) return;
    this.lastFrameTime = performance.now();
    this.frame = requestAnimationFrame(this.onFrame);
  }

  private readonly onFrame = (time: number): void => {
    const seconds = Math.min((time - this.lastFrameTime) / 1000, MAX_FRAME);
    this.lastFrameTime = time;
    this.simulation.step(seconds);
    this.shapeMotion.step(seconds);
    this.viewMotion.step(seconds);
    this.requestUpdate();
    this.frame = this.settled ? 0 : requestAnimationFrame(this.onFrame);
  };

  /** The position of a pointer relative to the canvas. */
  private locate(event: PointerEvent | WheelEvent): Point {
    const box = this.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (this.pointers.size >= 2) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const point = this.locate(event);
    this.pointers.set(event.pointerId, point);

    if (this.pointers.size === 2) {
      this.endGesture();
      this.gesture = this.startPinch();
    } else {
      const target = (event.target as Element).closest('[data-index]');
      const state = target ? Number(target.getAttribute('data-index')) : undefined;
      const position = state === undefined ? undefined : this.simulation.positions()[state];
      if (state === undefined || !position) {
        this.gesture = { kind: 'pan', last: point };
      } else {
        // The state keeps the place under the pointer where it was picked up.
        const picked = toWorld(this.viewMotion.current, this.area, point);
        this.gesture = { kind: 'drag', state, grip: { x: picked.x - position.x, y: picked.y - position.y } };
        this.simulation.grab(state);
      }
    }
    this.wake();
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    const point = this.locate(event);
    this.pointers.set(event.pointerId, point);
    const { gesture } = this;
    const view = this.viewMotion.current;

    if (gesture?.kind === 'drag') {
      const pointed = toWorld(view, this.area, point);
      this.simulation.moveTo(gesture.state, { x: pointed.x - gesture.grip.x, y: pointed.y - gesture.grip.y });
    } else if (gesture?.kind === 'pan') {
      this.viewMotion.jumpTo(panBy(view, point.x - gesture.last.x, point.y - gesture.last.y));
      this.gesture = { kind: 'pan', last: point };
    } else if (gesture?.kind === 'pinch') {
      const pinch = this.startPinch();
      const moved = panBy(view, pinch.center.x - gesture.center.x, pinch.center.y - gesture.center.y);
      const factor = gesture.spread > 0 ? pinch.spread / gesture.spread : 1;
      this.viewMotion.jumpTo(zoomAt(moved, this.area, pinch.center, factor));
      this.gesture = pinch;
    }
    this.wake();
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.pointers.delete(event.pointerId)) return;
    this.endGesture();
    // After a pinch, the finger that is still down goes on panning.
    const [remaining] = this.pointers.values();
    if (remaining) this.gesture = { kind: 'pan', last: remaining };
    this.wake();
  }

  private startPinch(): Gesture & { kind: 'pinch' } {
    const [first, second] = [...this.pointers.values()];
    if (!first || !second) return { kind: 'pinch', center: { x: 0, y: 0 }, spread: 0 };
    return {
      kind: 'pinch',
      center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      spread: Math.hypot(first.x - second.x, first.y - second.y),
    };
  }

  /** Ends the current gesture. A dragged state is released, not pinned: the springs take it back. */
  private endGesture(): void {
    if (this.gesture?.kind === 'drag') this.simulation.release(this.gesture.state);
    this.gesture = undefined;
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1);
    const factor = Math.exp(-pixels * (event.ctrlKey ? TRACKPAD_PINCH_ZOOM : WHEEL_ZOOM));
    this.viewMotion.jumpTo(zoomAt(this.viewMotion.current, this.area, this.locate(event), factor));
    this.wake();
  }

  protected override render() {
    const scene = this.diagram
      ? buildScene(this.diagram, this.simulation.positions(), this.shapeMotion.current())
      : undefined;
    const sized = this.area.width > 0 && this.area.height > 0;
    const box = sized && this.viewFitted ? viewBoxOf(this.viewMotion.current, this.area) : undefined;
    return html`
      <svg
        role="img"
        aria-label="Automaton diagram"
        class=${this.gesture ? 'grabbing' : ''}
        viewBox=${box ? `${box.x} ${box.y} ${box.width} ${box.height}` : nothing}
        ?data-settled=${scene !== undefined && box !== undefined && this.settled && !this.gesture}
        @pointerdown=${this.onPointerDown}
        @pointermove=${this.onPointerMove}
        @pointerup=${this.onPointerUp}
        @pointercancel=${this.onPointerUp}
        @wheel=${this.onWheel}
      >
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 10 10"
            refX="9.5"
            refY="5"
            markerWidth="9"
            markerHeight="9"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M0 1L10 5L0 9z" />
          </marker>
        </defs>
        ${repeat(scene?.edges ?? [], (edge) => edge.key, renderEdge)}
        ${repeat(scene?.states ?? [], (state) => state.key, renderState)}
      </svg>
    `;
  }
}

function renderEdge({ id, path, label }: SceneEdge) {
  return svg`
    <g class="edge" data-edge=${id}>
      <path d=${path} marker-end="url(#arrowhead)" />
      <text x=${label.x} y=${label.y}>${label.text}</text>
    </g>
  `;
}

function renderState({ name, x, y, initial, accepting }: SceneState, index: number) {
  const arrowStart = -(STATE_RADIUS + INITIAL_ARROW_LENGTH);
  return svg`
    <g
      class="state"
      data-state=${name}
      data-index=${index}
      ?data-initial=${initial}
      ?data-accepting=${accepting}
      transform="translate(${x} ${y})"
    >
      ${
        initial
          ? svg`
              <circle class="initial-dot" cx=${arrowStart} r="3.5" />
              <path class="initial-arrow" d="M${arrowStart} 0H${-STATE_RADIUS}" marker-end="url(#arrowhead)" />
            `
          : nothing
      }
      <circle class="outline" r=${STATE_RADIUS} />
      ${accepting ? svg`<circle class="outline" r=${STATE_RADIUS - ACCEPTING_GAP} />` : nothing}
      <text class="name">${name.slice(0, 1)}<tspan class="index" dy="4">${name.slice(1)}</tspan></text>
    </g>
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'resm-diagram': ResmDiagram;
  }
}
