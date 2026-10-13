import { describe, expect, it } from 'vitest';
import { deriveAlphabet, findUnmatchable, restrictToAlphabet } from './alphabet.ts';
import { CharSet } from './charset.ts';
import { formatAst, formatSet, parseValid } from './test-support.ts';

const alphabetOf = (regex: string) => formatSet(deriveAlphabet(parseValid(regex)));
const restricted = (regex: string) => {
  const ast = parseValid(regex);
  return formatAst(restrictToAlphabet(ast, deriveAlphabet(ast)));
};

describe('alphabet derived from a regex', () => {
  it('consists of the characters that are written in the regex', () => {
    expect(alphabetOf('ab|c')).toBe('[a-c]');
    expect(alphabetOf('(a|b)*abb')).toBe('[a-b]');
    expect(alphabetOf('a')).toBe("'a'");
    expect(alphabetOf('^a$')).toBe("'a'");
    expect(alphabetOf('a\\.\\*')).toBe('[*.a]');
  });

  it('is empty for a regex without characters', () => {
    expect(alphabetOf('')).toBe('[]');
    expect(alphabetOf('()|')).toBe('[]');
    expect(alphabetOf('^$')).toBe('[]');
  });

  it('includes every member of a set, a range, or a class', () => {
    expect(alphabetOf('[a-c]x')).toBe('[a-cx]');
    expect(alphabetOf('\\d')).toBe('[0-9]');
    expect(alphabetOf('[\\d_]')).toBe('[0-9_]');
    expect(alphabetOf('\\s')).toBe('[\\x09-\\x0d\\x20]');
  });

  it('includes what a negated set or class excludes, since that is what is written', () => {
    expect(alphabetOf('[^a]')).toBe("'a'");
    expect(alphabetOf('[^a]b')).toBe('[a-b]');
    expect(alphabetOf('[^a-c]')).toBe('[a-c]');
    expect(alphabetOf('\\D')).toBe('[0-9]');
    expect(alphabetOf('[^\\d]x')).toBe('[0-9x]');
    expect(alphabetOf('[\\Da]')).toBe('[0-9a]');
    expect(alphabetOf('\\W')).toBe('[0-9A-Z_a-z]');
  });

  it('gets nothing from the dot, which names no character', () => {
    expect(alphabetOf('.')).toBe('[]');
    expect(alphabetOf('a.b')).toBe('[a-b]');
    expect(alphabetOf('.*|.+')).toBe('[]');
  });

  it('counts characters wherever they are written, even where they cannot match', () => {
    expect(alphabetOf('a{0}b')).toBe('[a-b]');
    expect(alphabetOf('a|b[^\\s\\S]')).toBe('[\\x09-\\x0d\\x20a-b]');
  });
});

describe('restricting a regex to an alphabet', () => {
  it('leaves characters, sets, and classes as they are within their own alphabet', () => {
    expect(restricted('a[bc]\\d')).toBe("(cat 'a' [b-c] [0-9])");
  });

  it('lets the dot and negation range over the alphabet instead of all of ASCII', () => {
    expect(restricted('a.b')).toBe("(cat 'a' [a-b] 'b')");
    expect(restricted('[^a]b')).toBe("(cat 'b' 'b')");
    expect(restricted('[^a]|b|c')).toBe("(alt [b-c] 'b' 'c')");
    expect(restricted('\\D\\d|x')).toBe("(alt (cat 'x' [0-9]) 'x')");
    expect(restricted('(a|b)*.')).toBe("(cat (rep (alt 'a' 'b') 0 inf) [a-b])");
  });

  it('keeps the dot from matching the line feed even if the alphabet has one', () => {
    expect(restricted('.\\sa')).toBe("(cat [\\x09\\x0b-\\x0d\\x20a] [\\x09-\\x0d\\x20] 'a')");
  });

  it('keeps the structure and the source ranges', () => {
    const ast = parseValid('a.|[^a]*');
    const result = restrictToAlphabet(ast, deriveAlphabet(ast));
    expect(result).toMatchObject({
      type: 'alternation',
      range: { start: 0, end: 8 },
      options: [{ type: 'concat', parts: [{ range: { start: 0, end: 1 } }, { range: { start: 1, end: 2 } }] }, { type: 'repeat' }],
    });
  });

  it('changes nothing when the alphabet is all of ASCII', () => {
    for (const regex of ['a.b', '[^a]\\D', '(a|b)*abb']) {
      const ast = parseValid(regex);
      expect(formatAst(restrictToAlphabet(ast, CharSet.ALL))).toBe(formatAst(ast));
    }
  });
});

describe('parts that cannot match in an alphabet', () => {
  const unmatchable = (regex: string) => {
    const ast = parseValid(regex);
    return findUnmatchable(ast, deriveAlphabet(ast)).map(({ range }) => regex.slice(range.start, range.end));
  };

  it('are a dot or a negation that leaves no character of the alphabet', () => {
    expect(unmatchable('.')).toEqual(['.']);
    expect(unmatchable('x*[^x]')).toEqual(['[^x]']);
    expect(unmatchable('\\d\\D|.')).toEqual(['\\D']);
    expect(unmatchable('.*|[^\\w]')).toEqual(['[^\\w]']);
    expect(unmatchable('\\D|[^\\d]')).toEqual(['\\D', '[^\\d]']);
  });

  it('are not reported when something of the alphabet is left', () => {
    expect(unmatchable('a.')).toEqual([]);
    expect(unmatchable('[^a]b')).toEqual([]);
    expect(unmatchable('(a|b)*abb')).toEqual([]);
    expect(unmatchable('')).toEqual([]);
  });

  it('do not include a set that matches nothing in any alphabet', () => {
    expect(unmatchable('a[^\\s\\S]')).toEqual([]);
  });
});
