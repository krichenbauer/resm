import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { Diagram } from '../diagram/diagram.ts';
import { DEFAULT_STATE_LIMIT, type DiagramError } from '../diagram/pipeline.ts';
import type { DiagramLayout } from '../layout/layout.ts';
import {
  DEFAULT_REPRESENTATION,
  REPRESENTATIONS,
  type Representation,
  isRepresentation,
} from '../settings/representation.ts';
import type { ComputeResult } from '../worker/compute.ts';
import { DiagramClient } from '../worker/diagram-client.ts';
import './resm-diagram.ts';

/** Application shell: controls at the top, the diagram in the remaining space. */
@customElement('resm-app')
export class ResmApp extends LitElement {
  static override styles = css`
    :host {
      --resm-surface: light-dark(#ffffff, #16181d);
      --resm-panel: light-dark(#f3f4f6, #20232a);
      --resm-border: light-dark(#c5c9d1, #3a3f4a);
      --resm-text: light-dark(#16181d, #e8eaed);
      --resm-focus: light-dark(#1d4ed8, #93b4ff);
      --resm-error: light-dark(#b42318, #ff9a8f);
      --resm-line: light-dark(#30343c, #c9cdd4);
      --resm-state: light-dark(#ffffff, #20232a);

      display: flex;
      flex-direction: column;
      height: 100dvh;
      background: var(--resm-surface);
      color: var(--resm-text);
      font-family: system-ui, sans-serif;
    }

    header {
      padding: 0.5rem;
      background: var(--resm-panel);
      border-bottom: 1px solid var(--resm-border);
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }

    h1 {
      margin: 0;
      font-size: 1rem;
      letter-spacing: 0.05em;
    }

    input,
    select {
      box-sizing: border-box;
      min-height: 2.25rem;
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--resm-border);
      border-radius: 0.375rem;
      background: var(--resm-surface);
      color: inherit;
      font-size: 1rem;
    }

    input {
      flex: 1 1 12rem;
      min-width: 0;
      font-family: ui-monospace, monospace;
    }

    input[aria-invalid='true'] {
      border-color: var(--resm-error);
    }

    input:focus-visible,
    select:focus-visible {
      outline: 2px solid var(--resm-focus);
      outline-offset: 1px;
    }

    .error {
      margin: 0;
      color: var(--resm-error);
      font-size: 0.875rem;
    }

    .error:not(:empty) {
      margin-top: 0.375rem;
    }
  `;

  /** The last diagram that could be computed. It stays visible while the input is invalid. */
  @state() private shown?: { diagram: Diagram; layout: DiagramLayout };
  @state() private error?: DiagramError;

  private regex = '';
  private representation: Representation = DEFAULT_REPRESENTATION;
  private client?: DiagramClient;

  override connectedCallback(): void {
    super.connectedCallback();
    const worker = new Worker(new URL('../worker/diagram.worker.ts', import.meta.url), { type: 'module' });
    this.client = new DiagramClient(worker, (result) => this.show(result));
    this.requestDiagram();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.client?.dispose();
  }

  private requestDiagram(): void {
    this.client?.request({
      regex: this.regex,
      representation: this.representation,
      showSink: false,
      stateLimit: DEFAULT_STATE_LIMIT,
    });
  }

  private show(result: ComputeResult): void {
    if (result.ok) {
      this.shown = { diagram: result.diagram, layout: result.layout };
      this.error = undefined;
    } else {
      this.error = result.error;
    }
  }

  private onRegexInput(event: InputEvent): void {
    this.regex = (event.target as HTMLInputElement).value;
    this.requestDiagram();
  }

  private onRepresentationChange(event: Event): void {
    const { value } = event.target as HTMLSelectElement;
    if (!isRepresentation(value)) return;
    this.representation = value;
    this.requestDiagram();
  }

  private errorText(): string {
    const { error } = this;
    if (!error) return '';
    return error.kind === 'syntax' ? `Position ${error.range.start + 1}: ${error.message}` : error.message;
  }

  protected override render() {
    return html`
      <header>
        <div class="controls">
          <h1>RESM</h1>
          <input
            type="text"
            aria-label="Regular expression"
            aria-invalid=${this.error?.kind === 'syntax' ? 'true' : 'false'}
            aria-describedby="error"
            placeholder="Regular expression"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            @input=${this.onRegexInput}
          />
          <select aria-label="Automaton representation" @change=${this.onRepresentationChange}>
            ${REPRESENTATIONS.map(
              ({ id, label }) =>
                html`<option value=${id} ?selected=${id === DEFAULT_REPRESENTATION}>${label}</option>`,
            )}
          </select>
        </div>
        <p class="error" id="error" role="status">${this.errorText()}</p>
      </header>
      <resm-diagram .diagram=${this.shown?.diagram} .layout=${this.shown?.layout}></resm-diagram>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'resm-app': ResmApp;
  }
}
