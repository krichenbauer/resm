import type { RegexNode, SourceRange } from './ast.ts';
import { ASCII_SIZE, CharSet } from './charset.ts';

/** Deepest supported nesting of groups; bounds the recursion of the parser and its consumers. */
export const MAX_GROUP_DEPTH = 100;

/** Largest supported count in a bounded repetition such as `a{1000}`. */
export const MAX_REPETITION_COUNT = 1000;

/** The repetition bounds of a quantifier; `max` is `null` when unbounded. */
interface Bounds {
  readonly min: number;
  readonly max: number | null;
}

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
    for (let char = this.peek(); char !== undefined && char >= '0' && char <= '9'; char = this.peek()) {
      this.pos++;
    }
  }

  private parseAtom(): RegexNode {
    const start = this.pos;
    const char = this.peek();
    switch (char) {
      case '(':
        return this.parseGroup();
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
