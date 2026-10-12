import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings.ts';
import { initialState, loadState, saveState } from './storage.ts';

/** A stand-in for `localStorage`. */
function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const brokenStorage = {
  getItem: (): string | null => {
    throw new Error('storage is disabled');
  },
  setItem: (): void => {
    throw new Error('storage is full');
  },
};

describe('stored state', () => {
  it('is the empty regex with the default settings when nothing is stored', () => {
    expect(loadState(memoryStorage())).toEqual({ regex: '', settings: DEFAULT_SETTINGS });
  });

  it('reads back what was saved', () => {
    const storage = memoryStorage();
    const state = { regex: '(a|b)*', settings: { ...DEFAULT_SETTINGS, showSink: true, theme: 'dark' } } as const;
    saveState(storage, state);
    expect(loadState(storage)).toEqual(state);
    expect([...storage.items.keys()]).toEqual(['resm']);
  });

  it('survives stored data that is not what it expects', () => {
    for (const stored of ['', 'not json', '42', 'null', '{"regex":7}', '{"settings":"dfa"}']) {
      expect(loadState(memoryStorage({ resm: stored }))).toEqual({ regex: '', settings: DEFAULT_SETTINGS });
    }
    expect(loadState(memoryStorage({ resm: '{"regex":"ab","settings":{"theme":"dark","stateLimit":"x"}}' }))).toEqual({
      regex: 'ab',
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
    });
  });

  it('works without storage, as in private browsing', () => {
    expect(loadState(undefined)).toEqual({ regex: '', settings: DEFAULT_SETTINGS });
    expect(loadState(brokenStorage)).toEqual({ regex: '', settings: DEFAULT_SETTINGS });
    expect(() => saveState(brokenStorage, { regex: 'a', settings: DEFAULT_SETTINGS })).not.toThrow();
    expect(() => saveState(undefined, { regex: 'a', settings: DEFAULT_SETTINGS })).not.toThrow();
  });
});

describe('initial state', () => {
  const stored = { regex: 'stored', settings: { ...DEFAULT_SETTINGS, representation: 'nfa', theme: 'dark' } } as const;

  it('is the stored state when the page is opened without a share link', () => {
    expect(initialState(stored, null)).toEqual(stored);
  });

  it('takes the regex and the settings of a share link over the stored ones', () => {
    const shared = { regex: 'shared', settings: { representation: 'min-dfa', showSink: true, stateLimit: 50 } } as const;
    expect(initialState(stored, shared)).toEqual({
      regex: 'shared',
      settings: { representation: 'min-dfa', showSink: true, stateLimit: 50, theme: 'dark' },
    });
  });

  it('keeps the stored value of a setting that the share link does not mention', () => {
    expect(initialState(stored, { regex: '', settings: { showSink: true } })).toEqual({
      regex: '',
      settings: { ...stored.settings, showSink: true },
    });
  });
});
