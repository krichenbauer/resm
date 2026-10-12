import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { DEFAULT_REPRESENTATION, REPRESENTATIONS } from '../settings/representation.ts';

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

      display: flex;
      flex-direction: column;
      height: 100dvh;
      background: var(--resm-surface);
      color: var(--resm-text);
      font-family: system-ui, sans-serif;
    }

    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: var(--resm-panel);
      border-bottom: 1px solid var(--resm-border);
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

    input:focus-visible,
    select:focus-visible {
      outline: 2px solid var(--resm-focus);
      outline-offset: 1px;
    }

    svg {
      flex: 1;
      min-height: 0;
      width: 100%;
    }
  `;

  protected override render() {
    return html`
      <header>
        <h1>RESM</h1>
        <input
          type="text"
          aria-label="Regular expression"
          placeholder="Regular expression"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
        />
        <select aria-label="Automaton representation">
          ${REPRESENTATIONS.map(
            ({ id, label }) =>
              html`<option value=${id} ?selected=${id === DEFAULT_REPRESENTATION}>${label}</option>`,
          )}
        </select>
      </header>
      <svg role="img" aria-label="Automaton diagram"></svg>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'resm-app': ResmApp;
  }
}
