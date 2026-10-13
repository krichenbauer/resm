import { CharSet } from '../regex/charset.ts';

/**
 * Splits the alphabet into the largest blocks whose characters no given set
 * tells apart: every set either contains a block entirely or not at all. The
 * blocks are disjoint, cover the whole alphabet, and are ordered by their
 * first character. Algorithms can then treat a whole block like one input
 * symbol.
 */
export function partitionAlphabet(sets: Iterable<CharSet>, alphabet: CharSet = CharSet.ALL): CharSet[] {
  let blocks = alphabet.isEmpty ? [] : [alphabet];
  for (const set of sets) {
    blocks = blocks.flatMap((block) =>
      [block.intersection(set), block.minus(set)].filter((part) => !part.isEmpty),
    );
  }
  const first = (block: CharSet) => block.ranges()[0]?.[0] ?? 0;
  return blocks.sort((a, b) => first(a) - first(b));
}
