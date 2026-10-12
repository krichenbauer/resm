import { describe, expect, it } from 'vitest';
import { CharSet } from './charset.ts';
import { ANY_CHAR, DIGIT, SPACE, WORD } from './classes.ts';
import { formatSet } from './test-support.ts';

describe('predefined character classes', () => {
  it('defines \\d as the ASCII digits', () => {
    expect(formatSet(DIGIT)).toBe('[0-9]');
    expect(DIGIT.has('/')).toBe(false);
    expect(DIGIT.has(':')).toBe(false);
  });

  it('defines \\w as ASCII letters, digits, and the underscore', () => {
    expect(formatSet(WORD)).toBe('[0-9A-Z_a-z]');
    for (const neighbor of '/:@[`{') expect(WORD.has(neighbor)).toBe(false);
  });

  it('defines \\s as space, tab, line feed, vertical tab, form feed, and carriage return', () => {
    expect(SPACE.equals(CharSet.of(' \t\n\v\f\r'))).toBe(true);
    expect(formatSet(SPACE)).toBe('[\\x09-\\x0d\\x20]');
    expect(SPACE.has('\u0008')).toBe(false);
    expect(SPACE.has('\u000e')).toBe(false);
    expect(SPACE.has('\u001c')).toBe(false);
    expect(SPACE.has('\u001f')).toBe(false);
  });

  it('defines the dot as every ASCII character except the line feed', () => {
    expect(formatSet(ANY_CHAR)).toBe('[\\x00-\\x09\\x0b-\\x7f]');
    expect(ANY_CHAR.has('\n')).toBe(false);
    expect(ANY_CHAR.has('\r')).toBe(true);
    expect(ANY_CHAR.size).toBe(127);
  });
});
