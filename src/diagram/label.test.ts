import { describe, expect, it } from 'vitest';
import { CharSet } from '../regex/charset.ts';
import { ANY_CHAR, DIGIT, SPACE, WORD } from '../regex/classes.ts';
import { parseValid } from '../regex/test-support.ts';
import { formatAlphabet, formatLabel } from './label.ts';

const label = (chars: string) => formatLabel(CharSet.of(chars));

describe('edge labels', () => {
  it('shows a single character as itself', () => {
    expect(label('a')).toBe('a');
    expect(label('0')).toBe('0');
    expect(label(']')).toBe(']');
    expect(label('}')).toBe('}');
    expect(label('-')).toBe('-');
  });

  it('escapes a single character that has a special meaning in a regex', () => {
    for (const char of '\\^$.|?*+()[{') expect(label(char)).toBe(`\\${char}`);
  });

  it('makes whitespace and control characters visible', () => {
    expect(label(' ')).toBe('␣');
    expect(label('\t')).toBe('\\t');
    expect(label('\n')).toBe('\\n');
    expect(label('\v')).toBe('\\v');
    expect(label('\f')).toBe('\\f');
    expect(label('\r')).toBe('\\r');
    expect(label('\u0000')).toBe('\\0');
    expect(label('\u0001')).toBe('\\x01');
    expect(label('\u001f')).toBe('\\x1f');
    expect(label('\u007f')).toBe('\\x7f');
  });

  it('uses the class shorthand for a set that is exactly a class', () => {
    expect(formatLabel(DIGIT)).toBe('\\d');
    expect(formatLabel(WORD)).toBe('\\w');
    expect(formatLabel(SPACE)).toBe('\\s');
    expect(formatLabel(DIGIT.complement())).toBe('\\D');
    expect(formatLabel(WORD.complement())).toBe('\\W');
    expect(formatLabel(SPACE.complement())).toBe('\\S');
    expect(formatLabel(ANY_CHAR)).toBe('.');
  });

  it('writes Σ for all of ASCII', () => {
    expect(formatLabel(CharSet.ALL)).toBe('Σ');
  });

  it('lists the members of a small set and uses ranges for three or more neighbors', () => {
    expect(label('ab')).toBe('[ab]');
    expect(label('abc')).toBe('[a-c]');
    expect(label('xba')).toBe('[abx]');
    expect(formatLabel(CharSet.range('a', 'z'))).toBe('[a-z]');
    expect(formatLabel(CharSet.range('0', '9').union(CharSet.range('a', 'f')))).toBe('[0-9a-f]');
    expect(label('abcxyz_')).toBe('[_a-cx-z]');
    expect(label('a b')).toBe('[␣ab]');
  });

  it('escapes the characters that are special inside a set', () => {
    expect(label('[]')).toBe('[\\[\\]]');
    expect(label('^-')).toBe('[\\-\\^]');
    expect(label('\\a')).toBe('[\\\\a]');
    expect(label('.*')).toBe('[*.]');
  });

  it('uses \\w and \\s inside a set that contains the whole class', () => {
    expect(formatLabel(WORD.union(CharSet.of('.-')))).toBe('[\\w\\-.]');
    expect(formatLabel(SPACE.union(CharSet.of('a')))).toBe('[\\sa]');
    expect(formatLabel(WORD.union(SPACE))).toBe('[\\w\\s]');
    expect(formatLabel(DIGIT.union(CharSet.of('_')))).toBe('[0-9_]');
  });

  it('negates when that is shorter', () => {
    expect(formatLabel(CharSet.of('a').complement())).toBe('[^a]');
    expect(formatLabel(CharSet.of('ab').complement())).toBe('[^ab]');
    expect(formatLabel(CharSet.of(']').complement())).toBe('[^\\]]');
    expect(formatLabel(ANY_CHAR.minus(CharSet.of('a')))).toBe('[^\\na]');
    expect(formatLabel(CharSet.range('a', 'z').complement())).toBe('[^a-z]');
    expect(formatLabel(WORD.union(CharSet.of('-')).complement())).toBe('[^\\w\\-]');
    expect(formatLabel(CharSet.of(' ').complement())).toBe('[^␣]');
  });

  it('never negates the empty rest of the alphabet', () => {
    expect(formatLabel(CharSet.EMPTY)).toBe('[]');
  });

  it('reads back as exactly the same set', () => {
    // Small linear congruential generator, so failures are reproducible.
    let seed = 7;
    const next = (bound: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return Math.floor((seed / 4294967296) * bound);
    };
    const printable = CharSet.range('!', '~');
    const pools = ['abcxyz', '0123456789_', 'azAZ09_-', '[]^-\\.*+?(){}|$', '!"#%&\',/:;<=>@`~'];

    let checked = 0;
    for (let round = 0; round < 3000; round++) {
      const pool = pools[next(pools.length)] ?? '';
      let set = CharSet.of(Array.from({ length: 1 + next(6) }, () => pool[next(pool.length)]).join(''));
      if (next(4) === 0) set = set.union(WORD);
      if (next(8) === 0) set = set.union(SPACE);
      if (next(3) === 0) set = set.complement();
      if (next(5) === 0) set = set.intersection(printable);

      const text = formatLabel(set);
      // Labels may show characters in a form the input syntax does not accept.
      if (/\\[tnvfr0x]/.test(text) || set.isEmpty || text === 'Σ') continue;
      const parsed = parseValid(text.replaceAll('␣', ' '));
      if (parsed.type !== 'chars') throw new Error(`Label ${text} is not a single set`);
      expect(parsed.set.equals(set), text).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(1500);
  });
});

describe('edge labels over a smaller alphabet', () => {
  const over = (alphabet: string) => (chars: string) => formatLabel(CharSet.of(chars), CharSet.of(alphabet));

  it('lists a whole alphabet of fewer than six characters', () => {
    expect(over('ab')('ab')).toBe('a, b');
    expect(over('a')('a')).toBe('a');
    expect(over('01234')('01234')).toBe('0, 1, 2, 3, 4');
    expect(over(' .a')(' .a')).toBe('␣, \\., a');
  });

  it('writes Σ for a whole alphabet of six or more characters', () => {
    expect(over('abcdef')('abcdef')).toBe('Σ');
    expect(formatLabel(DIGIT, DIGIT)).toBe('Σ');
  });

  it('labels a part of the alphabet as over ASCII', () => {
    expect(over('abc')('a')).toBe('a');
    expect(over('abc')('ab')).toBe('[ab]');
    expect(over('abcxyz')('abc')).toBe('[a-c]');
    expect(formatLabel(DIGIT, DIGIT.union(CharSet.of('.')))).toBe('\\d');
  });

  it('negates within the alphabet when that is shorter', () => {
    expect(over('abcdxyz')('bcdxyz')).toBe('[^a]');
    // Listing wins a tie, because it does not depend on the alphabet.
    expect(over('abc')('bc')).toBe('[bc]');
    expect(over('abcdef')('abcf')).toBe('[^de]');
  });

  it('uses a negated class or the dot only for larger sets', () => {
    const letters = CharSet.range('a', 'h');
    expect(formatLabel(letters, letters.union(DIGIT))).toBe('\\D');
    expect(formatLabel(CharSet.of('ab'), CharSet.of('ab').union(DIGIT))).toBe('[ab]');
    const withLineFeed = CharSet.range('a', 'h').union(CharSet.of('\n'));
    expect(formatLabel(CharSet.range('a', 'h'), withLineFeed)).toBe('.');
  });
});

describe('alphabet caption', () => {
  it('lists the characters of a small alphabet', () => {
    expect(formatAlphabet(CharSet.of('ba'))).toBe('Σ = {a, b}');
    expect(formatAlphabet(CharSet.of('x'))).toBe('Σ = {x}');
  });

  it('abbreviates three or more neighbors as a range', () => {
    expect(formatAlphabet(CharSet.range('0', '9').union(CharSet.of('.-')))).toBe('Σ = {-, ., 0–9}');
    expect(formatAlphabet(WORD)).toBe('Σ = {0–9, A–Z, _, a–z}');
  });

  it('makes whitespace and control characters visible', () => {
    expect(formatAlphabet(CharSet.of(' \ta'))).toBe('Σ = {\\t, ␣, a}');
  });

  it('names the empty alphabet and all of ASCII', () => {
    expect(formatAlphabet(CharSet.EMPTY)).toBe('Σ = {}');
    expect(formatAlphabet(CharSet.ALL)).toBe('Σ = ASCII');
  });
});
