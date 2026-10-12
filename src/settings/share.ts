import { isRepresentation } from './representation.ts';
import { type Settings, clampStateLimit } from './settings.ts';

/** The settings that determine which diagram is drawn. The theme is left to the viewer. */
export type SharedSettings = Pick<Settings, 'representation' | 'showSink' | 'stateLimit'>;

/** What a share link carries. Settings that the link does not mention are absent. */
export interface SharedState {
  readonly regex: string;
  readonly settings: Partial<SharedSettings>;
}

/**
 * The URL fragment, without `#`, that reproduces a diagram: the regex and the
 * settings it depends on. The diagram itself is not part of the link; whoever
 * opens it computes the diagram again.
 */
export function encodeShare({ regex, settings }: { regex: string; settings: Settings }): string {
  return new URLSearchParams({
    regex,
    automaton: settings.representation,
    sink: settings.showSink ? '1' : '0',
    limit: String(settings.stateLimit),
  }).toString();
}

/** Reads a URL fragment as a share link, or returns `null` if it is not one. */
export function decodeShare(fragment: string): SharedState | null {
  const parameters = new URLSearchParams(fragment.replace(/^#/, ''));
  const regex = parameters.get('regex');
  if (regex === null) return null;

  const automaton = parameters.get('automaton');
  const sink = parameters.get('sink');
  const limit = parameters.get('limit');
  return {
    regex,
    settings: {
      ...(automaton !== null && isRepresentation(automaton) ? { representation: automaton } : {}),
      ...(sink === '1' || sink === '0' ? { showSink: sink === '1' } : {}),
      ...(limit !== null && /^-?\d+$/.test(limit) ? { stateLimit: clampStateLimit(Number(limit)) } : {}),
    },
  };
}
