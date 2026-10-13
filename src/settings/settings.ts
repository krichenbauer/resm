import { DEFAULT_STATE_LIMIT } from '../diagram/pipeline.ts';
import { type AlphabetMode, DEFAULT_ALPHABET_MODE, isAlphabetMode } from './alphabet-mode.ts';
import { DEFAULT_REPRESENTATION, type Representation, isRepresentation } from './representation.ts';

/** The appearances to choose from; `system` follows the operating system. */
export const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const;

export type Theme = (typeof THEMES)[number]['id'];

export function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme.id === value);
}

/** Everything the user can choose besides the regex. */
export interface Settings {
  readonly representation: Representation;
  /** Whether the alphabet is derived from the regex or all of ASCII. */
  readonly alphabet: AlphabetMode;
  /** Whether deterministic automata are drawn with their sink state. */
  readonly showSink: boolean;
  /** The largest number of states a diagram may have. */
  readonly stateLimit: number;
  readonly theme: Theme;
}

export const MIN_STATE_LIMIT = 1;
export const MAX_STATE_LIMIT = 500;

export const DEFAULT_SETTINGS: Settings = {
  representation: DEFAULT_REPRESENTATION,
  alphabet: DEFAULT_ALPHABET_MODE,
  showSink: false,
  stateLimit: DEFAULT_STATE_LIMIT,
  theme: 'system',
};

/** The nearest valid state limit: a whole number within the supported range. */
export function clampStateLimit(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_SETTINGS.stateLimit;
  return Math.min(MAX_STATE_LIMIT, Math.max(MIN_STATE_LIMIT, Math.trunc(value)));
}

/** Valid settings from data of unknown shape: every missing or invalid value becomes its default. */
export function sanitizeSettings(value: unknown): Settings {
  const candidate: Record<string, unknown> =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const { representation, alphabet, showSink, stateLimit, theme } = candidate;
  return {
    representation:
      typeof representation === 'string' && isRepresentation(representation)
        ? representation
        : DEFAULT_SETTINGS.representation,
    alphabet: isAlphabetMode(alphabet) ? alphabet : DEFAULT_SETTINGS.alphabet,
    showSink: typeof showSink === 'boolean' ? showSink : DEFAULT_SETTINGS.showSink,
    stateLimit: typeof stateLimit === 'number' ? clampStateLimit(stateLimit) : DEFAULT_SETTINGS.stateLimit,
    theme: isTheme(theme) ? theme : DEFAULT_SETTINGS.theme,
  };
}
