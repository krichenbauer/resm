import { describe, expect, it } from 'vitest';
import { MAX_GROUP_DEPTH } from './parser.ts';
import { parseInvalid, parseValid, tree } from './test-support.ts';

describe('literals, concatenation, alternation, and grouping', () => {
  it('parses the empty regex as the empty string', () => {
    expect(parseValid('')).toEqual({ type: 'empty', range: { start: 0, end: 0 } });
  });

  it('parses a literal character', () => {
    expect(tree('a')).toBe("'a'");
  });

  it('parses concatenation', () => {
    expect(tree('abc')).toBe("(cat 'a' 'b' 'c')");
  });

  it('parses alternation with lower precedence than concatenation', () => {
    expect(tree('a|b')).toBe("(alt 'a' 'b')");
    expect(tree('ab|c|d')).toBe("(alt (cat 'a' 'b') 'c' 'd')");
  });

  it('allows empty alternatives', () => {
    expect(tree('a|')).toBe("(alt 'a' ε)");
    expect(tree('|a')).toBe("(alt ε 'a')");
    expect(tree('|')).toBe('(alt ε ε)');
  });

  it('parses groups without leaving a node of their own', () => {
    expect(tree('(a)')).toBe("'a'");
    expect(tree('((a))')).toBe("'a'");
    expect(tree('()')).toBe('ε');
    expect(tree('(a|b)c')).toBe("(cat (alt 'a' 'b') 'c')");
    expect(tree('a(b|)')).toBe("(cat 'a' (alt 'b' ε))");
  });

  it('treats characters without special meaning as literals', () => {
    expect(tree(' ')).toBe("'\\x20'");
    expect(tree('a]')).toBe("(cat 'a' ']')");
    expect(tree('a}')).toBe("(cat 'a' '}')");
    expect(tree('-,#')).toBe("(cat '-' ',' '#')");
    expect(tree('\t')).toBe("'\\x09'");
    expect(tree('\u007f')).toBe("'\\x7f'");
  });

  it('records source ranges', () => {
    expect(parseValid('ab|c')).toMatchObject({
      type: 'alternation',
      range: { start: 0, end: 4 },
      options: [
        {
          type: 'concat',
          range: { start: 0, end: 2 },
          parts: [{ range: { start: 0, end: 1 } }, { range: { start: 1, end: 2 } }],
        },
        { type: 'chars', range: { start: 3, end: 4 } },
      ],
    });
    expect(parseValid('a|')).toMatchObject({ options: [{}, { type: 'empty', range: { start: 2, end: 2 } }] });
  });

  it('reports unbalanced parentheses', () => {
    expect(parseInvalid('(a')).toEqual({
      message: "Unterminated group: this '(' has no matching ')'.",
      range: { start: 0, end: 1 },
    });
    expect(parseInvalid('a(b(c)')).toMatchObject({ range: { start: 1, end: 2 } });
    expect(parseInvalid('a)b')).toEqual({
      message: "Unmatched ')': there is no '(' to close. Write '\\)' for a literal parenthesis.",
      range: { start: 1, end: 2 },
    });
  });

  it(`accepts ${MAX_GROUP_DEPTH} nested groups and rejects deeper nesting`, () => {
    const nested = (depth: number) => '('.repeat(depth) + 'a' + ')'.repeat(depth);
    expect(tree(nested(MAX_GROUP_DEPTH))).toBe("'a'");
    expect(parseInvalid(nested(MAX_GROUP_DEPTH + 1))).toEqual({
      message: `Groups are nested too deeply; the maximum depth is ${MAX_GROUP_DEPTH}.`,
      range: { start: MAX_GROUP_DEPTH, end: MAX_GROUP_DEPTH + 1 },
    });
    expect(parseInvalid('('.repeat(50_000))).toMatchObject({
      range: { start: MAX_GROUP_DEPTH, end: MAX_GROUP_DEPTH + 1 },
    });
  });
});

describe('full-match anchors', () => {
  it('accepts a redundant ^ at the beginning and $ at the end', () => {
    expect(tree('^a$')).toBe("'a'");
    expect(tree('^a')).toBe("'a'");
    expect(tree('a$')).toBe("'a'");
    expect(tree('^a|b$')).toBe("(alt 'a' 'b')");
    expect(tree('a|$')).toBe("(alt 'a' ε)");
  });

  it('treats a regex of anchors only as the empty regex', () => {
    expect(tree('^')).toBe('ε');
    expect(tree('$')).toBe('ε');
    expect(tree('^$')).toBe('ε');
  });

  it('keeps the anchors out of the source range of the expression', () => {
    expect(parseValid('^ab$')).toMatchObject({ range: { start: 1, end: 3 } });
  });

  it('rejects ^ anywhere but at the beginning', () => {
    const message = "'^' is only allowed at the very beginning of the expression. Write '\\^' for a literal caret.";
    expect(parseInvalid('a^b')).toEqual({ message, range: { start: 1, end: 2 } });
    expect(parseInvalid('^^a')).toEqual({ message, range: { start: 1, end: 2 } });
    expect(parseInvalid('(^a)')).toEqual({ message, range: { start: 1, end: 2 } });
    expect(parseInvalid('a|^b')).toEqual({ message, range: { start: 2, end: 3 } });
  });

  it('rejects $ anywhere but at the end', () => {
    const message = "'$' is only allowed at the very end of the expression. Write '\\$' for a literal dollar sign.";
    expect(parseInvalid('a$b')).toEqual({ message, range: { start: 1, end: 2 } });
    expect(parseInvalid('a$$')).toEqual({ message, range: { start: 1, end: 2 } });
    expect(parseInvalid('(a$)')).toEqual({ message, range: { start: 2, end: 3 } });
    expect(parseInvalid('a$|b')).toEqual({ message, range: { start: 1, end: 2 } });
  });
});

describe('ASCII restriction', () => {
  it('rejects non-ASCII characters and names the code point', () => {
    expect(parseInvalid('aé')).toEqual({
      message: "Non-ASCII character 'é' (U+00E9) is not supported. RESM handles ASCII characters only.",
      range: { start: 1, end: 2 },
    });
  });

  it('reports a character outside the Basic Multilingual Plane as one location', () => {
    expect(parseInvalid('a😀b')).toEqual({
      message: "Non-ASCII character '😀' (U+1F600) is not supported. RESM handles ASCII characters only.",
      range: { start: 1, end: 3 },
    });
  });

  it('rejects the first character beyond U+007F', () => {
    expect(parseInvalid('\u0080')).toMatchObject({ range: { start: 0, end: 1 } });
  });
});
