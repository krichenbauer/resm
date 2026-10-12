# RESM — Agent Instructions

RESM (Regex State Machine) is a minimal, browser-only tool that turns a regular expression into an interactive *diagram* of a finite automaton. This document defines the agreed MVP and the implementation priorities. Keep the product small and understandable, especially for classroom use.

## Non-negotiable rules

- **Language:** All source code, identifiers, comments, tests, UI text, error messages, and project documentation must be in **English**.
- **Development approach:** Work test-first. Make small, reviewable changes; write a failing test for a behavioral requirement before implementing it. Fix regressions rather than weakening or deleting tests.
- **Runtime/privacy:** Everything runs locally in the browser after the site loads. No backend, external API calls, CDNs, third-party assets, analytics, telemetry, or remotely loaded fonts. Bundle dependencies and serve all application assets from the same GitHub Pages host.
- **Dependencies:** Prefer established, maintained libraries over custom implementations when they genuinely reduce complexity. Vet license compatibility with **GPL-3.0-or-later**; keep required notices. Do not add dependencies gratuitously.
- **Platform:** Initial hosting is GitHub Pages. Local development must work on **NixOS and macOS** using the repository's Nix flake. Do not introduce OS-specific assumptions.
- **Documentation:** Keep `README.md` accurate with every relevant change. It must explain the supported regex syntax, limitations, all features and settings, development and test workflows, and deployment. Include tested examples of the documented regex syntax.
- **Scope:** Implement only agreed MVP behavior. Record future ideas separately; do not silently turn them into features.

## Agreed technology

- TypeScript, Lit, and Vite; pnpm as the package manager.
- SVG for the automaton diagram, interactions, and vector export.
- A Web Worker for parsing and automaton construction, so expensive calculations do not block the UI. Ignore superseded worker results.
- Vitest for unit and algorithm tests; Playwright for browser and end-to-end tests.
- GitHub Actions to run type checking, tests, and the production build on pushes and pull requests. Deploy to GitHub Pages from `main` **only after checks pass**.
- Use `nix develop` as the standard local development entry point. Commit `flake.lock` and `pnpm-lock.yaml`. The flake supplies Node.js 24 and pnpm; review its Playwright-specific configuration when choosing Playwright versions.

## MVP: regex language and semantics

- Support a **PCRE-style common subset**, familiar from Python and Java, but do **not** claim full compatibility with either implementation.
- Include concatenation, alternation (`|`), grouping (`(...)`), `*`, `+`, `?`, bounded repetition (`{n}`, `{n,}`, `{n,m}`), literal escapes, `.`, character sets (`[abc]`), ranges (`[a-z]`), negated sets (`[^abc]`), and common predefined classes (`\d`, `\w`, `\s`).
- **ASCII only**: character semantics are restricted to U+0000–U+007F, including predefined classes and negation. Reject unsupported non-ASCII regex input with a clear English diagnostic. Document exact character-class and dot semantics, and test boundary cases.
- Interpret the regex as a **full match** of the input string, not a substring search.
- Allow `^` only at the beginning and `$` only at the end, as redundant full-match anchors. Elsewhere they are syntax errors unless escaped as literals.
- Accept the negated predefined classes `\D`, `\W`, and `\S` as the ASCII complements of `\d`, `\w`, and `\s`, both standalone and inside character sets.
- Accept the lazy quantifiers `*?`, `+?`, `??`, and `{n,m}?`, and treat them as their greedy forms: laziness does not change the recognized language.
- `.` matches every ASCII character except the line feed (U+000A), as in Python without flags.
- Reject non-capturing groups (`(?:...)`) and control or hex escapes (`\n`, `\t`, `\xHH`, etc.) with an "unsupported" diagnostic.
- **No flags** (`i`, `s`, etc.). Do not support non-regular extensions such as backreferences or lookarounds. Diagnose unsupported constructs rather than silently misinterpreting them.
- An empty regex is **valid**: its diagram is one state, `q0`, which is both initial and accepting. This is also the initial diagram on first launch; do not prefill a sample expression.
- Do not introduce `ε` or `∅` as special input syntax. `ε` is allowed as a *diagram label* for epsilon transitions.
- Syntax errors should identify their location in the single-line input and explain the problem. While the user types an incomplete/invalid expression, retain the last valid diagram.

## MVP: automata

- Offer four selectable representations: **ε-NFA, epsilon-free NFA, DFA, and minimized DFA**. **DFA is the default.**
- Ensure the automata recognize the exact language of the input expression. Keep transformations separately testable (e.g., epsilon removal, determinization, minimization).
- By default, **omit the DFA sink/trap state** and its transitions; missing transitions mean rejection. Provide an option to show the sink and complete the DFA.
- Build the ε-NFA with the **textbook Thompson construction**: each operator adds its own states and ε-transitions, so diagrams match what students build by hand. Expand bounded repetition into copies.
- Use state names **`q0`, `q1`, `q2`, ...** only. Names are **canonical**: number every diagram `q0..qN` in breadth-first order from the initial state, so `q0` is always initial, there are no gaps, and the same regex and settings always give the same names.
- Preserve node identities through live edits where reasonably possible, without compromising correctness. Identity matching is separate from naming: a matched node keeps its position, but its label may change.
- Draw an initial-state arrow **from a dot** into the initial state. Draw accepting states with a **double outline**.
- Combine transitions to the same target into one edge where possible. Label each edge with an exact, readable representation of its character set (ranges and common class shorthands when semantically correct).
- Start with a default **limit of 200 rendered states**, adjustable in settings. On exceeding the limit, show an error and keep the last valid diagram. Bound computational work as well; never let state explosion freeze the tab.
- The explicit display and exact derivation policy for the input alphabet `Σ` are **not part of the MVP**. Do not lock in a particular future alphabet-display model just to implement current automata.

## MVP: interface and interaction

- Minimal interface: **single-line regex field**, representation selector, and export controls at the top; SVG graph fills the remaining space. Keep settings in a small menu, not a permanent sidebar.
- Generate the diagram **live** whenever the input is syntactically valid. On invalid or incomplete input, show an unobtrusive inline error and leave the last valid result visible.
- Graph arrangement should prefer **left to right**, with short connections and few crossings. The graph is a **pan-and-zoom infinite canvas**, not a fixed-sized drawing.
- **"Wobbly" means two things together:** (1) a graph-layout algorithm provides sensible target positions; and (2) a continuously animated, spring/force-based response lets the connected graph settle into those positions. Do not implement this as mere crossfading or teleporting between fixed diagrams.
- During valid live edits, preserve recognizably existing nodes when possible. New geometry enters smoothly; connected nodes respond and settle. Edges follow moving nodes. Aim for smooth ~60 FPS where practicable, without a hard guarantee for pathological graphs.
- States can be dragged with mouse or touch. On release they are **not pinned**: they move naturally under the layout/forces toward equilibrium.
- After graph changes, automatically adjust pan/zoom **when needed to keep the entire graph visible**, with smooth viewport motion. Do this even after a user has manually panned or zoomed. Avoid gratuitous zoom-in when the graph shrinks.
- Changing representation does **not** require a transition animation.
- Support desktop and mobile browsers: current Chrome, Firefox, Safari, Edge, plus iOS Safari and Android Chrome. Include touch pan, pinch-zoom, and state dragging.
- Support light and dark themes, initially following OS preference with an explicit override.
- No custom graph undo/redo or reset-layout feature is required.

## MVP: export, sharing, and persistence

- **SVG export:** Export the complete diagram with modest padding, independent of the current viewport.
- **PNG export:** Likewise export the complete diagram with padding; let the user choose pixel resolution (e.g., width, with proportional height). Do not make exports depend on screen zoom or device pixel ratio.
- Store the last regex and settings locally in `localStorage`. Initial settings: DFA, hidden sink, and system theme.
- Share through a URL fragment, containing the **regex and all relevant settings**, not serialized automata, graph coordinates, or image data. On opening a share link, URL settings take precedence over local storage. Recompute the diagram locally.
- No account, server storage, or additional requests for any of the above.

## Implementation order

Work in vertical increments, with a usable tested artifact at each step. An incomplete implementation should remain buildable and should not claim unimplemented features in the README.

1. **Repository foundation:** Vite + Lit + TypeScript, pnpm scripts, Vitest, Playwright, lint/type-check/build checks, GitHub Actions, GitHub Pages base-path support, GPL license, basic README, and Nix flake verification on available platforms. Establish a small, accessible UI shell.
2. **Regex parser and semantics:** Define an explicit AST, source ranges for diagnostics, and a tested ASCII character-set representation. Implement syntax incrementally, starting with literals/concatenation/alternation/grouping, then quantifiers and classes. Test empty regex, invalid input, escaping, boundaries, and unsupported constructs. Do not delegate correctness to JavaScript's `RegExp` engine.
3. **Automata engine:** Build/test epsilon-NFA construction, epsilon elimination, DFA determinization, and DFA minimization. Add sink visibility semantics and labels. Use independently derived acceptance tests across a broad collection of expressions and strings; test all four representations for language equivalence. Include growth limits and worker integration.
4. **First useful visual MVP:** Lit input and type selector; SVG state/edge rendering; start/double-border markers; readable, semantically exact edge labels; errors; 200-state limit. Keep the diagram readable before adding motion.
5. **Layout and interaction:** Left-to-right automatic layout; spring/force response; incremental node matching; live updates; mouse/touch dragging; infinite canvas pan/zoom; smooth automatic fit. Profile and test realistic as well as pathological graphs.
6. **Complete MVP UX:** SVG/PNG export with resolution control; URL sharing and storage precedence; settings persistence; responsive layout; light/dark themes; accessibility and keyboard behavior.
7. **Hardening and release:** Cross-browser E2E tests, performance and cancellation tests, documentation-example tests, license audit, CI deployment, and README review against the actual shipped functionality.

Within each step: add a test for the smallest meaningful behavior, implement it, refactor, run the relevant checks, and update documentation. Prefer deterministic algorithm tests over brittle pixel-level animation assertions. Keep domain algorithms independent of Lit, SVG, and browser storage so they remain easy to test.

## Explicitly deferred — do not implement in the MVP

- Animating a string through the machine / step-by-step acceptance simulation.
- Visual walkthroughs of regex → ε-NFA → NFA → DFA → minimized DFA construction.
- Comparing regexes for language equivalence.
- Displaying the formal automaton five-tuple `(Q, Σ, δ, q0, F)` or exposing the derived alphabet as a feature.
- Unicode input, extra regex flags, or non-regular regex extensions.
- Viewport-only image export.
- Progressive Web App installation, offline-start caching, or a service worker.
- Tutorial flows, preloaded examples, or sample regex on first launch.

These are *possibilities*, not implementation commitments. Do not prebuild general-purpose frameworks for them. Preserve straightforward module boundaries where that costs little and will make later extensions feasible.

## Definition of done for each change

- Behavior is covered by appropriate Vitest and/or Playwright tests; all relevant checks pass.
- UI text, code, comments, and docs remain in English.
- No external runtime requests or new unvetted license obligations.
- NixOS/macOS development workflows and GitHub Pages build remain viable.
- `README.md` accurately describes the actual feature set, syntax, and constraints.
- No unintended scope expansion beyond the agreed MVP.
