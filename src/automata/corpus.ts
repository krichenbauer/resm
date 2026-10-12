/**
 * Test corpus for language equivalence. Every regex here means the same in
 * RESM and in JavaScript, so JavaScript's own engine can act as an independent
 * oracle: each automaton must accept exactly the strings that the oracle
 * matches in full, for all strings over `alphabet` up to a fixed length.
 */
export const ORACLE_CORPUS: readonly { readonly regex: string; readonly alphabet: string }[] = [
  { regex: '', alphabet: 'ab' },
  { regex: 'a', alphabet: 'ab' },
  { regex: 'ab', alphabet: 'ab' },
  { regex: 'a|b', alphabet: 'abc' },
  { regex: 'a|', alphabet: 'ab' },
  { regex: '()', alphabet: 'ab' },
  { regex: '(|a)b', alphabet: 'ab' },
  { regex: 'a*', alphabet: 'ab' },
  { regex: 'a+', alphabet: 'ab' },
  { regex: 'a?', alphabet: 'ab' },
  { regex: 'a*?b', alphabet: 'ab' },
  { regex: 'a+?a', alphabet: 'ab' },
  { regex: 'a??b', alphabet: 'ab' },
  { regex: 'a{0}', alphabet: 'ab' },
  { regex: 'a{3}', alphabet: 'ab' },
  { regex: 'a{2,}', alphabet: 'ab' },
  { regex: 'a{2,4}', alphabet: 'ab' },
  { regex: 'a{0,2}b', alphabet: 'ab' },
  { regex: '(ab){2,}', alphabet: 'ab' },
  { regex: '(a{2}){1,2}', alphabet: 'ab' },
  { regex: '(a?){3}a{3}', alphabet: 'ab' },
  { regex: '(a|b)*abb', alphabet: 'ab' },
  { regex: '(a|b)*a(a|b)(a|b)', alphabet: 'ab' },
  { regex: '(ab|a)(bc|c)?', alphabet: 'abc' },
  { regex: '(a|b){2}c*', alphabet: 'abc' },
  { regex: 'x(yz*|y*z)+', alphabet: 'xyz' },
  { regex: '(a*)*', alphabet: 'ab' },
  { regex: '(a*b*)*', alphabet: 'abc' },
  { regex: '(a|)+', alphabet: 'ab' },
  { regex: '(a*|b)*c', alphabet: 'abc' },
  { regex: '(0|1(01*0)*1)*', alphabet: '01' },
  { regex: '[ab]+c', alphabet: 'abc' },
  { regex: '[^a]b', alphabet: 'ab\n' },
  { regex: '[a-c]*\\w', alphabet: 'ac_-' },
  { regex: '[\\d_]{1,2}', alphabet: '09_a' },
  { regex: '-?\\d+(\\.\\d+)?', alphabet: '-.07' },
  { regex: '\\s*a\\s*', alphabet: 'a \t\n' },
  { regex: '\\W\\D\\S', alphabet: 'a1 _-' },
  { regex: '.a.', alphabet: 'a.b' },
  { regex: 'a\\.b|\\*+', alphabet: 'a.b*' },
  { regex: '[^\\s\\S]', alphabet: 'ab' },
  { regex: 'a[^\\d\\D]|b', alphabet: 'ab' },
  { regex: '^(a|b)c$', alphabet: 'abc' },
];

/**
 * Regexes whose meaning is specific to RESM or needs strings the oracle corpus
 * does not cover, with hand-derived members and non-members of the language.
 */
export const HAND_CORPUS: readonly {
  readonly regex: string;
  readonly accepted: readonly string[];
  readonly rejected: readonly string[];
}[] = [
  { regex: '', accepted: [''], rejected: ['a', ' '] },
  { regex: '^$', accepted: [''], rejected: ['^', '$', '^$'] },
  { regex: '.', accepted: ['a', '.', '\r', '\u0000', '\u007f', ' '], rejected: ['', '\n', 'ab', 'é', '\u0080'] },
  { regex: '[^a]', accepted: ['\n', 'b', '\u0000', '\u007f'], rejected: ['', 'a', 'é', '\u0080'] },
  { regex: '\\D', accepted: ['a', '\n', '/', ':'], rejected: ['0', '9', '', '٣'] },
  { regex: '\\W', accepted: ['-', '@', '[', '`', '{'], rejected: ['a', 'Z', '0', '_', 'ä'] },
  { regex: '\\s', accepted: [' ', '\t', '\n', '\u000b', '\f', '\r'], rejected: ['\u001c', ' ', ' ', ''] },
  { regex: '[]a]', accepted: [']', 'a'], rejected: ['', '[', ']a'] },
  { regex: '[^]a]', accepted: ['[', 'b', '^'], rejected: [']', 'a', ''] },
  { regex: '[a-]', accepted: ['a', '-'], rejected: ['b', ''] },
  { regex: 'a]}', accepted: ['a]}'], rejected: ['a', 'a]'] },
  { regex: '\\^\\$', accepted: ['^$'], rejected: ['', '^'] },
  { regex: '[^\\s\\S]*', accepted: [''], rejected: ['a', '\n'] },
  { regex: 'a{10}', accepted: ['aaaaaaaaaa'], rejected: ['aaaaaaaaa', 'aaaaaaaaaaa'] },
  { regex: '(a|b)*abb', accepted: ['abb', 'aabb', 'babb', 'abababb'], rejected: ['', 'ab', 'abba', 'abbc'] },
];
