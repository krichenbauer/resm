import { CharSet } from '../regex/charset.ts';
import { ANY_CHAR, DIGIT, SPACE, WORD } from '../regex/classes.ts';

/** Classes that a set can be named after when it has exactly their members. */
const CLASSES: readonly (readonly [CharSet, string])[] = [
  [DIGIT, '\\d'],
  [WORD, '\\w'],
  [SPACE, '\\s'],
];

/** What a set can be named after when it is everything in the alphabet that is not in the given set. */
const NEGATED_CLASSES: readonly (readonly [CharSet, string])[] = [
  [DIGIT, '\\D'],
  [WORD, '\\W'],
  [SPACE, '\\S'],
  [ANY_CHAR.complement(), '.'],
];

/** An alphabet or a set with fewer members than this is short enough to be spelled out. */
const SPELLED_OUT_BELOW = 6;

const CONTROL_NAMES: ReadonlyMap<number, string> = new Map([
  [0x00, '\\0'],
  [0x09, '\\t'],
  [0x0a, '\\n'],
  [0x0b, '\\v'],
  [0x0c, '\\f'],
  [0x0d, '\\r'],
]);

/** Characters that need a backslash to stand for themselves. */
const SPECIAL_OUTSIDE_SET = '\\^$.|?*+()[{';
const SPECIAL_INSIDE_SET = '\\]^-[';

function formatChar(code: number, special: string): string {
  if (code === 0x20) return '␣';
  if (code < 0x20 || code === 0x7f) {
    return CONTROL_NAMES.get(code) ?? `\\x${code.toString(16).padStart(2, '0')}`;
  }
  const char = String.fromCharCode(code);
  return special.includes(char) ? `\\${char}` : char;
}

/** The members of a set in the notation used between `[` and `]`. */
function formatSetBody(set: CharSet): string {
  let body = '';
  let rest = set;
  for (const [shorthand, name] of [[WORD, '\\w'], [SPACE, '\\s']] as const) {
    if (rest.contains(shorthand)) {
      body += name;
      rest = rest.minus(shorthand);
    }
  }
  for (const [first, last] of rest.ranges()) {
    body += formatChar(first, SPECIAL_INSIDE_SET);
    // Two neighbors are shorter and clearer when listed than as a range.
    if (last - first >= 2) body += '-';
    if (last > first) body += formatChar(last, SPECIAL_INSIDE_SET);
  }
  return body;
}

/** The characters of a set, each as it is written outside a set, in ASCII order. */
function listChars(set: CharSet, special: string): string[] {
  return set.ranges().flatMap(([first, last]) =>
    Array.from({ length: last - first + 1 }, (_, offset) => formatChar(first + offset, special)),
  );
}

/**
 * An exact, readable description of a character set in regex notation, such
 * as `a`, `\\d`, `[a-f]`, or `[^"]`. Whitespace and control characters are made
 * visible, which the regex field itself does not accept.
 *
 * The description is relative to the alphabet: a negation such as `[^a]`
 * stands for all other characters of the alphabet, and a set that is the
 * whole alphabet is listed as `a, b` if that is short, or else written `Σ`.
 */
export function formatLabel(set: CharSet, alphabet: CharSet = CharSet.ALL): string {
  if (set.isEmpty) return '[]';
  if (set.equals(alphabet)) {
    return set.size < SPELLED_OUT_BELOW ? listChars(set, SPECIAL_OUTSIDE_SET).join(', ') : 'Σ';
  }
  const named = CLASSES.find(([members]) => members.equals(set));
  if (named) return named[1];

  const [only] = set.ranges();
  if (set.size === 1 && only) return formatChar(only[0], SPECIAL_OUTSIDE_SET);

  const listed = `[${formatSetBody(set)}]`;
  const negated = `[^${formatSetBody(alphabet.minus(set))}]`;
  const spelled = negated.length < listed.length ? negated : listed;
  // A small set is clearer spelled out than as "everything but the digits".
  if (set.size < SPELLED_OUT_BELOW) return spelled;
  const shorthands = NEGATED_CLASSES.filter(([excluded]) => alphabet.minus(excluded).equals(set));
  return [spelled, ...shorthands.map(([, name]) => name)].reduce((shortest, candidate) =>
    candidate.length < shortest.length ? candidate : shortest,
  );
}

/**
 * The alphabet as shown next to a diagram, such as `Σ = {a, b}`. Three or
 * more neighboring characters are abbreviated as a range.
 */
export function formatAlphabet(alphabet: CharSet): string {
  if (alphabet.equals(CharSet.ALL)) return 'Σ = ASCII';
  const items = alphabet.ranges().flatMap(([first, last]) => {
    if (last - first >= 2) return [`${formatChar(first, '')}–${formatChar(last, '')}`];
    return first === last ? [formatChar(first, '')] : [formatChar(first, ''), formatChar(last, '')];
  });
  return `Σ = {${items.join(', ')}}`;
}
