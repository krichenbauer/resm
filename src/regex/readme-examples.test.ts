import { describe, expect, it } from 'vitest';
import readme from '../../README.md?raw';
import { parseRegex } from './parser.ts';

/** The regexes of the list items between `<!-- examples:NAME -->` and `<!-- /examples:NAME -->`. */
function examples(name: string): string[] {
  const section = readme.split(`<!-- examples:${name} -->`)[1]?.split(`<!-- /examples:${name} -->`)[0];
  if (section === undefined) throw new Error(`README.md has no "${name}" examples`);
  return [...section.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1] ?? '');
}

describe('README examples', () => {
  it('lists accepted regexes that parse', () => {
    const accepted = examples('accepted');
    expect(accepted.length).toBeGreaterThanOrEqual(8);
    for (const regex of accepted) expect(parseRegex(regex), regex).toMatchObject({ ok: true });
  });

  it('lists rejected regexes that produce a diagnostic', () => {
    const rejected = examples('rejected');
    expect(rejected.length).toBeGreaterThanOrEqual(8);
    for (const regex of rejected) expect(parseRegex(regex), regex).toMatchObject({ ok: false });
  });
});
