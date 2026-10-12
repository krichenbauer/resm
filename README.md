# RESM — Regex State Machine

RESM is a small, browser-only tool that turns a regular expression into an interactive diagram of a finite automaton. It is meant to stay simple enough for classroom use.

Everything runs locally in your browser. There is no backend, no account, no analytics, and no request to any third-party host.

## Status

RESM is at the start of its development. **It does not draw automata yet.**

What exists today:

- The application shell: a single-line regex field, a selector for the automaton representation (ε-NFA, NFA, DFA, minimized DFA; DFA is preselected), and an empty diagram area.
- Light and dark appearance that follows the operating system setting.
- The regex parser described under [Regex syntax](#regex-syntax). It is implemented and tested, but **not connected to the page yet**: typing into the field has no effect and shows no errors so far.

Not implemented yet: automaton construction, diagram rendering, layout and interaction, export, sharing, and settings. This section and the ones below are updated as features land.

## Regex syntax

RESM reads a common subset of the PCRE-style syntax known from Python and Java. It is not fully compatible with either: constructs outside the subset are rejected with an error message instead of being interpreted differently.

Two rules apply everywhere:

- **Full match.** A regex describes whole strings, not substrings: `ab` matches only the string `ab`.
- **ASCII only.** The alphabet is the 128 characters U+0000 to U+007F. A regex that contains any other character is rejected.

### Supported syntax

| Syntax                         | Meaning                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- |
| `ab`                           | Concatenation: `a` followed by `b`.                                         |
| `a\|b`                         | Alternation: `a` or `b`. An alternative may be empty, as in `a\|`.          |
| `(...)`                        | Grouping.                                                                  |
| `x*`, `x+`, `x?`               | Zero or more, one or more, zero or one.                                    |
| `x{n}`, `x{n,}`, `x{n,m}`      | Exactly `n`, at least `n`, between `n` and `m` repetitions.                |
| `x*?`, `x+?`, `x??`, `x{n,m}?` | Lazy quantifiers. They accept the same strings as the forms without `?`.   |
| `.`                            | Any character except the line feed.                                        |
| `[abc]`, `[a-z]`               | Character set: any listed character or any character in a range.           |
| `[^abc]`                       | Negated set: any ASCII character that is not listed.                       |
| `\d`, `\w`, `\s`               | Digit, word character, whitespace.                                         |
| `\D`, `\W`, `\S`               | Any ASCII character that is not a digit, word character, or whitespace.    |
| `\.`, `\*`, `\\`, ...          | An escaped punctuation character or space stands for itself.               |
| `^`, `$`                       | Allowed only at the very beginning and the very end, where they are redundant. |

A quantifier applies to the character, set, or group directly before it. The empty regex is valid and matches only the empty string.

### Exact character semantics

- `.` matches the 127 ASCII characters other than the line feed (U+000A).
- `\d` is `[0-9]`.
- `\w` is `[A-Za-z0-9_]`.
- `\s` is the space (U+0020), tab (U+0009), line feed (U+000A), vertical tab (U+000B), form feed (U+000C), and carriage return (U+000D).
- `\D`, `\W`, `\S`, and negated sets are complements within ASCII. They include control characters and the line feed, so `[^a]` matches a line feed although `.` does not.
- These characters have a special meaning and need a backslash to be used literally: `\ ^ $ . | ? * + ( ) [ {`. Every other ASCII character, including the space, `]`, and `}`, stands for itself. A backslash may precede any ASCII punctuation character or space.

Inside a character set:

- All characters except `\`, `]`, `[`, and in some positions `^` and `-` are literal, so `[.*]` matches a dot or an asterisk.
- `^` negates the set only directly after the opening bracket.
- `-` is literal at the start or end of the set, or when escaped: `[-a]`, `[a-]`, `[a\-z]`.
- `]` directly after the opening `[` or `[^` is literal: `[]a]` matches `]` or `a`.
- `\d`, `\w`, `\s` and their negations may appear in a set, but not as an endpoint of a range.
- A set may match no character at all, for example `[^\s\S]`. A regex that requires such a set matches nothing.

### Limitations

The following are rejected with an error that points to the offending position:

- Flags, including inline flags such as `(?i)`.
- Non-capturing groups `(?:...)`, named groups, lookahead and lookbehind, and all other `(?...)` extensions.
- Backreferences such as `\1`.
- Control, octal, hex, and Unicode escapes such as `\n`, `\t`, `\x41`, and `\p{L}`. Tabs can be pasted into the field; a line feed cannot be written as a literal, but `\s` and negated sets still match it.
- Word boundaries and extra anchors: `\b`, `\B`, `\A`, `\Z`.
- `^` or `$` anywhere except the very beginning or end of the whole regex, including inside groups.
- Possessive quantifiers such as `a*+`, because they change which strings match.
- A quantifier directly after another quantifier, such as `a**`. Write `(a*)*`.
- `{,m}` without a lower bound. Write `{0,m}`.
- An unescaped `{` that does not start a repetition. Write `\{`.
- Nested sets, POSIX classes such as `[[:alpha:]]`, and set intersection with `&&`. Write `\[` and `\&` for the literal characters.
- Repetition counts above 1000 and groups nested more than 100 levels deep.

### Examples

Both lists are checked by the test suite.

Accepted:

<!-- examples:accepted -->
- `(a|b)*abb` — strings of `a` and `b` that end in `abb`
- `(0|1(01*0)*1)*` — binary numbers divisible by three
- `-?\d+(\.\d+)?` — a decimal number with an optional sign and fraction
- `[A-Za-z_]\w*` — an identifier
- `\d{4}-\d{2}-\d{2}` — a date such as `2026-10-12`
- `[a-z]+@[a-z]+\.(com|org)` — a very simple e-mail address
- `"[^"]*"` — a double-quoted string without escapes
- `.*\.txt` — anything that ends in `.txt`
- `^colou?r$` — `color` or `colour`, with redundant anchors
- `a{2,4}?` — two to four `a`; the lazy `?` changes nothing
- `[]^-]` — one of the characters `]`, `^`, `-`
<!-- /examples:accepted -->

Rejected:

<!-- examples:rejected -->
- `(?:ab)+` — non-capturing group
- `(?i)abc` — inline flag
- `(a)\1` — backreference
- `a\nb` — control escape
- `\bword\b` — word boundary
- `a^b` — anchor in the middle
- `a**` — quantifier after a quantifier
- `a*+` — possessive quantifier
- `a{,3}` — repetition without a lower bound
- `[a-z&&[^aeiou]]` — set intersection
- `[z-a]` — range out of order
- `(ab` — unterminated group
- `é` — non-ASCII character
<!-- /examples:rejected -->

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

The published site bundles [Lit](https://lit.dev) (BSD-3-Clause). The build writes the license notices of all bundled dependencies to `third-party-licenses.md`, which is served next to the application.
