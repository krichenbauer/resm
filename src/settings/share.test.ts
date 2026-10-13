import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings.ts';
import { decodeShare, encodeShare } from './share.ts';

describe('share links', () => {
  it('carry the regex and the settings that determine the diagram', () => {
    const fragment = encodeShare({ regex: 'a|b', settings: { ...DEFAULT_SETTINGS, representation: 'min-dfa' } });
    expect(fragment).toBe('regex=a%7Cb&automaton=min-dfa&alphabet=derived&sink=0&limit=200');
  });

  it('leave out the theme, which is a matter of the viewer', () => {
    const fragment = encodeShare({ regex: 'a', settings: { ...DEFAULT_SETTINGS, theme: 'dark' } });
    expect(fragment).not.toContain('dark');
    expect(decodeShare(fragment)?.settings).not.toHaveProperty('theme');
  });

  it('read back what was written, whatever the regex contains', () => {
    const regexes = ['', 'a|b', '(a|b)*abb', '#&=?%+ /\\', '[^"]*', 'a+b c', '\\d{2,4}', '100%', '^$'];
    for (const regex of regexes) {
      const settings = {
        ...DEFAULT_SETTINGS,
        representation: 'enfa',
        alphabet: 'ascii',
        showSink: true,
        stateLimit: 77,
      } as const;
      expect(decodeShare(encodeShare({ regex, settings }))).toEqual({
        regex,
        settings: { representation: 'enfa', alphabet: 'ascii', showSink: true, stateLimit: 77 },
      });
    }
  });

  it('accept a fragment with or without its leading hash sign', () => {
    expect(decodeShare('#regex=ab')).toEqual({ regex: 'ab', settings: {} });
    expect(decodeShare('regex=ab')).toEqual({ regex: 'ab', settings: {} });
  });

  it('are recognized by their regex, even an empty one', () => {
    expect(decodeShare('#regex=')).toEqual({ regex: '', settings: {} });
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#')).toBeNull();
    expect(decodeShare('#section')).toBeNull();
    expect(decodeShare('#automaton=nfa')).toBeNull();
  });

  it('ignore settings that are missing or invalid, one by one', () => {
    expect(decodeShare('#regex=a&automaton=pda&sink=1&limit=many')).toEqual({ regex: 'a', settings: { showSink: true } });
    expect(decodeShare('#regex=a&alphabet=ascii')?.settings).toEqual({ alphabet: 'ascii' });
    expect(decodeShare('#regex=a&alphabet=latin')?.settings).toEqual({});
    expect(decodeShare('#regex=a&sink=maybe&limit=30')).toEqual({ regex: 'a', settings: { stateLimit: 30 } });
    expect(decodeShare('#regex=a&limit=999999')?.settings).toEqual({ stateLimit: 500 });
    expect(decodeShare('#regex=a&limit=-3')?.settings).toEqual({ stateLimit: 1 });
    expect(decodeShare('#regex=a&limit=')?.settings).toEqual({});
  });
});
