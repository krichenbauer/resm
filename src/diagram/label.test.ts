import { describe, expect, it } from 'vitest';
import { CharSet } from '../regex/charset.ts';
import { ANY_CHAR, DIGIT, SPACE, WORD } from '../regex/classes.ts';
import { parseValid } from '../regex/test-support.ts';
import { formatLabel } from './label.ts';

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

  it('spells out the whole alphabet as a range', () => {
    expect(formatLabel(CharSet.ALL)).toBe('[\\x00-\\x7f]');
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
      if (/\\[tnvfr0x]/.test(text) || set.isEmpty) continue;
      const parsed = parseValid(text.replaceAll('␣', ' '));
      if (parsed.type !== 'chars') throw new Error(`Label ${text} is not a single set`);
      expect(parsed.set.equals(set), text).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(1500);
  });
});
