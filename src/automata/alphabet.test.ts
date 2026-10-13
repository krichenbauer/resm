import { describe, expect, it } from 'vitest';
import { CharSet } from '../regex/charset.ts';
import { formatSet } from '../regex/test-support.ts';
import { partitionAlphabet } from './alphabet.ts';

const blocks = (...sets: CharSet[]) => partitionAlphabet(sets).map(formatSet);

describe('alphabet partition', () => {
  it('is the whole alphabet when there is nothing to tell apart', () => {
    expect(blocks()).toEqual(['[\\x00-\\x7f]']);
    expect(blocks(CharSet.ALL)).toEqual(['[\\x00-\\x7f]']);
    expect(blocks(CharSet.EMPTY)).toEqual(['[\\x00-\\x7f]']);
  });

  it('separates the members of a set from all other characters', () => {
    expect(blocks(CharSet.range('a', 'c'))).toEqual(['[\\x00-`d-\\x7f]', '[a-c]']);
  });

  it('splits overlapping sets into their common and their own parts', () => {
    expect(blocks(CharSet.range('a', 'c'), CharSet.range('b', 'd'))).toEqual([
      '[\\x00-`e-\\x7f]',
      "'a'",
      '[b-c]',
      "'d'",
    ]);
  });

  it('keeps characters together that no set tells apart', () => {
    expect(blocks(CharSet.of('ax'), CharSet.of('ax'), CharSet.of('b'))).toEqual(['[\\x00-`c-wy-\\x7f]', '[ax]', "'b'"]);
  });

  it('covers only the given alphabet when that is smaller than ASCII', () => {
    const alphabet = CharSet.of('abcx');
    expect(partitionAlphabet([CharSet.range('a', 'b'), CharSet.of('bq')], alphabet).map(formatSet)).toEqual([
      "'a'",
      "'b'",
      '[cx]',
    ]);
    expect(partitionAlphabet([], alphabet).map(formatSet)).toEqual(['[a-cx]']);
    expect(partitionAlphabet([CharSet.of('a')], CharSet.EMPTY)).toEqual([]);
  });

  it('yields disjoint blocks that cover the alphabet, ordered by their first character', () => {
    const sets = [CharSet.range('0', '9'), CharSet.range('5', 'z'), CharSet.of('_a'), CharSet.of('\n').complement()];
    const partition = partitionAlphabet(sets);
    expect(partition.reduce((union, block) => union.union(block), CharSet.EMPTY).equals(CharSet.ALL)).toBe(true);
    expect(partition.reduce((total, block) => total + block.size, 0)).toBe(128);
    for (const block of partition) {
      for (const set of sets) expect(set.contains(block) || !set.intersects(block)).toBe(true);
    }
    const firsts = partition.map((block) => block.ranges()[0]?.[0]);
    expect(firsts).toEqual([...firsts].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });
});
