import type { CharsNode, RegexNode } from './ast.ts';
import { CharSet } from './charset.ts';

/** Calls `visit` for every node of a regex that matches characters. */
function forEachCharsNode(node: RegexNode, visit: (node: CharsNode) => void): void {
  switch (node.type) {
    case 'empty':
      return;
    case 'chars':
      visit(node);
      return;
    case 'concat':
      for (const part of node.parts) forEachCharsNode(part, visit);
      return;
    case 'alternation':
      for (const option of node.options) forEachCharsNode(option, visit);
      return;
    case 'repeat':
      forEachCharsNode(node.body, visit);
  }
}

/**
 * The alphabet of a regex: all characters that are written in it, directly
 * or as members of a set or class. A negation contributes what it excludes,
 * and the dot contributes nothing, because neither names anything else.
 */
export function deriveAlphabet(ast: RegexNode): CharSet {
  let alphabet = CharSet.EMPTY;
  forEachCharsNode(ast, ({ named }) => {
    alphabet = alphabet.union(named);
  });
  return alphabet;
}

/**
 * The same regex over a smaller alphabet: every set keeps only its members of
 * the alphabet, so the dot and negations range over the alphabet instead of
 * all of ASCII. The result matches exactly those strings over the alphabet
 * that the original regex matches.
 */
export function restrictToAlphabet(node: RegexNode, alphabet: CharSet): RegexNode {
  switch (node.type) {
    case 'empty':
      return node;
    case 'chars':
      return { ...node, set: node.set.intersection(alphabet) };
    case 'concat':
      return { ...node, parts: node.parts.map((part) => restrictToAlphabet(part, alphabet)) };
    case 'alternation':
      return { ...node, options: node.options.map((option) => restrictToAlphabet(option, alphabet)) };
    case 'repeat':
      return { ...node, body: restrictToAlphabet(node.body, alphabet) };
  }
}

/**
 * The parts of a regex that match characters in general but none of the given
 * alphabet, in source order: a dot or a negation for which nothing is left.
 */
export function findUnmatchable(ast: RegexNode, alphabet: CharSet): CharsNode[] {
  const unmatchable: CharsNode[] = [];
  forEachCharsNode(ast, (node) => {
    if (!node.set.isEmpty && !node.set.intersects(alphabet)) unmatchable.push(node);
  });
  return unmatchable;
}
