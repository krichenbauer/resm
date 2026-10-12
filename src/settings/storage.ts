import { type Settings, sanitizeSettings } from './settings.ts';
import type { SharedState } from './share.ts';

/** What RESM remembers between visits. */
export interface AppState {
  readonly regex: string;
  readonly settings: Settings;
}

/** The parts of `localStorage` that are used. */
export interface StateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'resm';

/**
 * The state of the last visit. Storage can be missing, disabled, or hold
 * anything, so every part that cannot be read falls back to its default.
 */
export function loadState(storage: StateStorage | undefined): AppState {
  let stored: unknown;
  try {
    stored = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    stored = null;
  }
  const candidate: Record<string, unknown> =
    typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  return {
    regex: typeof candidate.regex === 'string' ? candidate.regex : '',
    settings: sanitizeSettings(candidate.settings),
  };
}

/** Remembers the state for the next visit, if storage is available. */
export function saveState(storage: StateStorage | undefined, state: AppState): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Without storage, RESM simply starts fresh next time.
  }
}

/** The state to start with: what a share link says takes precedence over what is stored. */
export function initialState(stored: AppState, shared: SharedState | null): AppState {
  if (!shared) return stored;
  return { regex: shared.regex, settings: { ...stored.settings, ...shared.settings } };
}
