import { describe, expect, it } from 'vitest';
import { CharSet } from './charset.ts';
import { MAX_GROUP_DEPTH, MAX_REPETITION_COUNT, parseRegex } from './parser.ts';
import { formatSet, parseInvalid, parseValid, tree } from './test-support.ts';

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

describe('dot, predefined classes, and escapes', () => {
  it('parses the dot as any character except the line feed', () => {
    expect(tree('.')).toBe('[\\x00-\\x09\\x0b-\\x7f]');
    expect(tree('a.*')).toBe("(cat 'a' (rep [\\x00-\\x09\\x0b-\\x7f] 0 inf))");
  });

  it('parses the predefined classes', () => {
    expect(tree('\\d')).toBe('[0-9]');
    expect(tree('\\w')).toBe('[0-9A-Z_a-z]');
    expect(tree('\\s')).toBe('[\\x09-\\x0d\\x20]');
  });

  it('parses the negated classes as complements within ASCII', () => {
    expect(tree('\\D')).toBe('[\\x00-/:-\\x7f]');
    expect(tree('\\W')).toBe('[\\x00-/:-@[-^`{-\\x7f]');
    expect(tree('\\S')).toBe('[\\x00-\\x08\\x0e-\\x1f!-\\x7f]');
  });

  it('parses an escaped punctuation character as a literal', () => {
    for (const char of ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~') {
      expect(tree(`\\${char}`)).toBe(formatSet(CharSet.of(char)));
    }
    expect(tree('\\*')).toBe("'*'");
    expect(tree('\\\\')).toBe("'\\'");
    expect(tree('a\\.b')).toBe("(cat 'a' '.' 'b')");
    expect(tree('\\(a\\)')).toBe("(cat '(' 'a' ')')");
    expect(tree('\\^a\\$')).toBe("(cat '^' 'a' '$')");
    expect(tree('a\\{2\\}')).toBe("(cat 'a' '{' '2' '}')");
  });

  it('lets escapes be quantified', () => {
    expect(tree('\\d+')).toBe('(rep [0-9] 1 inf)');
    expect(tree('\\++')).toBe("(rep '+' 1 inf)");
  });

  it('rejects a backslash at the end', () => {
    expect(parseInvalid('a\\')).toEqual({
      message: "Incomplete escape: the '\\' at the end has no character to escape. Write '\\\\' for a literal backslash.",
      range: { start: 1, end: 2 },
    });
  });

  it('rejects control and hex escapes', () => {
    const message = (escape: string) =>
      `The escape '${escape}' is not supported: control, octal, hex, and Unicode escapes are not available.`;
    expect(parseInvalid('a\\n')).toEqual({ message: message('\\n'), range: { start: 1, end: 3 } });
    for (const letter of 'ntrfvaecxuUoN0') {
      expect(parseInvalid(`\\${letter}`)).toEqual({ message: message(`\\${letter}`), range: { start: 0, end: 2 } });
    }
    expect(parseInvalid('\\x41')).toMatchObject({ range: { start: 0, end: 2 } });
  });

  it('rejects backreferences', () => {
    const message = (escape: string) =>
      `The escape '${escape}' is not supported: backreferences cannot be expressed by a finite automaton.`;
    expect(parseInvalid('(a)\\1')).toEqual({ message: message('\\1'), range: { start: 3, end: 5 } });
    expect(parseInvalid('\\9')).toEqual({ message: message('\\9'), range: { start: 0, end: 2 } });
    expect(parseInvalid('\\k<n>')).toEqual({ message: message('\\k'), range: { start: 0, end: 2 } });
  });

  it('rejects word boundaries and extra anchors', () => {
    const message = (escape: string) =>
      `The escape '${escape}' is not supported: word boundaries and anchors other than '^' and '$' are not available.`;
    for (const letter of 'bBAZzG') {
      expect(parseInvalid(`\\${letter}`)).toEqual({ message: message(`\\${letter}`), range: { start: 0, end: 2 } });
    }
  });

  it('rejects Unicode property classes', () => {
    const message = (escape: string) =>
      `The escape '${escape}' is not supported: RESM handles ASCII characters only and has no Unicode properties.`;
    expect(parseInvalid('\\p{L}')).toEqual({ message: message('\\p'), range: { start: 0, end: 2 } });
    expect(parseInvalid('\\P{L}')).toEqual({ message: message('\\P'), range: { start: 0, end: 2 } });
  });

  it('rejects every other escaped letter instead of guessing', () => {
    const supported = 'dwsDWS';
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const letter of letters) {
      expect(parseRegex(`\\${letter}`).ok).toBe(supported.includes(letter));
    }
    expect(parseInvalid('\\h')).toEqual({
      message: "The escape '\\h' is not supported. Only \\d, \\w, \\s, \\D, \\W, \\S, and escaped punctuation are available.",
      range: { start: 0, end: 2 },
    });
  });

  it('rejects an escaped non-ASCII character', () => {
    expect(parseInvalid('\\é')).toMatchObject({ range: { start: 1, end: 2 } });
  });
});

describe('character sets', () => {
  it('parses listed characters and ranges', () => {
    expect(tree('[abc]')).toBe('[a-c]');
    expect(tree('[a-z]')).toBe('[a-z]');
    expect(tree('[a-zA-Z0-9_]')).toBe(tree('\\w'));
    expect(tree('[a-a]')).toBe("'a'");
    expect(tree('[x]')).toBe("'x'");
    expect(tree('[aab]')).toBe('[a-b]');
    expect(tree('[ -~]')).toBe('[\\x20-~]');
  });

  it('negates within ASCII, including the line feed', () => {
    expect(tree('[^a]')).toBe('[\\x00-`b-\\x7f]');
    expect(tree('[^a-z]')).toBe('[\\x00-`{-\\x7f]');
    expect(parseValid('[^a]')).toMatchObject({ type: 'chars', range: { start: 0, end: 4 } });
  });

  it('treats regex metacharacters inside a set as literals', () => {
    expect(tree('[.]')).toBe("'.'");
    expect(tree('[*+?]')).toBe('[*-+?]');
    expect(tree('[(){}|$]')).toBe('[$(-){-}]');
    expect(tree('[a^]')).toBe('[^a]');
    expect(tree('[^^]')).toBe('[\\x00-]_-\\x7f]');
  });

  it('treats a hyphen at the start or end of a set as a literal', () => {
    expect(tree('[-a]')).toBe('[-a]');
    expect(tree('[a-]')).toBe('[-a]');
    expect(tree('[^-a]')).toBe(tree('[^a-]'));
    expect(tree('[-]')).toBe("'-'");
    expect(tree('[a\\-z]')).toBe('[-az]');
    expect(tree('[a-c-e]')).toBe('[-a-ce]');
    expect(tree('[+--]')).toBe('[+--]');
  });

  it('treats a closing bracket directly after the opening as a literal', () => {
    expect(tree('[]a]')).toBe('[]a]');
    expect(tree('[^]a]')).toBe('[\\x00-\\^-`b-\\x7f]');
    expect(tree('[]]')).toBe("']'");
    expect(tree('[a\\]]')).toBe('[]a]');
  });

  it('supports classes and escapes inside a set', () => {
    expect(tree('[\\d_]')).toBe('[0-9_]');
    expect(tree('[\\w.-]')).toBe('[--.0-9A-Z_a-z]');
    expect(tree('[^\\d]')).toBe(tree('\\D'));
    expect(tree('[\\D]')).toBe(tree('\\D'));
    expect(tree('[\\s\\S]')).toBe('[\\x00-\\x7f]');
    expect(tree('[\\\\\\[]')).toBe('[[-\\]');
    expect(tree('[\\^a]')).toBe('[^a]');
    expect(tree('[\\d-]')).toBe('[-0-9]');
  });

  it('allows a set that matches no character at all', () => {
    expect(tree('[^\\s\\S]')).toBe('[]');
    expect(tree('a[^\\d\\D]')).toBe("(cat 'a' [])");
  });

  it('lets sets be quantified and combined', () => {
    expect(tree('[ab]+c')).toBe("(cat (rep [a-b] 1 inf) 'c')");
    expect(tree('[a-c][x-z]{2}')).toBe('(cat [a-c] (rep [x-z] 2 2))');
  });

  it('rejects an unterminated set', () => {
    const message = "Unterminated character set: this '[' has no matching ']'.";
    expect(parseInvalid('[')).toEqual({ message, range: { start: 0, end: 1 } });
    expect(parseInvalid('a[bc')).toEqual({ message, range: { start: 1, end: 2 } });
    expect(parseInvalid('[a-')).toEqual({ message, range: { start: 0, end: 1 } });
    expect(parseInvalid('[a\\]')).toEqual({ message, range: { start: 0, end: 1 } });

    const withHint = `${message} A ']' directly after the opening is a literal character.`;
    expect(parseInvalid('[]')).toEqual({ message: withHint, range: { start: 0, end: 1 } });
    expect(parseInvalid('[^]')).toEqual({ message: withHint, range: { start: 0, end: 1 } });
  });

  it('rejects ranges that are out of order', () => {
    expect(parseInvalid('[z-a]')).toEqual({
      message: "The range 'z-a' is out of order: 'z' comes after 'a' in ASCII.",
      range: { start: 1, end: 4 },
    });
    expect(parseInvalid('[a-Z]')).toMatchObject({ range: { start: 1, end: 4 } });
    expect(parseInvalid('[a\\--\\+]')).toMatchObject({ range: { start: 2, end: 7 } });
  });

  it('rejects a class as the endpoint of a range', () => {
    const message = "A class such as '\\d' cannot be an endpoint of a range. Write '\\-' for a literal hyphen.";
    expect(parseInvalid('[a-\\d]')).toEqual({ message, range: { start: 1, end: 5 } });
    expect(parseInvalid('[\\d-a]')).toEqual({ message, range: { start: 1, end: 5 } });
    expect(parseInvalid('[\\w-\\d]')).toEqual({ message, range: { start: 1, end: 6 } });
  });

  it('rejects nested sets and POSIX classes', () => {
    const message =
      "A '[' inside a character set is not supported: nested sets and POSIX classes are not available. Write '\\[' for a literal bracket.";
    expect(parseInvalid('[a[b]]')).toEqual({ message, range: { start: 2, end: 3 } });
    expect(parseInvalid('[[:alpha:]]')).toEqual({ message, range: { start: 1, end: 2 } });
    expect(parseInvalid('[a-[]')).toEqual({ message, range: { start: 3, end: 4 } });
  });

  it('rejects set intersection', () => {
    expect(parseInvalid('[a-z&&[^b]]')).toEqual({
      message: "Set intersection with '&&' is not supported. Write '\\&' for a literal ampersand.",
      range: { start: 4, end: 6 },
    });
    expect(tree('[a&b]')).toBe('[&a-b]');
    expect(tree('[\\&\\&]')).toBe("'&'");
  });

  it('rejects non-ASCII characters and unsupported escapes inside a set', () => {
    expect(parseInvalid('[aé]')).toMatchObject({ range: { start: 2, end: 3 } });
    expect(parseInvalid('[a-é]')).toMatchObject({ range: { start: 3, end: 4 } });
    expect(parseInvalid('[\\n]')).toMatchObject({ range: { start: 1, end: 3 } });
    expect(parseInvalid('[\\b]')).toEqual({
      message: "The escape '\\b' is not supported: control, octal, hex, and Unicode escapes are not available.",
      range: { start: 1, end: 3 },
    });
  });
});

describe('unsupported group syntax', () => {
  it('rejects non-capturing groups', () => {
    expect(parseInvalid('a(?:b)')).toEqual({
      message: "Non-capturing groups '(?:...)' are not supported. Use a plain group '(...)' instead.",
      range: { start: 1, end: 4 },
    });
  });

  it('rejects lookaround assertions', () => {
    const message = 'Lookahead and lookbehind assertions are not supported.';
    expect(parseInvalid('(?=a)')).toEqual({ message, range: { start: 0, end: 3 } });
    expect(parseInvalid('(?!a)')).toEqual({ message, range: { start: 0, end: 3 } });
    expect(parseInvalid('(?<=a)')).toEqual({ message, range: { start: 0, end: 4 } });
    expect(parseInvalid('(?<!a)')).toEqual({ message, range: { start: 0, end: 4 } });
  });

  it('rejects named groups', () => {
    const message = "Named groups are not supported. Use a plain group '(...)' instead.";
    expect(parseInvalid('(?<name>a)')).toEqual({ message, range: { start: 0, end: 3 } });
    expect(parseInvalid('(?P<name>a)')).toEqual({ message, range: { start: 0, end: 4 } });
  });

  it('rejects inline flags', () => {
    const message = "Flags such as '(?i)' are not supported.";
    expect(parseInvalid('(?i)a')).toEqual({ message, range: { start: 0, end: 3 } });
    expect(parseInvalid('(?s:a)')).toEqual({ message, range: { start: 0, end: 3 } });
    expect(parseInvalid('(?-i)a')).toEqual({ message, range: { start: 0, end: 3 } });
  });

  it('rejects every other group extension', () => {
    const message = "Group extensions starting with '(?' are not supported. Write '\\(\\?' for the literal characters.";
    expect(parseInvalid('(?>a)')).toEqual({ message, range: { start: 0, end: 2 } });
    expect(parseInvalid('(?#note)')).toEqual({ message, range: { start: 0, end: 2 } });
    expect(parseInvalid('(?P=name)')).toEqual({ message, range: { start: 0, end: 2 } });
    expect(parseInvalid('(?')).toEqual({ message, range: { start: 0, end: 2 } });
  });
});

describe('robustness', () => {
  it('answers every input with a tree or a diagnostic inside the source', () => {
    const alphabet = ['a', 'b', '0', '-', '^', '$', '.', '|', '?', '*', '+', '(', ')', '[', ']', '{', '}', ',', '\\', 'd', '&', ':', '<', '=', 'é', '😀'];
    // Small linear congruential generator, so failures are reproducible.
    let seed = 1;
    const next = (bound: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return Math.floor((seed / 4294967296) * bound);
    };

    for (let round = 0; round < 20_000; round++) {
      const source = Array.from({ length: next(12) }, () => alphabet[next(alphabet.length)]).join('');
      const result = parseRegex(source);
      if (result.ok) continue;
      const { message, range } = result.error;
      expect(message, source).not.toBe('');
      expect(range.start, source).toBeGreaterThanOrEqual(0);
      expect(range.end, source).toBeGreaterThanOrEqual(range.start);
      expect(range.end, source).toBeLessThanOrEqual(source.length);
      // Only a problem at the very end of the source may have an empty location.
      if (range.start === range.end) expect(range.start, source).toBe(source.length);
    }
  });
});
