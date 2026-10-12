import { LitElement, css, html, nothing, svg } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Diagram } from '../diagram/diagram.ts';
import { STATE_RADIUS } from '../layout/geometry.ts';
import type { DiagramLayout } from '../layout/layout.ts';
import { INITIAL_ARROW_LENGTH, type SceneEdge, type SceneState, buildScene } from '../layout/scene.ts';
import { fitViewBox } from '../layout/viewport.ts';

/** Gap between the two outlines of an accepting state. */
const ACCEPTING_GAP = 4;

/** Draws a diagram with its layout as SVG, fitted into the available space. */
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

  @property({ attribute: false }) diagram?: Diagram;
  @property({ attribute: false }) layout?: DiagramLayout;

  @state() private area = { width: 0, height: 0 };

  private readonly resizeObserver = new ResizeObserver(([entry]) => {
    if (entry) this.area = { width: entry.contentRect.width, height: entry.contentRect.height };
  });

  override connectedCallback(): void {
    super.connectedCallback();
    this.resizeObserver.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
  }

  protected override render() {
    const scene =
      this.diagram && this.layout
        ? buildScene(this.diagram, this.layout.positions, this.layout.shapes)
        : undefined;
    const box = scene ? fitViewBox(scene.bounds, this.area) : undefined;
    return html`
      <svg
        role="img"
        aria-label="Automaton diagram"
        viewBox=${box ? `${box.x} ${box.y} ${box.width} ${box.height}` : nothing}
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
        ${scene?.edges.map(renderEdge)} ${scene?.states.map(renderState)}
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

function renderState({ name, x, y, initial, accepting }: SceneState) {
  const arrowStart = -(STATE_RADIUS + INITIAL_ARROW_LENGTH);
  return svg`
    <g
      class="state"
      data-state=${name}
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
