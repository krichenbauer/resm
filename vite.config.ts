import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from a repository subpath, e.g. `/resm/`.
// Local development and previews default to the host root.
const base = process.env.RESM_BASE_PATH ?? '/';

export default defineConfig({
  base,
  test: {
    include: ['src/**/*.test.ts'],
  },
});
