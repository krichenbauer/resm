import { describe, expect, it } from 'vitest';
import { MAX_GROUP_DEPTH, MAX_REPETITION_COUNT } from './parser.ts';
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

describe('quantifiers', () => {
  it('parses *, +, and ?', () => {
    expect(tree('a*')).toBe("(rep 'a' 0 inf)");
    expect(tree('a+')).toBe("(rep 'a' 1 inf)");
    expect(tree('a?')).toBe("(rep 'a' 0 1)");
  });

  it('parses bounded repetition', () => {
    expect(tree('a{3}')).toBe("(rep 'a' 3 3)");
    expect(tree('a{2,}')).toBe("(rep 'a' 2 inf)");
    expect(tree('a{2,5}')).toBe("(rep 'a' 2 5)");
    expect(tree('a{0}')).toBe("(rep 'a' 0 0)");
    expect(tree('a{0,0}')).toBe("(rep 'a' 0 0)");
    expect(tree('a{007}')).toBe("(rep 'a' 7 7)");
    expect(tree('a{3,3}')).toBe("(rep 'a' 3 3)");
  });

  it('binds a quantifier to the preceding character or group only', () => {
    expect(tree('ab*')).toBe("(cat 'a' (rep 'b' 0 inf))");
    expect(tree('(ab)*')).toBe("(rep (cat 'a' 'b') 0 inf)");
    expect(tree('a|b+')).toBe("(alt 'a' (rep 'b' 1 inf))");
    expect(tree('(a|b){2}c')).toBe("(cat (rep (alt 'a' 'b') 2 2) 'c')");
    expect(tree('()*')).toBe('(rep ε 0 inf)');
  });

  it('allows a quantified group to be quantified again', () => {
    expect(tree('(a*)*')).toBe("(rep (rep 'a' 0 inf) 0 inf)");
    expect(tree('(a{2}){3}')).toBe("(rep (rep 'a' 2 2) 3 3)");
  });

  it('treats lazy quantifiers like their greedy forms', () => {
    expect(tree('a*?')).toBe(tree('a*'));
    expect(tree('a+?')).toBe(tree('a+'));
    expect(tree('a??')).toBe(tree('a?'));
    expect(tree('a{2,5}?')).toBe(tree('a{2,5}'));
    expect(tree('a*?b')).toBe("(cat (rep 'a' 0 inf) 'b')");
  });

  it('covers the quantified part and the quantifier in the source range', () => {
    expect(parseValid('ab*')).toMatchObject({ parts: [{}, { type: 'repeat', range: { start: 1, end: 3 } }] });
    expect(parseValid('(ab){2,}?')).toMatchObject({
      type: 'repeat',
      range: { start: 0, end: 9 },
      body: { type: 'concat', range: { start: 1, end: 3 } },
    });
  });

  it('accepts the maximum repetition count and rejects larger ones', () => {
    expect(tree(`a{${MAX_REPETITION_COUNT}}`)).toBe(`(rep 'a' ${MAX_REPETITION_COUNT} ${MAX_REPETITION_COUNT})`);
    expect(parseInvalid(`a{${MAX_REPETITION_COUNT + 1}}`)).toEqual({
      message: `Repetition count ${MAX_REPETITION_COUNT + 1} is too large; the maximum is ${MAX_REPETITION_COUNT}.`,
      range: { start: 2, end: 6 },
    });
    expect(parseInvalid('a{1,99999999999999999999999}')).toMatchObject({ range: { start: 4, end: 27 } });
  });

  it('rejects a quantifier with nothing to repeat', () => {
    const message = (quantifier: string) =>
      `Nothing to repeat: '${quantifier}' must follow a character, a set, or a group.`;
    expect(parseInvalid('*')).toEqual({ message: message('*'), range: { start: 0, end: 1 } });
    expect(parseInvalid('a|+')).toEqual({ message: message('+'), range: { start: 2, end: 3 } });
    expect(parseInvalid('(*)')).toEqual({ message: message('*'), range: { start: 1, end: 2 } });
    expect(parseInvalid('^*')).toEqual({ message: message('*'), range: { start: 1, end: 2 } });
    expect(parseInvalid('{2,3}a')).toEqual({ message: message('{2,3}'), range: { start: 0, end: 5 } });
  });

  it('rejects a quantifier directly after another quantifier', () => {
    const message =
      'A quantifier cannot directly follow another quantifier. Put the first one in a group, for example (a*)*.';
    expect(parseInvalid('a**')).toEqual({ message, range: { start: 2, end: 3 } });
    expect(parseInvalid('a*??')).toEqual({ message, range: { start: 3, end: 4 } });
    expect(parseInvalid('a?*')).toEqual({ message, range: { start: 2, end: 3 } });
    expect(parseInvalid('a{2}{3}')).toEqual({ message, range: { start: 4, end: 5 } });
    expect(parseInvalid('a+{3}')).toEqual({ message, range: { start: 2, end: 3 } });
  });

  it('rejects possessive quantifiers, which would change the language', () => {
    const message = (quantifier: string) => `Possessive quantifiers such as '${quantifier}' are not supported.`;
    expect(parseInvalid('a*+')).toEqual({ message: message('*+'), range: { start: 1, end: 3 } });
    expect(parseInvalid('a++b')).toEqual({ message: message('++'), range: { start: 1, end: 3 } });
    expect(parseInvalid('a?+')).toEqual({ message: message('?+'), range: { start: 1, end: 3 } });
    expect(parseInvalid('a{2}+')).toEqual({ message: message('{2}+'), range: { start: 1, end: 5 } });
  });

  it('rejects malformed bounded repetition', () => {
    const notARepetition =
      "'{' must start a repetition such as {3}, {2,} or {2,5}. Write '\\{' for a literal brace.";
    expect(parseInvalid('a{')).toEqual({ message: notARepetition, range: { start: 1, end: 2 } });
    expect(parseInvalid('a{}')).toEqual({ message: notARepetition, range: { start: 1, end: 2 } });
    expect(parseInvalid('a{x}')).toEqual({ message: notARepetition, range: { start: 1, end: 2 } });
    expect(parseInvalid('a{ 2}')).toEqual({ message: notARepetition, range: { start: 1, end: 2 } });
    expect(parseInvalid('{a')).toEqual({ message: notARepetition, range: { start: 0, end: 1 } });

    expect(parseInvalid('a{,3}')).toEqual({
      message: 'A repetition needs a lower bound. Write {0,3} instead of {,3}.',
      range: { start: 1, end: 5 },
    });

    const unterminated = "Unterminated repetition: expected '}' here.";
    expect(parseInvalid('a{2')).toEqual({ message: unterminated, range: { start: 3, end: 3 } });
    expect(parseInvalid('a{2,')).toEqual({ message: unterminated, range: { start: 4, end: 4 } });
    expect(parseInvalid('a{2,3')).toEqual({ message: unterminated, range: { start: 5, end: 5 } });
    expect(parseInvalid('a{2,3 }')).toEqual({ message: unterminated, range: { start: 5, end: 6 } });
    expect(parseInvalid('a{2;3}')).toEqual({ message: unterminated, range: { start: 3, end: 4 } });

    expect(parseInvalid('a{3,2}')).toEqual({
      message: 'The upper bound 2 of this repetition is smaller than its lower bound 3.',
      range: { start: 1, end: 6 },
    });
  });
});
