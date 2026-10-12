import type { RegexNode, SourceRange } from './ast.ts';
import { ASCII_SIZE, CharSet } from './charset.ts';

/** Deepest supported nesting of groups; bounds the recursion of the parser and its consumers. */
export const MAX_GROUP_DEPTH = 100;

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
      parts.push(this.parseAtom());
    }
    const [only] = parts;
    if (!only) return { type: 'empty', range: { start, end: start } };
    if (parts.length === 1) return only;
    return { type: 'concat', parts, range: { start, end: this.pos } };
  }

  private parseAtom(): RegexNode {
    const start = this.pos;
    const char = this.peek();
    switch (char) {
      case '(':
        return this.parseGroup();
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

  /** Reports a problem, by default at the next character. */
  private fail(message: string, range?: SourceRange): never {
    throw new RegexSyntaxError(message, range ?? { start: this.pos, end: this.pos + 1 });
  }
}
