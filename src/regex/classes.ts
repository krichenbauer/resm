import { CharSet } from './charset.ts';

/** `\d`: the ASCII digits. */
export const DIGIT = CharSet.range('0', '9');

/** `\w`: ASCII letters, digits, and the underscore. */
export const WORD = DIGIT.union(CharSet.range('A', 'Z')).union(CharSet.range('a', 'z')).union(CharSet.of('_'));

/** `\s`: space, tab, line feed, vertical tab, form feed, and carriage return. */
export const SPACE = CharSet.of(' \t\n\v\f\r');

/** `.`: every ASCII character except the line feed. */
export const ANY_CHAR = CharSet.of('\n').complement();
