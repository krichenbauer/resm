# RESM — Regex State Machine

RESM is a small, browser-only tool that turns a regular expression into an interactive diagram of a finite automaton. It is meant to stay simple enough for classroom use.

Everything runs locally in your browser. There is no backend, no account, no analytics, and no request to any third-party host.

## Status

RESM is at the start of its development. **It does not draw automata yet.**

What exists today:

- The application shell: a single-line regex field, a selector for the automaton representation (ε-NFA, NFA, DFA, minimized DFA; DFA is preselected), and an empty diagram area.
- Light and dark appearance that follows the operating system setting.

Not implemented yet: regex parsing, automaton construction, diagram rendering, layout and interaction, export, sharing, and settings. The field and the selector have no effect so far. This section and the ones below are updated as features land.

## Regex syntax

No regex syntax is supported yet, because the parser has not been written. The supported syntax, its exact semantics, its limitations, and tested examples will be documented here together with the parser.

## Development

The repository's Nix flake provides Node.js 24 and pnpm on NixOS and macOS.

```sh
nix develop
pnpm install
pnpm dev
```

`pnpm dev` starts a local development server and prints its address.

| Command          | Purpose                                                         |
| ---------------- | --------------------------------------------------------------- |
| `pnpm dev`       | Start the development server with live reload.                  |
| `pnpm build`     | Create the production build in `dist/`.                         |
| `pnpm preview`   | Serve the production build locally.                             |
| `pnpm lint`      | Lint all sources with ESLint.                                   |
| `pnpm typecheck` | Type-check the application, the configuration, and the tests.   |
| `pnpm test`      | Run the unit tests once with Vitest.                            |
| `pnpm test:watch`| Run the unit tests in watch mode.                               |
| `pnpm test:e2e`  | Build the site and run the browser tests with Playwright.       |
| `pnpm check`     | Run all of the checks above in the order used by CI.            |

### Tests

Unit tests live next to the code they cover as `src/**/*.test.ts`. Browser tests live in `e2e/` and currently run in Chromium.

The browser tests build the site and serve it from the subpath `/resm/`, the same way GitHub Pages does, so a broken base path fails locally. They also fail if the page requests anything from another host.

Playwright needs browser binaries that match its version:

- **NixOS (x86_64):** the flake provides patched browsers. `@playwright/test` in `package.json` is pinned to the Playwright version in the locked nixpkgs revision, currently 1.63.0. Change both together: after `nix flake update`, check the new version with `nix eval --raw --inputs-from . nixpkgs#playwright-driver.version` and pin `@playwright/test` to it.
- **macOS:** install the browser once with `pnpm exec playwright install chromium`.

## Deployment

The GitHub Actions workflow in `.github/workflows/ci.yml` runs linting, type checking, unit tests, the production build, and the browser tests on every push and pull request. On pushes to `main`, it deploys `dist/` to GitHub Pages, and only after all checks have passed.

For the deployment to work, the repository's Pages settings must use **GitHub Actions** as the source.

The build reads the site's base path from the `RESM_BASE_PATH` environment variable, which defaults to `/`. The workflow sets it to `/<repository name>/`. To build for another location:

```sh
RESM_BASE_PATH=/some/path/ pnpm build
```

## License

RESM is free software, licensed under the GNU General Public License, version 3 or (at your option) any later version. See [LICENSE](LICENSE).
