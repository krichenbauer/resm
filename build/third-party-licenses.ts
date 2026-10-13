import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

/** The license notice of something that the site contains. */
export interface Notice {
  /** What the notice is for, such as `lit - 3.3.3`. */
  readonly title: string;
  readonly license: string;
  readonly text: string;
}

/** The package that a bundled module belongs to, or `undefined` for the application's own modules. */
function findPackageDir(moduleId: string): string | undefined {
  const file = moduleId.split('?')[0] ?? '';
  if (moduleId.startsWith('\0') || !file.includes('/node_modules/')) return undefined;
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (!existsSync(manifest)) continue;
    // Packages may contain nested manifests without a name, for example to mark a module format.
    const { name, version } = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, unknown>;
    if (typeof name === 'string' && typeof version === 'string') return dir;
  }
  return undefined;
}

function readNotice(packageDir: string): Notice {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as Record<string, unknown>;
  const licenseFile = readdirSync(packageDir).find((file) => /^(license|licence|copying)/i.test(file));
  if (typeof manifest.license !== 'string' || !licenseFile) {
    throw new Error(`Cannot find the license of the bundled package in ${packageDir}.`);
  }
  return {
    title: `${String(manifest.name)} - ${String(manifest.version)}`,
    license: manifest.license,
    text: readFileSync(join(packageDir, licenseFile), 'utf8').trim(),
  };
}

/**
 * Writes the license notices of all bundled dependencies to one file, because
 * minification strips them from the code. Vite's own `build.license` option
 * does the same but leaves out what is bundled into web workers, so the worker
 * build reports its modules through `collect` and the main build emits the file.
 * `copied` lists what the site contains without it being an installed package.
 */
export function thirdPartyLicenses(
  fileName: string,
  copied: readonly Notice[] = [],
): { collect: Plugin; emit: Plugin } {
  const packageDirs = new Set<string>();
  const collectFrom = (bundle: Record<string, { type: string; moduleIds?: string[] }>) => {
    for (const chunk of Object.values(bundle)) {
      for (const moduleId of chunk.moduleIds ?? []) {
        const packageDir = findPackageDir(moduleId);
        if (packageDir) packageDirs.add(packageDir);
      }
    }
  };

  return {
    collect: {
      name: 'resm:collect-third-party-licenses',
      generateBundle(_, bundle) {
        collectFrom(bundle);
      },
    },
    emit: {
      name: 'resm:emit-third-party-licenses',
      apply: 'build',
      generateBundle(_, bundle) {
        collectFrom(bundle);
        const notices = [...[...packageDirs].map(readNotice), ...copied].sort((a, b) =>
          a.title.localeCompare(b.title),
        );
        const sections = notices.map(({ title, license, text }) => `## ${title} (${license})\n\n${text}\n`);
        this.emitFile({
          type: 'asset',
          fileName,
          source: `# Third-party licenses\n\nRESM bundles the following dependencies.\n\n${sections.join('\n')}`,
        });
      },
    },
  };
}
