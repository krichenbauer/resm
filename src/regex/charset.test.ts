import { describe, expect, it } from 'vitest';
import { CharSet } from './charset.ts';

describe('CharSet', () => {
  it('contains exactly the characters it was built from', () => {
    const set = CharSet.of('ab_');
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.has('_')).toBe(true);
    expect(set.has('c')).toBe(false);
    expect(set.size).toBe(3);
  });

  it('builds inclusive ranges', () => {
    const digits = CharSet.range('0', '9');
    expect(digits.has('0')).toBe(true);
    expect(digits.has('9')).toBe(true);
    expect(digits.has('/')).toBe(false);
    expect(digits.has(':')).toBe(false);
    expect(digits.size).toBe(10);
  });

  it('covers the whole ASCII range from U+0000 to U+007F and nothing else', () => {
    expect(CharSet.ALL.size).toBe(128);
    expect(CharSet.ALL.has('\u0000')).toBe(true);
    expect(CharSet.ALL.has('\u007f')).toBe(true);
    expect(CharSet.ALL.has('\u0080')).toBe(false);
    expect(CharSet.ALL.has('é')).toBe(false);
    expect(CharSet.EMPTY.size).toBe(0);
    expect(CharSet.EMPTY.isEmpty).toBe(true);
    expect(CharSet.ALL.isEmpty).toBe(false);
  });

  it('rejects characters outside ASCII and reversed ranges', () => {
    expect(() => CharSet.of('é')).toThrow(RangeError);
    expect(() => CharSet.range('a', '\u0080')).toThrow(RangeError);
    expect(() => CharSet.range('z', 'a')).toThrow(RangeError);
    expect(() => CharSet.range('ab', 'z')).toThrow(RangeError);
  });

  it('unites sets', () => {
    const set = CharSet.range('a', 'c').union(CharSet.of('cx'));
    expect(set.ranges()).toEqual([
      [0x61, 0x63],
      [0x78, 0x78],
    ]);
  });

  it('complements within ASCII', () => {
    const notA = CharSet.of('a').complement();
    expect(notA.has('a')).toBe(false);
    expect(notA.has('\u0000')).toBe(true);
    expect(notA.has('\n')).toBe(true);
    expect(notA.has('\u007f')).toBe(true);
    expect(notA.size).toBe(127);
    expect(CharSet.ALL.complement().equals(CharSet.EMPTY)).toBe(true);
    expect(notA.complement().equals(CharSet.of('a'))).toBe(true);
  });

  it('compares by content', () => {
    expect(CharSet.of('abc').equals(CharSet.range('a', 'c'))).toBe(true);
    expect(CharSet.of('abc').equals(CharSet.of('abd'))).toBe(false);
  });

  it('lists maximal ranges in ascending order', () => {
    expect(CharSet.EMPTY.ranges()).toEqual([]);
    expect(CharSet.ALL.ranges()).toEqual([[0x00, 0x7f]]);
    expect(CharSet.of('zba0').ranges()).toEqual([
      [0x30, 0x30],
      [0x61, 0x62],
      [0x7a, 0x7a],
    ]);
  });
});
