import { defineConfig } from 'vitest/config';
import { thirdPartyLicenses } from './build/third-party-licenses.ts';

// GitHub Pages serves the site from a repository subpath, e.g. `/resm/`.
// Local development and previews default to the host root.
const base = process.env.RESM_BASE_PATH ?? '/';

const licenses = thirdPartyLicenses('third-party-licenses.md');

export default defineConfig({
  base,
  plugins: [licenses.emit],
  worker: {
    format: 'es',
    plugins: () => [licenses.collect],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
