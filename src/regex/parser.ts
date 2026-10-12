import type { RegexNode, SourceRange } from './ast.ts';
import { ASCII_SIZE, CharSet } from './charset.ts';
import { ANY_CHAR, DIGIT, SPACE, WORD } from './classes.ts';

/** Deepest supported nesting of groups; bounds the recursion of the parser and its consumers. */
export const MAX_GROUP_DEPTH = 100;

/** Largest supported count in a bounded repetition such as `a{1000}`. */
export const MAX_REPETITION_COUNT = 1000;

/** The repetition bounds of a quantifier; `max` is `null` when unbounded. */
interface Bounds {
  readonly min: number;
  readonly max: number | null;
}

/** One member of a character set; `char` is `null` for a class such as `\d`. */
interface SetItem {
  readonly set: CharSet;
  readonly char: string | null;
}

const CLASS_ESCAPES: ReadonlyMap<string, CharSet> = new Map([
  ['d', DIGIT],
  ['w', WORD],
  ['s', SPACE],
  ['D', DIGIT.complement()],
  ['W', WORD.complement()],
  ['S', SPACE.complement()],
]);

/** A problem in the regex source, with the location it refers to. */
export interface RegexDiagnostic {
  readonly message: string;
  readonly range: SourceRange;
}

export type ParseResult =
  | { readonly ok: true; readonly ast: RegexNode }
  | { readonly ok: false; readonly error: RegexDiagnostic };

class RegexSyntaxError extends Error {
  constructor(
    message: string,
    readonly range: SourceRange,
  ) {
    super(message);
  }
}

/**
 * Parses a regular expression that is matched against the whole input string.
 * Reports the first problem found instead of guessing at a meaning.
 */
export function parseRegex(source: string): ParseResult {
  try {
    return { ok: true, ast: new Parser(source).parse() };
  } catch (error) {
    if (error instanceof RegexSyntaxError) {
      return { ok: false, error: { message: error.message, range: error.range } };
    }
    throw error;
  }
}

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(private readonly source: string) {}

  parse(): RegexNode {
    if (this.peek() === '^') this.pos++;
    const ast = this.parseAlternation();
    if (this.peek() === ')') {
      this.fail("Unmatched ')': there is no '(' to close. Write '\\)' for a literal parenthesis.");
    }
    // Only the closing anchor can be left; see `atEndAnchor`.
    return ast;
  }

  private parseAlternation(): RegexNode {
    const start = this.pos;
    const options = [this.parseConcat()];
    while (this.peek() === '|') {
      this.pos++;
      options.push(this.parseConcat());
    }
    const [only] = options;
    if (options.length === 1 && only) return only;
    return { type: 'alternation', options, range: { start, end: this.pos } };
  }

  private parseConcat(): RegexNode {
    const start = this.pos;
    const parts: RegexNode[] = [];
    for (;;) {
      const char = this.peek();
      if (char === undefined || char === '|' || char === ')' || this.atEndAnchor()) break;
      parts.push(this.parseQuantified());
    }
    const [only] = parts;
    if (!only) return { type: 'empty', range: { start, end: start } };
    if (parts.length === 1) return only;
    return { type: 'concat', parts, range: { start, end: this.pos } };
  }

  private parseQuantified(): RegexNode {
    const start = this.pos;
    const body = this.parseAtom();
    const quantifierStart = this.pos;
    const bounds = this.parseQuantifier();
    if (!bounds) return body;

    if (this.peek() === '?') {
      // A lazy quantifier prefers shorter matches but accepts the same strings.
      this.pos++;
    } else if (this.peek() === '+') {
      const range = { start: quantifierStart, end: this.pos + 1 };
      this.fail(`Possessive quantifiers such as '${this.text(range)}' are not supported.`, range);
    }
    if ('*+?{'.includes(this.peek() ?? ' ')) {
      this.fail(
        'A quantifier cannot directly follow another quantifier. Put the first one in a group, for example (a*)*.',
      );
    }
    return { type: 'repeat', body, ...bounds, range: { start, end: this.pos } };
  }

  /** Consumes a quantifier if one follows. */
  private parseQuantifier(): Bounds | null {
    switch (this.peek()) {
      case '*':
        this.pos++;
        return { min: 0, max: null };
      case '+':
        this.pos++;
        return { min: 1, max: null };
      case '?':
        this.pos++;
        return { min: 0, max: 1 };
      case '{':
        return this.parseBounds();
      default:
        return null;
    }
  }

  /** Parses `{n}`, `{n,}`, or `{n,m}`. */
  private parseBounds(): Bounds {
    const open = this.pos;
    const notARepetition =
      "'{' must start a repetition such as {3}, {2,} or {2,5}. Write '\\{' for a literal brace.";
    this.pos++;
    if (this.peek() === ',') {
      this.pos++;
      this.skipDigits();
      if (this.peek() !== '}') this.fail(notARepetition, { start: open, end: open + 1 });
      const range = { start: open, end: this.pos + 1 };
      const written = this.text(range);
      this.fail(`A repetition needs a lower bound. Write {0${written.slice(1)} instead of ${written}.`, range);
    }
    const min = this.parseCount();
    if (min === null) this.fail(notARepetition, { start: open, end: open + 1 });
    let max: number | null = min;
    if (this.peek() === ',') {
      this.pos++;
      max = this.parseCount();
    }
    if (this.peek() !== '}') this.fail("Unterminated repetition: expected '}' here.");
    this.pos++;
    if (max !== null && max < min) {
      this.fail(`The upper bound ${max} of this repetition is smaller than its lower bound ${min}.`, {
        start: open,
        end: this.pos,
      });
    }
    return { min, max };
  }

  /** Consumes a decimal repetition count if one follows. */
  private parseCount(): number | null {
    const start = this.pos;
    this.skipDigits();
    if (this.pos === start) return null;
    const range = { start, end: this.pos };
    const count = Number(this.text(range));
    if (count > MAX_REPETITION_COUNT) {
      this.fail(
        `Repetition count ${this.text(range)} is too large; the maximum is ${MAX_REPETITION_COUNT}.`,
        range,
      );
    }
    return count;
  }

  private skipDigits(): void {
    for (let char = this.peek(); char !== undefined && isAsciiDigit(char); char = this.peek()) {
      this.pos++;
    }
  }

  private parseAtom(): RegexNode {
    const start = this.pos;
    const char = this.peek();
    switch (char) {
      case '(':
        return this.parseGroup();
      case '[':
        return this.parseSet();
      case '.':
        this.pos++;
        return { type: 'chars', set: ANY_CHAR, range: { start, end: this.pos } };
      case '\\': {
        const { set } = this.parseEscape(false);
        return { type: 'chars', set, range: { start, end: this.pos } };
      }
      case '*':
      case '+':
      case '?':
        this.fail(nothingToRepeat(char));
      // eslint-disable-next-line no-fallthrough -- `fail` never returns
      case '{': {
        this.parseBounds();
        const range = { start, end: this.pos };
        this.fail(nothingToRepeat(this.text(range)), range);
      }
      // eslint-disable-next-line no-fallthrough -- `fail` never returns
      case '^':
        this.fail("'^' is only allowed at the very beginning of the expression. Write '\\^' for a literal caret.");
      // eslint-disable-next-line no-fallthrough -- `fail` never returns
      case '$':
        this.fail("'$' is only allowed at the very end of the expression. Write '\\$' for a literal dollar sign.");
    }
    const set = CharSet.of(this.takeAscii());
    return { type: 'chars', set, range: { start, end: this.pos } };
  }

  private parseGroup(): RegexNode {
    const open = this.pos;
    if (this.depth === MAX_GROUP_DEPTH) {
      this.fail(`Groups are nested too deeply; the maximum depth is ${MAX_GROUP_DEPTH}.`);
    }
    if (this.source[open + 1] === '?') this.failUnsupportedGroup(open);
    this.pos++;
    this.depth++;
    const body = this.parseAlternation();
    if (this.peek() !== ')') {
      this.fail("Unterminated group: this '(' has no matching ')'.", { start: open, end: open + 1 });
    }
    this.pos++;
    this.depth--;
    return body;
  }

  /** Reports a group that starts with `(?`, naming the construct where it is a well-known one. */
  private failUnsupportedGroup(open: number): never {
    const introducer = this.source.slice(open + 2, open + 4);
    const first = introducer[0] ?? '';
    const prefix = (length: number) => ({ start: open, end: open + length });
    if (first === ':') {
      this.fail("Non-capturing groups '(?:...)' are not supported. Use a plain group '(...)' instead.", prefix(3));
    }
    if (first === '=' || first === '!') {
      this.fail('Lookahead and lookbehind assertions are not supported.', prefix(3));
    }
    if (introducer === '<=' || introducer === '<!') {
      this.fail('Lookahead and lookbehind assertions are not supported.', prefix(4));
    }
    if (first === '<' || introducer === 'P<') {
      this.fail("Named groups are not supported. Use a plain group '(...)' instead.", prefix(first === '<' ? 3 : 4));
    }
    if (first === '-' || (first !== 'P' && isAsciiLetter(first))) {
      this.fail("Flags such as '(?i)' are not supported.", prefix(3));
    }
    this.fail(
      "Group extensions starting with '(?' are not supported. Write '\\(\\?' for the literal characters.",
      prefix(2),
    );
  }

  private parseSet(): RegexNode {
    const open = this.pos;
    this.pos++;
    const negated = this.peek() === '^';
    if (negated) this.pos++;
    const firstItem = this.pos;
    let set = CharSet.EMPTY;
    for (;;) {
      const char = this.peek();
      if (char === undefined) {
        const hint =
          this.source[firstItem] === ']' ? " A ']' directly after the opening is a literal character." : '';
        this.fail(`Unterminated character set: this '[' has no matching ']'.${hint}`, {
          start: open,
          end: open + 1,
        });
      }
      // A `]` directly after the opening is a literal, as in Python, Java, and PCRE.
      if (char === ']' && this.pos > firstItem) break;
      if (char === '&' && this.source[this.pos + 1] === '&') {
        this.fail("Set intersection with '&&' is not supported. Write '\\&' for a literal ampersand.", {
          start: this.pos,
          end: this.pos + 2,
        });
      }

      const itemStart = this.pos;
      const first = this.parseSetItem();
      const afterHyphen = this.source[this.pos + 1];
      if (this.peek() !== '-' || afterHyphen === undefined || afterHyphen === ']') {
        set = set.union(first.set);
        continue;
      }
      this.pos++;
      const last = this.parseSetItem();
      const range = { start: itemStart, end: this.pos };
      if (first.char === null || last.char === null) {
        this.fail(
          "A class such as '\\d' cannot be an endpoint of a range. Write '\\-' for a literal hyphen.",
          range,
        );
      }
      if (first.char > last.char) {
        this.fail(
          `The range '${this.text(range)}' is out of order: '${first.char}' comes after '${last.char}' in ASCII.`,
          range,
        );
      }
      set = set.union(CharSet.range(first.char, last.char));
    }
    this.pos++;
    return { type: 'chars', set: negated ? set.complement() : set, range: { start: open, end: this.pos } };
  }

  private parseSetItem(): SetItem {
    if (this.peek() === '\\') return this.parseEscape(true);
    if (this.peek() === '[') {
      this.fail(
        "A '[' inside a character set is not supported: nested sets and POSIX classes are not available. Write '\\[' for a literal bracket.",
      );
    }
    const char = this.takeAscii();
    return { set: CharSet.of(char), char };
  }

  /** Parses a backslash escape: a predefined class or an escaped punctuation character. */
  private parseEscape(inSet: boolean): SetItem {
    const start = this.pos;
    this.pos++;
    const char = this.peek();
    if (char === undefined) {
      this.fail(
        "Incomplete escape: the '\\' at the end has no character to escape. Write '\\\\' for a literal backslash.",
        { start, end: start + 1 },
      );
    }
    const classSet = CLASS_ESCAPES.get(char);
    if (classSet) {
      this.pos++;
      return { set: classSet, char: null };
    }
    if (isAsciiLetter(char) || isAsciiDigit(char)) {
      this.fail(`The escape '\\${char}' is not supported${unsupportedEscapeReason(char, inSet)}`, {
        start,
        end: start + 2,
      });
    }
    const literal = this.takeAscii();
    return { set: CharSet.of(literal), char: literal };
  }

  /** Whether the next character is the `$` that closes the whole expression. */
  private atEndAnchor(): boolean {
    return this.depth === 0 && this.peek() === '$' && this.pos === this.source.length - 1;
  }

  private peek(): string | undefined {
    return this.source[this.pos];
  }

  /** Consumes one character, which must be ASCII. */
  private takeAscii(): string {
    const codePoint = this.source.codePointAt(this.pos);
    if (codePoint === undefined) throw new Error('Unexpected end of regex source');
    const char = String.fromCodePoint(codePoint);
    if (codePoint >= ASCII_SIZE) {
      const hex = codePoint.toString(16).toUpperCase().padStart(4, '0');
      this.fail(
        `Non-ASCII character '${char}' (U+${hex}) is not supported. RESM handles ASCII characters only.`,
        { start: this.pos, end: this.pos + char.length },
      );
    }
    this.pos++;
    return char;
  }

  private text(range: SourceRange): string {
    return this.source.slice(range.start, range.end);
  }

  /** Reports a problem, by default at the next character or at the end of the source. */
  private fail(message: string, range?: SourceRange): never {
    const end = Math.min(this.pos + 1, this.source.length);
    throw new RegexSyntaxError(message, range ?? { start: this.pos, end });
  }
}

function nothingToRepeat(quantifier: string): string {
  return `Nothing to repeat: '${quantifier}' must follow a character, a set, or a group.`;
}

function isAsciiDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isAsciiLetter(char: string): boolean {
  return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
}

/** Explains why an escaped letter or digit is rejected; continues the sentence "... is not supported". */
function unsupportedEscapeReason(char: string, inSet: boolean): string {
  if ((char >= '1' && char <= '9') || char === 'k') {
    return ': backreferences cannot be expressed by a finite automaton.';
  }
  // Inside a set, `\b` conventionally means backspace rather than a word boundary.
  if ('ntrfvaecxuUoN0'.includes(char) || (inSet && char === 'b')) {
    return ': control, octal, hex, and Unicode escapes are not available.';
  }
  if ('bBAZzG'.includes(char)) {
    return ": word boundaries and anchors other than '^' and '$' are not available.";
  }
  if (char === 'p' || char === 'P') {
    return ': RESM handles ASCII characters only and has no Unicode properties.';
  }
  return '. Only \\d, \\w, \\s, \\D, \\W, \\S, and escaped punctuation are available.';
}
