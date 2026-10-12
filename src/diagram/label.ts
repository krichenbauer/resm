import { CharSet } from '../regex/charset.ts';
import { ANY_CHAR, DIGIT, SPACE, WORD } from '../regex/classes.ts';

const SHORTHANDS: readonly (readonly [CharSet, string])[] = [
  [DIGIT, '\\d'],
  [WORD, '\\w'],
  [SPACE, '\\s'],
  [DIGIT.complement(), '\\D'],
  [WORD.complement(), '\\W'],
  [SPACE.complement(), '\\S'],
  [ANY_CHAR, '.'],
];

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

/**
 * An exact, readable description of a character set in regex notation, such
 * as `a`, `\d`, `[a-f]`, or `[^"]`. Whitespace and control characters are made
 * visible, which the regex field itself does not accept.
 */
export function formatLabel(set: CharSet): string {
  const shorthand = SHORTHANDS.find(([candidate]) => candidate.equals(set));
  if (shorthand) return shorthand[1];
  if (set.isEmpty) return '[]';
  if (set.equals(CharSet.ALL)) return '[\\x00-\\x7f]';

  const [only] = set.ranges();
  if (set.size === 1 && only) return formatChar(only[0], SPECIAL_OUTSIDE_SET);

  const listed = `[${formatSetBody(set)}]`;
  const negated = `[^${formatSetBody(set.complement())}]`;
  return negated.length < listed.length ? negated : listed;
}
