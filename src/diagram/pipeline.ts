import { type Automaton, StateLimitError } from '../automata/automaton.ts';
import { determinize } from '../automata/determinize.ts';
import { removeEpsilons } from '../automata/epsilon-removal.ts';
import { complete, minimize } from '../automata/minimize.ts';
import { buildEpsilonNfa } from '../automata/thompson.ts';
import type { RegexNode, SourceRange } from '../regex/ast.ts';
import { parseRegex } from '../regex/parser.ts';
import type { Representation } from '../settings/representation.ts';
import { type Diagram, toDiagram } from './diagram.ts';

/** Default for the largest number of states a diagram may have. */
export const DEFAULT_STATE_LIMIT = 200;

export interface DiagramRequest {
  readonly regex: string;
  readonly representation: Representation;
  /** Whether a DFA is completed with its sink state. Ignored for NFAs. */
  readonly showSink: boolean;
  /** The largest number of states the diagram may have. */
  readonly stateLimit: number;
}

export type DiagramError =
  | { readonly kind: 'syntax'; readonly message: string; readonly range: SourceRange }
  | { readonly kind: 'limit'; readonly message: string }
  | { readonly kind: 'internal'; readonly message: string };

export type DiagramResult =
  | { readonly ok: true; readonly diagram: Diagram }
  | { readonly ok: false; readonly error: DiagramError };

const NAMES: Record<Representation, string> = {
  enfa: 'ε-NFA',
  nfa: 'NFA',
  dfa: 'DFA',
  'min-dfa': 'minimized DFA',
};

/**
 * The largest number of states an automaton may have that is only a step
 * towards the requested one. It is well above the display limit, because a
 * small automaton is often derived from a much larger one, but it is bounded
 * so that no input can keep the computation busy for long.
 */
export function workStateLimit(stateLimit: number): number {
  return Math.max(2000, stateLimit * 10);
}

function buildAutomaton(ast: RegexNode, request: DiagramRequest): Automaton {
  const { representation, showSink, stateLimit } = request;
  const workLimit = workStateLimit(stateLimit);
  if (representation === 'enfa') return buildEpsilonNfa(ast, stateLimit);

  const nfa = removeEpsilons(buildEpsilonNfa(ast, workLimit));
  if (representation === 'nfa') return nfa;
  if (representation === 'min-dfa') return minimize(determinize(nfa, workLimit), { keepSink: showSink });

  const dfa = determinize(nfa, stateLimit);
  return showSink ? complete(dfa) : dfa;
}

/** Computes the diagram for a regex and the display settings, or explains why there is none. */
export function buildDiagram(request: DiagramRequest): DiagramResult {
  const parsed = parseRegex(request.regex);
  if (!parsed.ok) return { ok: false, error: { kind: 'syntax', ...parsed.error } };

  const { representation, stateLimit } = request;
  const tooLarge: DiagramResult = {
    ok: false,
    error: {
      kind: 'limit',
      message: `The ${NAMES[representation]} has more than ${stateLimit} states, which is the display limit.`,
    },
  };
  try {
    const automaton = buildAutomaton(parsed.ast, request);
    return automaton.stateCount > stateLimit ? tooLarge : { ok: true, diagram: toDiagram(automaton) };
  } catch (error) {
    if (!(error instanceof StateLimitError)) throw error;
    // Only the requested automaton is built with the display limit as its budget.
    if (error.limit === stateLimit) return tooLarge;
    return {
      ok: false,
      error: {
        kind: 'limit',
        message: `This expression is too complex: an intermediate automaton has more than ${error.limit} states.`,
      },
    };
  }
}
