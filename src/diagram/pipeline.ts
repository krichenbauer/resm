import { type Automaton, StateLimitError } from '../automata/automaton.ts';
import { determinize } from '../automata/determinize.ts';
import { removeEpsilons } from '../automata/epsilon-removal.ts';
import { complete, minimize } from '../automata/minimize.ts';
import { buildEpsilonNfa } from '../automata/thompson.ts';
import { deriveAlphabet, findUnmatchable, restrictToAlphabet } from '../regex/alphabet.ts';
import type { RegexNode, SourceRange } from '../regex/ast.ts';
import { CharSet } from '../regex/charset.ts';
import { parseRegex } from '../regex/parser.ts';
import type { AlphabetMode } from '../settings/alphabet-mode.ts';
import type { Representation } from '../settings/representation.ts';
import { type Diagram, toDiagram } from './diagram.ts';
import { formatAlphabet } from './label.ts';

/** Default for the largest number of states a diagram may have. */
export const DEFAULT_STATE_LIMIT = 200;

export interface DiagramRequest {
  readonly regex: string;
  readonly representation: Representation;
  /** Whether a DFA is completed with its sink state. Ignored for NFAs. */
  readonly showSink: boolean;
  /** The largest number of states the diagram may have. */
  readonly stateLimit: number;
  /** Whether the alphabet is derived from the regex or all of ASCII. */
  readonly alphabet: AlphabetMode;
}

export type DiagramError =
  | { readonly kind: 'syntax'; readonly message: string; readonly range: SourceRange }
  | { readonly kind: 'limit'; readonly message: string }
  | { readonly kind: 'internal'; readonly message: string };

/** A diagram with what is shown next to it. */
export interface DiagramInfo {
  readonly diagram: Diagram;
  /** The alphabet of the automaton, such as `Σ = {a, b}`. */
  readonly alphabet: string;
  /** A remark on the regex that is not an error, or `null` if there is none. */
  readonly notice: string | null;
}

export type DiagramResult =
  | ({ readonly ok: true } & DiagramInfo)
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
  return Math.max(2000, stateLimit * 4);
}

/**
 * Points out the first part of the regex that cannot match because the
 * alphabet has no character for it. That is hardly ever intended, and
 * surprising to those who know the dot and negation from other regex tools.
 */
function describeUnmatchable(source: string, ast: RegexNode, alphabet: CharSet): string | null {
  const [first] = findUnmatchable(ast, alphabet);
  if (!first) return null;
  const text = source.slice(first.range.start, first.range.end);
  const reason = alphabet.isEmpty
    ? 'the alphabet is empty'
    : `no character of the alphabet ${formatAlphabet(alphabet).replace('Σ = ', '')} fits`;
  return (
    `'${text}' at position ${first.range.start + 1} matches nothing, because ${reason}. ` +
    'The alphabet consists of the characters that are written in the regex.'
  );
}

function buildAutomaton(ast: RegexNode, request: DiagramRequest, alphabet: CharSet): Automaton {
  const { representation, showSink, stateLimit } = request;
  const workLimit = workStateLimit(stateLimit);
  if (representation === 'enfa') return buildEpsilonNfa(ast, stateLimit);

  const nfa = removeEpsilons(buildEpsilonNfa(ast, workLimit));
  if (representation === 'nfa') return nfa;
  if (representation === 'min-dfa') {
    return minimize(determinize(nfa, workLimit), { keepSink: showSink, alphabet });
  }

  const dfa = determinize(nfa, stateLimit);
  return showSink ? complete(dfa, alphabet) : dfa;
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
  // Over its own alphabet, the regex matches what it matches over ASCII, minus
  // every string with a character that is not written in it.
  const alphabet = request.alphabet === 'ascii' ? CharSet.ALL : deriveAlphabet(parsed.ast);
  const ast = restrictToAlphabet(parsed.ast, alphabet);
  try {
    const automaton = buildAutomaton(ast, request, alphabet);
    if (automaton.stateCount > stateLimit) return tooLarge;
    return {
      ok: true,
      diagram: toDiagram(automaton, alphabet),
      alphabet: formatAlphabet(alphabet),
      notice: describeUnmatchable(request.regex, parsed.ast, alphabet),
    };
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
