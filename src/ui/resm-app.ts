import { LitElement, type PropertyValues, css, html, svg, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { describeDiagram } from '../diagram/describe.ts';
import type { DiagramError, DiagramRequest } from '../diagram/pipeline.ts';
import { download, rasterize } from '../export/download.ts';
import { exportSize, pngSize, renderSvg } from '../export/svg.ts';
import { buildScene } from '../layout/scene.ts';
import { ALPHABET_MODES, isAlphabetMode } from '../settings/alphabet-mode.ts';
import { REPRESENTATIONS, isRepresentation } from '../settings/representation.ts';
import {
  DEFAULT_SETTINGS,
  MAX_STATE_LIMIT,
  MIN_STATE_LIMIT,
  type Settings,
  THEMES,
  clampStateLimit,
  isTheme,
} from '../settings/settings.ts';
import { decodeShare, encodeShare } from '../settings/share.ts';
import { type StateStorage, initialState, loadState, saveState } from '../settings/storage.ts';
import { DARK, LIGHT, type Palette } from '../theme/palette.ts';
import type { ComputeResult } from '../worker/compute.ts';
import { DiagramClient } from '../worker/diagram-client.ts';
import { GITHUB_MARK_PATH, REPOSITORY_URL } from './repository.ts';
import type { DiagramUpdate } from './resm-diagram.ts';
import './resm-diagram.ts';

/** Width in pixels that the PNG export suggests. */
const DEFAULT_PNG_WIDTH = 1600;

/** How long the share button confirms that the link was copied, in milliseconds. */
const SHARE_NOTICE_TIME = 2500;

/** Width of a menu, and the space that it leaves free beside it in a narrow window, in rem. */
const MENU_WIDTH_REM = 20;
const MENU_MARGIN_REM = 1;

/** `localStorage`, unless the browser refuses access to it. */
function browserStorage(): StateStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** The custom properties for all colors, each in its light and its dark variant. */
const paletteStyles = unsafeCSS(
  (Object.keys(LIGHT) as (keyof Palette)[])
    .map((name) => `--resm-${name}: light-dark(${LIGHT[name]}, ${DARK[name]});`)
    .join('\n'),
);

/** The application: the controls at the top, and the diagram in the remaining space. */
@customElement('resm-app')
export class ResmApp extends LitElement {
  static override styles = css`
    :host {
      ${paletteStyles}

      display: flex;
      flex-direction: column;
      height: 100dvh;
      background: var(--resm-surface);
      color: var(--resm-text);
      font-family: system-ui, sans-serif;
    }

    :host([theme='light']) {
      color-scheme: light;
    }

    :host([theme='dark']) {
      color-scheme: dark;
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
    select,
    button {
      box-sizing: border-box;
      min-height: 2.25rem;
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--resm-border);
      border-radius: 0.375rem;
      background: var(--resm-surface);
      color: inherit;
      font: inherit;
      font-size: 1rem;
    }

    button {
      cursor: pointer;
    }

    .regex {
      flex: 1 1 12rem;
      min-width: 0;
      font-family: ui-monospace, monospace;
    }

    .regex[aria-invalid='true'] {
      border-color: var(--resm-error);
    }

    input[type='checkbox'] {
      min-height: 0;
      width: 1.125rem;
      height: 1.125rem;
      margin: 0;
      accent-color: var(--resm-focus);
    }

    input[type='number'] {
      width: 6rem;
    }

    .repository {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 0.375rem;
      color: inherit;
    }

    .repository svg {
      width: 1.5rem;
      height: 1.5rem;
      fill: currentColor;
    }

    /*
     * Where the controls need more than one row, the link stays in the top
     * right corner, at the end of the first row, and the others follow it.
     */
    @media (max-width: 48rem) {
      .repository {
        order: 1;
      }

      .controls > :is(select, button) {
        order: 2;
      }
    }

    :is(input, select, button, a):focus-visible {
      outline: 2px solid var(--resm-focus);
      outline-offset: 1px;
    }

    .error {
      margin: 0;
      color: var(--resm-error);
      font-size: 0.875rem;
    }

    .notice {
      margin: 0;
      font-size: 0.875rem;
      opacity: 0.85;
    }

    :is(.error, .notice):not(:empty) {
      margin-top: 0.375rem;
    }

    /* A menu is placed below its button when it opens; see "onMenuToggle". */
    [popover] {
      /*
       * Browsers center a popover by stretching it over the window and
       * limiting its size to its content. Not every Safari honors that limit
       * for the height, so the menu states its position and size itself.
       */
      position: fixed;
      inset: auto;
      margin: 0;
      padding: 0.75rem;
      width: min(${MENU_WIDTH_REM}rem, calc(100vw - ${MENU_MARGIN_REM}rem));
      height: auto;
      overflow: auto;
      box-sizing: border-box;
      border: 1px solid var(--resm-border);
      border-radius: 0.5rem;
      background: var(--resm-panel);
      color: var(--resm-text);
      box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 0.2);
    }

    [popover]:popover-open {
      display: grid;
      gap: 0.625rem;
    }

    .option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    label.option:has(input[type='checkbox']) {
      justify-content: flex-start;
    }

    .hint {
      margin: 0;
      font-size: 0.8125rem;
      opacity: 0.8;
    }
  `;

  @state() private regex = '';
  @state() private settings: Settings = DEFAULT_SETTINGS;
  /** The last diagram that could be computed. It stays visible while the input is invalid. */
  @state() private shown?: DiagramUpdate;
  @state() private error?: DiagramError;
  /** A remark on the regex that is shown, which is not an error. */
  @state() private notice = '';
  @state() private pngWidth = DEFAULT_PNG_WIDTH;
  @state() private linkCopied = false;

  private readonly storage = browserStorage();
  private readonly prefersDark = matchMedia('(prefers-color-scheme: dark)');
  /** The representation of the diagram on screen, which may lag behind the selected one. */
  private shownRepresentation?: Settings['representation'];
  private client?: DiagramClient;
  private noticeTimer = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    const worker = new Worker(new URL('../worker/diagram.worker.ts', import.meta.url), { type: 'module' });
    this.client = new DiagramClient(worker, (result, request) => this.show(result, request));
    window.addEventListener('hashchange', this.openShareLink);

    const stored = loadState(this.storage);
    this.regex = stored.regex;
    this.settings = stored.settings;
    if (!this.openShareLink()) this.requestDiagram();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.openShareLink);
    window.clearTimeout(this.noticeTimer);
    this.client?.dispose();
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('settings')) this.setAttribute('theme', this.settings.theme);
  }

  /**
   * Applies the share link in the address bar, if there is one. What the link
   * says takes precedence over the current state. The link is then removed
   * from the address bar, because it would go stale with the next edit.
   */
  private readonly openShareLink = (): boolean => {
    const shared = decodeShare(window.location.hash);
    if (!shared) return false;
    const next = initialState({ regex: this.regex, settings: this.settings }, shared);
    this.regex = next.regex;
    this.settings = next.settings;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    this.remember();
    this.requestDiagram();
    return true;
  };

  private remember(): void {
    saveState(this.storage, { regex: this.regex, settings: this.settings });
  }

  private requestDiagram(): void {
    const { representation, alphabet, showSink, stateLimit } = this.settings;
    this.client?.request({ regex: this.regex, representation, alphabet, showSink, stateLimit });
  }

  private show(result: ComputeResult, request: DiagramRequest): void {
    if (!result.ok) {
      this.error = result.error;
      this.notice = '';
      return;
    }
    this.shown = {
      diagram: result.diagram,
      layout: result.layout,
      // An edited regex moves the diagram into its new shape; another representation replaces it.
      animate: request.representation === this.shownRepresentation,
      alphabet: result.alphabet,
      description: describeDiagram(result.diagram, request.representation, result.alphabet),
    };
    this.shownRepresentation = request.representation;
    this.error = undefined;
    this.notice = result.notice ?? '';
  }

  private changeSettings(changes: Partial<Settings>): void {
    const previous = this.settings;
    this.settings = { ...previous, ...changes };
    this.remember();
    const { representation, alphabet, showSink, stateLimit } = this.settings;
    const sameDiagram =
      representation === previous.representation &&
      alphabet === previous.alphabet &&
      showSink === previous.showSink &&
      stateLimit === previous.stateLimit;
    if (!sameDiagram) this.requestDiagram();
  }

  private onRegexInput(event: InputEvent): void {
    this.regex = (event.target as HTMLInputElement).value;
    this.remember();
    this.requestDiagram();
  }

  private onRepresentationChange(event: Event): void {
    const { value } = event.target as HTMLSelectElement;
    if (isRepresentation(value)) this.changeSettings({ representation: value });
  }

  private onAlphabetChange(event: Event): void {
    const { value } = event.target as HTMLSelectElement;
    if (isAlphabetMode(value)) this.changeSettings({ alphabet: value });
  }

  private onSinkChange(event: Event): void {
    this.changeSettings({ showSink: (event.target as HTMLInputElement).checked });
  }

  private onStateLimitChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const stateLimit = input.value.trim() === '' ? this.settings.stateLimit : clampStateLimit(Number(input.value));
    this.changeSettings({ stateLimit });
    // Show what was applied, also when it equals the previous value and nothing is rendered anew.
    input.value = String(stateLimit);
  }

  private onThemeChange(event: Event): void {
    const { value } = event.target as HTMLSelectElement;
    if (isTheme(value)) this.changeSettings({ theme: value });
  }

  private onPngWidthChange(event: Event): void {
    const width = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(width) && width >= 1) this.pngWidth = Math.round(width);
  }

  private menuButton(menu: Element): HTMLElement | null {
    return this.renderRoot.querySelector(`[popovertarget="${menu.id}"]`);
  }

  /**
   * Prepares a menu for opening and closing. An opening menu is put below its
   * button, with its right edges aligned where the window allows. A menu that
   * closes while the focus is inside returns the focus to its button; browsers
   * do that themselves, but not across a shadow root.
   */
  private onMenuToggle(event: ToggleEvent): void {
    const menu = event.target as HTMLElement;
    const button = this.menuButton(menu);
    if (!button) return;
    if (event.newState === 'closed') {
      if (menu.matches(':focus-within')) button.focus();
      return;
    }
    const box = button.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const width = Math.min(MENU_WIDTH_REM * rem, window.innerWidth - MENU_MARGIN_REM * rem);
    const margin = (MENU_MARGIN_REM * rem) / 2;
    const right = Math.min(window.innerWidth - box.right, window.innerWidth - margin - width);
    const top = box.bottom + 4;
    menu.style.top = `${top}px`;
    menu.style.right = `${Math.max(margin, right)}px`;
    // Only the top and the right edge are fixed; the others follow from the content.
    menu.style.bottom = 'auto';
    menu.style.left = 'auto';
    menu.style.maxHeight = `${Math.max(0, window.innerHeight - top - margin)}px`;
  }

  /** The colors that are currently on screen. */
  private palette(): Palette {
    const { theme } = this.settings;
    return theme === 'dark' || (theme === 'system' && this.prefersDark.matches) ? DARK : LIGHT;
  }

  /**
   * The diagram as an SVG document: as it is once it has settled, whatever is
   * in motion or on screen right now. With `pngWidth`, the document asks to
   * be drawn at the size of a PNG of that width.
   */
  private exportSvg(pngWidth?: number) {
    if (!this.shown) return undefined;
    const { diagram, layout, alphabet } = this.shown;
    const scene = buildScene(diagram, layout.positions, layout.shapes);
    const natural = exportSize(scene.bounds, alphabet);
    const size = pngWidth === undefined ? natural : pngSize(natural, pngWidth);
    return { text: renderSvg(scene, this.palette(), alphabet, size), size };
  }

  private downloadSvg(): void {
    const svg = this.exportSvg();
    if (svg) download(new Blob([svg.text], { type: 'image/svg+xml' }), 'resm-diagram.svg');
  }

  private async downloadPng(): Promise<void> {
    const svg = this.exportSvg(this.pngWidth);
    if (!svg) return;
    try {
      download(await rasterize(svg.text, svg.size), 'resm-diagram.png');
    } catch {
      this.error = { kind: 'internal', message: 'The PNG image could not be created.' };
    }
  }

  private async share(): Promise<void> {
    const link = new URL(window.location.href);
    link.hash = encodeShare({ regex: this.regex, settings: this.settings });
    try {
      await navigator.clipboard.writeText(link.href);
      this.linkCopied = true;
      window.clearTimeout(this.noticeTimer);
      this.noticeTimer = window.setTimeout(() => (this.linkCopied = false), SHARE_NOTICE_TIME);
    } catch {
      // Without access to the clipboard, the link can still be copied by hand.
      window.prompt('Copy this link to share the diagram:', link.href);
    }
  }

  private errorText(): string {
    const { error } = this;
    if (!error) return '';
    return error.kind === 'syntax' ? `Position ${error.range.start + 1}: ${error.message}` : error.message;
  }

  protected override render() {
    const { representation, alphabet, showSink, stateLimit, theme } = this.settings;
    return html`
      <header>
        <div class="controls">
          <h1>RESM</h1>
          <input
            class="regex"
            type="text"
            aria-label="Regular expression"
            aria-invalid=${this.error?.kind === 'syntax' ? 'true' : 'false'}
            aria-describedby="error notice"
            placeholder="Regular expression"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            .value=${this.regex}
            @input=${this.onRegexInput}
          />
          <select aria-label="Automaton representation" @change=${this.onRepresentationChange}>
            ${REPRESENTATIONS.map(
              ({ id, label }) => html`<option value=${id} .selected=${id === representation}>${label}</option>`,
            )}
          </select>
          <button type="button" popovertarget="export-menu">Export</button>
          <button type="button" @click=${this.share}>${this.linkCopied ? 'Link copied' : 'Share'}</button>
          <button type="button" popovertarget="settings-menu">Settings</button>
          <a
            class="repository"
            href=${REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="RESM on GitHub: documentation and source code"
            title="Documentation and source code on GitHub"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              ${svg`<path d=${GITHUB_MARK_PATH} />`}
            </svg>
          </a>
        </div>
        <p class="error" id="error" role="status">${this.errorText()}</p>
        <p class="notice" id="notice" aria-live="polite">${this.notice}</p>

        <div id="export-menu" popover @beforetoggle=${this.onMenuToggle}>
          <button type="button" @click=${this.downloadSvg}>Download SVG</button>
          <label class="option">
            PNG width in pixels
            <input
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              .value=${String(this.pngWidth)}
              @input=${this.onPngWidthChange}
            />
          </label>
          <button type="button" @click=${this.downloadPng}>Download PNG</button>
          <p class="hint">Both files show the whole diagram, whatever part of it is on screen.</p>
        </div>

        <div id="settings-menu" popover @beforetoggle=${this.onMenuToggle}>
          <label class="option">
            Alphabet
            <select @change=${this.onAlphabetChange}>
              ${ALPHABET_MODES.map(
                ({ id, label }) => html`<option value=${id} .selected=${id === alphabet}>${label}</option>`,
              )}
            </select>
          </label>
          <p class="hint">
            From the regex: only the characters that are written in it. The dot and negations such as [^a]
            then stand for the other characters of the regex.
          </p>
          <label class="option">
            <input type="checkbox" .checked=${showSink} @change=${this.onSinkChange} />
            Show sink state
          </label>
          <p class="hint">Applies to the DFA and the minimized DFA.</p>
          <label class="option">
            Maximum number of states
            <input
              type="number"
              min=${MIN_STATE_LIMIT}
              max=${MAX_STATE_LIMIT}
              step="1"
              inputmode="numeric"
              .value=${String(stateLimit)}
              @change=${this.onStateLimitChange}
            />
          </label>
          <label class="option">
            Theme
            <select @change=${this.onThemeChange}>
              ${THEMES.map(({ id, label }) => html`<option value=${id} .selected=${id === theme}>${label}</option>`)}
            </select>
          </label>
        </div>
      </header>
      <resm-diagram .shown=${this.shown}></resm-diagram>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'resm-app': ResmApp;
  }
}
