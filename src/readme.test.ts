import { describe, expect, it } from 'vitest';
import development from '../docs/development.md?raw';
import readme from '../README.md?raw';
import octiconsLicense from '../build/notices/octicons-LICENSE.txt?raw';
import dagreLicense from '../node_modules/@dagrejs/dagre/LICENSE?raw';
import litLicense from '../node_modules/lit/LICENSE?raw';

const headings = (text: string) => [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

describe('README', () => {
  it('is about using RESM, with the regex syntax early and the licenses on the page', () => {
    expect(headings(readme)).toEqual([
      'Quick start',
      'Regex syntax',
      'The alphabet',
      'Reading the diagram',
      'Settings',
      'Export',
      'Sharing and remembering',
      'Accessibility and browser support',
      'Licenses',
      'Development',
    ]);
  });

  it('prints the license of everything that RESM contains, word for word', () => {
    for (const license of [litLicense, dagreLicense, octiconsLicense]) {
      expect(readme).toContain(license.trim());
    }
    expect(readme).toContain('GNU General Public License');
  });

  it('leaves everything about developing RESM to a linked document', () => {
    expect(readme).toContain('(docs/development.md)');
    for (const topic of ['pnpm', 'Playwright', 'nix develop', 'GitHub Actions']) {
      expect(readme, topic).not.toContain(topic);
      expect(development, topic).toContain(topic);
    }
  });

  it('links only to sections that exist', () => {
    const anchors = new Set(
      [...readme.matchAll(/^#{1,6} (.+)$/gm)].map((match) =>
        (match[1] ?? '')
          .toLowerCase()
          .replace(/[^a-z0-9 -]/g, '')
          .replaceAll(' ', '-'),
      ),
    );
    const links = [...readme.matchAll(/\]\(#([^)]+)\)/g)].map((match) => match[1] ?? '');
    expect(links.length).toBeGreaterThan(5);
    expect(links.filter((link) => !anchors.has(link))).toEqual([]);
  });
});
