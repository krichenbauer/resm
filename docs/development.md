# Developing RESM

This document is for people who work on RESM itself. How to use RESM is described in the [README](../README.md); the agreed scope and the rules for changes are in [AGENTS.md](../AGENTS.md).

## Setup

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

### Source layout

| Directory        | Contents |
| ---------------- | -------- |
| `src/regex/`     | Character sets, the syntax tree, and the parser. |
| `src/automata/`  | Thompson's construction, ε-elimination, subset construction, minimization. |
| `src/diagram/`   | State names, edge labels, size limits, and the description in words. |
| `src/layout/`    | Positions of states, shapes of edges, and the view of the canvas. |
| `src/motion/`    | The spring simulation and the smooth changes of view and edge shapes. |
| `src/export/`    | SVG and PNG export. |
| `src/settings/`  | Settings, share links, and local storage. |
| `src/worker/`    | The web worker that computes diagrams, and its client. |
| `src/ui/`        | The two Lit components: the application and the diagram. |
| `e2e/`           | Browser tests. |
| `build/`         | The build plugin that collects third-party license notices. |

Everything outside `src/ui/`, `src/worker/`, and `src/export/download.ts` is independent of the browser and tested with Vitest alone.

### Tests

Unit tests live next to the code they cover as `src/**/*.test.ts`. They include the language tests, which compare all four automata of many regexes against JavaScript's own regex engine as an independent reference, over ASCII and over the alphabet of each regex, and the tests of the examples in this file.

Browser tests live in `e2e/` and run in Chromium, Firefox, and WebKit. The tests of touch gestures run in Chromium only, because only its test interface can simulate several fingers. To run one browser, use `pnpm test:e2e --project=firefox`.

The browser tests build the site and serve it from the subpath `/resm/`, the same way GitHub Pages does, so a broken base path fails locally. They also fail if the page requests anything from another host.

WebKit needs a graphics driver even when it runs without a window, and the WebKit build from Nix finds none on Linux distributions other than NixOS, such as the machines of GitHub Actions. The flake therefore points it to Mesa's software renderer there.

On Linux, every browser launch prints "Skipping host requirements validation logic because `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS` env variable is set." The flake sets that variable on purpose, because the browsers from Nix bring their own libraries; the message is not an error.

Playwright needs browser binaries that match its version:

- **NixOS (x86_64):** the flake provides patched browsers. `@playwright/test` in `package.json` is pinned to the Playwright version in the locked nixpkgs revision, currently 1.63.0. Change both together: after `nix flake update`, check the new version with `nix eval --raw --inputs-from . nixpkgs#playwright-driver.version` and pin `@playwright/test` to it.
- **macOS:** install the browsers once with `pnpm exec playwright install chromium firefox webkit`.

### Documentation and licenses

The README is the documentation for people who use RESM: it comes first with what they need, and has nothing about developing. `src/readme.test.ts` checks that structure, the links between its sections, and that it prints the license of everything that RESM contains word for word. The regex examples in the README are parsed by `src/regex/readme-examples.test.ts`.

The build collects the license notices of all bundled packages in `third-party-licenses.md`, including those that end up in the web worker. Something that is copied into the source instead of installed, like the outline of the GitHub mark, needs its notice in `build/notices/` and an entry in `vite.config.ts`. Either way, a new dependency also needs a row and its license text in the README.

## Deployment

The GitHub Actions workflow in `.github/workflows/ci.yml` runs linting, type checking, unit tests, the production build, and the browser tests on every push and pull request. On pushes to `main`, it deploys `dist/` to GitHub Pages, and only after all checks have passed.

For the deployment to work, the repository's Pages settings must use **GitHub Actions** as the source.

The build reads the site's base path from the `RESM_BASE_PATH` environment variable, which defaults to `/`. The workflow sets it to `/<repository name>/`. To build for another location:

```sh
RESM_BASE_PATH=/some/path/ pnpm build
```
