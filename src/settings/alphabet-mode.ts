/** How the alphabet of the automata is determined. */
export const ALPHABET_MODES = [
  { id: 'derived', label: 'From the regex' },
  { id: 'ascii', label: 'ASCII' },
] as const;

/**
 * `derived`: the characters that are written in the regex. `ascii`: all 128
 * ASCII characters, whatever the regex contains.
 */
export type AlphabetMode = (typeof ALPHABET_MODES)[number]['id'];

export const DEFAULT_ALPHABET_MODE: AlphabetMode = 'derived';

export function isAlphabetMode(value: unknown): value is AlphabetMode {
  return ALPHABET_MODES.some((mode) => mode.id === value);
}
