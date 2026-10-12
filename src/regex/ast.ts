import type { CharSet } from './charset.ts';

/** A span of the regex source in UTF-16 code units; `end` is exclusive. */
export interface SourceRange {
  readonly start: number;
  readonly end: number;
}

/** Matches the empty string. */
export interface EmptyNode {
  readonly type: 'empty';
  readonly range: SourceRange;
}

/** Matches exactly one character from `set`. An empty set matches nothing. */
export interface CharsNode {
  readonly type: 'chars';
  readonly set: CharSet;
  readonly range: SourceRange;
}

/** Matches its parts one after another. Has at least two parts. */
export interface ConcatNode {
  readonly type: 'concat';
  readonly parts: readonly RegexNode[];
  readonly range: SourceRange;
}

/** Matches any one of its options. Has at least two options. */
export interface AlternationNode {
  readonly type: 'alternation';
  readonly options: readonly RegexNode[];
  readonly range: SourceRange;
}

/** Matches `body` at least `min` and at most `max` times; `max` is `null` when unbounded. */
export interface RepeatNode {
  readonly type: 'repeat';
  readonly body: RegexNode;
  readonly min: number;
  readonly max: number | null;
  readonly range: SourceRange;
}

/**
 * Syntax tree of a regular expression. Groups and the full-match anchors `^`
 * and `$` do not appear in the tree because they do not change the language.
 */
export type RegexNode = EmptyNode | CharsNode | ConcatNode | AlternationNode | RepeatNode;
