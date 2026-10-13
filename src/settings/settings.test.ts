import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MAX_STATE_LIMIT, MIN_STATE_LIMIT, clampStateLimit, sanitizeSettings } from './settings.ts';

describe('settings', () => {
  it('start with the DFA, the alphabet of the regex, a hidden sink, 200 states, and the system theme', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      representation: 'dfa',
      alphabet: 'derived',
      showSink: false,
      stateLimit: 200,
      theme: 'system',
    });
  });

  it('keep valid values', () => {
    const settings = { representation: 'min-dfa', alphabet: 'ascii', showSink: true, stateLimit: 50, theme: 'dark' };
    expect(sanitizeSettings(settings)).toEqual(settings);
  });

  it('fall back to the default for every missing or invalid value on its own', () => {
    expect(sanitizeSettings({ representation: 'pda', showSink: true })).toEqual({ ...DEFAULT_SETTINGS, showSink: true });
    expect(sanitizeSettings({ showSink: 'yes', theme: 'dark' })).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
    expect(sanitizeSettings({ stateLimit: '50', theme: 'blue', alphabet: 'unicode' })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ alphabet: 'ascii' })).toEqual({ ...DEFAULT_SETTINGS, alphabet: 'ascii' });
    for (const junk of [null, undefined, 'dfa', 7, []]) expect(sanitizeSettings(junk)).toEqual(DEFAULT_SETTINGS);
  });

  it('ignore unknown values', () => {
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, extra: 1 })).toEqual(DEFAULT_SETTINGS);
  });

  it('keep the state limit a whole number within its range', () => {
    expect(clampStateLimit(MIN_STATE_LIMIT - 5)).toBe(MIN_STATE_LIMIT);
    expect(clampStateLimit(MAX_STATE_LIMIT + 5)).toBe(MAX_STATE_LIMIT);
    expect(clampStateLimit(12.7)).toBe(12);
    expect(clampStateLimit(Number.NaN)).toBe(DEFAULT_SETTINGS.stateLimit);
    expect(sanitizeSettings({ stateLimit: 100_000 }).stateLimit).toBe(MAX_STATE_LIMIT);
    expect(sanitizeSettings({ stateLimit: 0 }).stateLimit).toBe(MIN_STATE_LIMIT);
  });
});
