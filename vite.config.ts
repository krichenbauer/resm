import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from a repository subpath, e.g. `/resm/`.
// Local development and previews default to the host root.
const base = process.env.RESM_BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: {
    // Minification strips license comments, so ship the notices of bundled
    // dependencies as a separate file.
    license: { fileName: 'third-party-licenses.md' },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
