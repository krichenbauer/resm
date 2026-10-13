# RESM — Regex State Machine

RESM turns a regular expression into an interactive diagram of a finite automaton: an ε-NFA, an NFA, a DFA, or a minimized DFA. It is meant to stay simple enough for classroom use.

**Open RESM: <https://krichenbauer.github.io/resm/>**

Everything runs locally in your browser. There is no backend, no account, no analytics, and no request to any third-party host.

## Quick start

1. Type a regular expression into the field at the top, for example `(a|b)*abb`. The diagram is drawn while you type. See [Regex syntax](#regex-syntax) for what you can write.
2. Choose the automaton next to the field: ε-NFA, NFA without ε-transitions, DFA (the default), or minimized DFA.
3. Drag the canvas to move it, turn the wheel or pinch to zoom, and drag a state to move it. See [Moving around](#moving-around).
4. Use **Export** to save the diagram as SVG or PNG, **Share** to copy a link to it, and **Settings** for the alphabet, the sink state, the size limit, and the theme.

An empty field shows the single state `q0`, which is both initial and accepting. If the regex is invalid or its automaton is too large, a message below the field says why, and the last valid diagram stays visible.

## Regex syntax

RESM reads a common subset of the PCRE-style syntax known from Python and Java. It is not fully compatible with either: constructs outside the subset are rejected with an error message instead of being interpreted differently.

Two rules apply everywhere:

- **Full match.** A regex describes whole strings, not substrings: `ab` matches only the string `ab`.
- **ASCII only.** A regex may contain the 128 characters U+0000 to U+007F. A regex that contains any other character is rejected.

What the dot and negations stand for depends on [the alphabet](#the-alphabet). This section describes them for the ASCII alphabet; with the default alphabet, they are restricted to the characters that are written in the regex.

### Supported syntax

| Syntax                         | Meaning                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- |
| `ab`                           | Concatenation: `a` followed by `b`.                                         |
| `a\|b`                         | Alternation: `a` or `b`. An alternative may be empty, as in `a\|`.          |
| `(...)`                        | Grouping.                                                                  |
| `x*`, `x+`, `x?`               | Zero or more, one or more, zero or one.                                    |
| `x{n}`, `x{n,}`, `x{n,m}`      | Exactly `n`, at least `n`, between `n` and `m` repetitions.                |
| `x*?`, `x+?`, `x??`, `x{n,m}?` | Lazy quantifiers. They accept the same strings as the forms without `?`.   |
| `.`                            | Any character of the alphabet except the line feed.                        |
| `[abc]`, `[a-z]`               | Character set: any listed character or any character in a range.           |
| `[^abc]`                       | Negated set: any character of the alphabet that is not listed.             |
| `\d`, `\w`, `\s`               | Digit, word character, whitespace.                                         |
| `\D`, `\W`, `\S`               | Any character of the alphabet that is not a digit, word character, or whitespace. |
| `\.`, `\*`, `\\`, ...          | An escaped punctuation character or space stands for itself.               |
| `^`, `$`                       | Allowed only at the very beginning and the very end, where they are redundant. |

A quantifier applies to the character, set, or group directly before it. The empty regex is valid and matches only the empty string.

### Exact character semantics

- `.` matches the 127 ASCII characters other than the line feed (U+000A), or those of them that are in the alphabet.
- `\d` is `[0-9]`.
- `\w` is `[A-Za-z0-9_]`.
- `\s` is the space (U+0020), tab (U+0009), line feed (U+000A), vertical tab (U+000B), form feed (U+000C), and carriage return (U+000D).
- `\D`, `\W`, `\S`, and negated sets are complements within the alphabet. Over ASCII they include control characters and the line feed, so `[^a]` matches a line feed although `.` does not.
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

Both lists are checked by the test suite. The descriptions of the two examples with a dot or a negation hold for the ASCII alphabet.

Accepted:

<!-- examples:accepted -->
- `(a|b)*abb` — strings of `a` and `b` that end in `abb`
- `(0|1(01*0)*1)*` — binary numbers divisible by three
- `-?\d+(\.\d+)?` — a decimal number with an optional sign and fraction
- `[A-Za-z_]\w*` — an identifier
- `\d{4}-\d{2}-\d{2}` — a date such as `2026-10-12`
- `[a-z]+@[a-z]+\.(com|org)` — a very simple e-mail address
- `"[^"]*"` — over ASCII, a double-quoted string without escapes
- `.*\.txt` — over ASCII, anything that ends in `.txt`
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

## The alphabet

Every automaton reads strings over an alphabet Σ. RESM shows it in the bottom left corner of the canvas, for example `Σ = {a, b}`.

**From the regex (default).** Σ consists of the characters that are written in the regex:

- every character that stands for itself, such as `a` or `\.`;
- every member of a set, a range, or a class: `[a-c]` contributes `a`, `b`, `c`, and `\d` the ten digits;
- what a negation excludes: `[^a]` contributes `a`, and `\D` the ten digits;
- nothing for the dot, which names no character.

Over this alphabet, a regex matches exactly those strings that it would match over ASCII and that contain no other character. So the regex keeps its meaning, and the dot and negations range over Σ:

| Regex        | Σ          | Meaning |
| ------------ | ---------- | ------- |
| `(a\|b)*abb` | `{a, b}`   | As everywhere: strings of `a` and `b` that end in `abb`. With the sink state shown, each state has exactly one edge for `a` and one for `b`. |
| `(a\|b)*a.`  | `{a, b}`   | `.` is `a` or `b`: strings whose last character but one is `a`. |
| `[^a]b`      | `{a, b}`   | `[^a]` is `b`: only `bb`. |
| `"[^"]*"`    | `{"}`      | `[^"]` matches nothing, so only `""` is left. |
| `.*`         | `{}`       | `.` matches nothing, so only the empty string is left. |

The last two are hardly ever intended. When a dot or a negation is left with nothing to match, RESM says so below the regex field; this is a remark, not an error, and the diagram is drawn. To give the dot something to stand for, write the characters out, as in `(a|b)*` instead of `.*`.

**ASCII.** Σ is all 128 ASCII characters, whatever the regex contains. The dot and negations then mean what they mean in Python or Java, restricted to ASCII: `"[^"]*"` is a quoted string. The price is paid in the diagram: with the sink state shown, every state gets an edge such as `[^ab]` for all the characters that the regex does not care about.

As long as the sink state is hidden and the regex contains no dot and no negation, both alphabets give the same states and edges.

## Reading the diagram

- States are named `q0`, `q1`, ... The initial state is always `q0`; the others are numbered in the order a breadth-first search from `q0` finds them, following transitions in ASCII order and ε-transitions in the order of the regex. The same regex therefore always gets the same names.
- The initial state has an arrow that starts at a dot. Accepting states have a double outline.
- All transitions between the same two states are drawn as one edge. Its label describes the exact set of characters in regex notation: `a`, `\d`, `[a-f]`, `[^"]`. A label with `ε` is an ε-transition.
- Labels are relative to the [alphabet](#the-alphabet): `[^a]` stands for all characters of Σ other than `a`. An edge for the whole alphabet is labeled with a list such as `a, b` if Σ has fewer than six characters, and with `Σ` otherwise.
- A label sits beside its edge, by default at the middle. Where another edge, another label, or a state would be in the way, it moves along its edge or to the other side until it is free. Only where many edges with long labels meet, as around the sink state of a larger automaton, a label can remain that another edge runs through.
- Labels make invisible characters visible: `␣` is a space, and `\t`, `\n`, `\v`, `\f`, `\r`, `\0`, and `\x1f` stand for control characters. These spellings appear only in labels; the regex field does not accept them (see [Limitations](#limitations)).
- By default, a DFA is drawn without its sink state: if a state has no edge for a character, the input is rejected. In the minimized DFA, all states from which no accepting state can be reached are left out for the same reason. With the setting [Show sink state](#settings), the sink is drawn below the other states and is always named last, so that showing it does not rename them.

### Moving around

The diagram lies on a canvas without edges.

| Action              | Mouse or trackpad                    | Touch                    |
| ------------------- | ------------------------------------ | ------------------------ |
| Move the canvas     | Drag the background                  | Drag with one finger     |
| Zoom                | Turn the wheel, or pinch on a trackpad | Pinch with two fingers |
| Move a state        | Drag the state                       | Drag the state           |

- Zooming keeps the point under the pointer, or between the fingers, in place.
- A dragged state pulls its neighbors along. When you let go, it is not pinned: it swings back to its place in the layout.
- With the keyboard, when the diagram has the focus: the arrow keys move the view, `+` and `-` zoom, and `0` brings the whole diagram back at its natural size.
- When the diagram changes and would no longer be entirely visible, the view moves and zooms out smoothly until it is, even if you had panned or zoomed before. The view does not zoom in merely because the diagram got smaller; it only does so once the diagram has become tiny in its area. A diagram that fits is never enlarged beyond its natural size.
- Switching the representation replaces the diagram at once, without animation.
- If the operating system asks for reduced motion, nothing is animated: every change appears at once.

### How the automata are built

- The **ε-NFA** follows Thompson's construction as found in textbooks. Each operator adds its own states and ε-transitions, and concatenated parts share the state between them. `x+` and `x?` are built like `x*` without the bypass and without the loop, respectively. Bounded repetition is expanded into copies, so `a{3}` is `aaa` and `a{1,3}` is `aa?a?`.
- The **NFA** results from removing the ε-transitions: a state takes over the transitions of every state it reaches by ε alone. States that become unreachable are dropped.
- The **DFA** results from the subset construction on that NFA.
- The **minimized DFA** merges all states of the DFA that no input can tell apart.

### Size limits

A diagram may have at most 200 states, unless you change that in the [settings](#settings). If the requested automaton is larger, RESM reports that instead of drawing it. A shown sink state counts.

Automata that are only intermediate steps, such as the DFA on the way to the minimized DFA, may be larger: up to 2000 states, or four times the display limit if that is more. Beyond that the expression is reported as too complex. These limits keep every computation short. The work also happens outside the page's main thread, so typing stays responsive in any case.

## Settings

The **Settings** button opens a small menu. Together with the representation selector, these are all settings there are:

| Setting                  | Default | Meaning |
| ------------------------ | ------- | ------- |
| Representation           | DFA     | Which automaton is drawn: ε-NFA, NFA, DFA, or minimized DFA. |
| Alphabet                 | From the regex | Which characters the automaton is about: those written in the regex, or all of ASCII. See [The alphabet](#the-alphabet). |
| Show sink state          | off     | Completes the DFA or minimized DFA: every state gets an edge for every character of the alphabet, and input that can no longer be accepted leads to one extra, non-accepting state. Without it, a missing edge means rejection. Has no effect on the ε-NFA and the NFA. |
| Maximum number of states | 200     | The largest diagram that is drawn, from 1 to 500 states. See [Size limits](#size-limits). |
| Theme                    | System  | Light or dark appearance. "System" follows the operating system. |

## Export

The **Export** button opens a menu with two downloads:

- **Download SVG** saves `resm-diagram.svg`, a vector image at the natural size of the diagram.
- **Download PNG** saves `resm-diagram.png` with the width in pixels that you enter; 1600 is suggested. The height follows from the proportions of the diagram. Neither side can exceed 8192 pixels, which reduces the width of very tall diagrams.

Both files show the complete diagram with a little padding, whatever part of it is on screen, and whatever the zoom level or the pixel density of the display. They show the diagram in its settled layout, without the effect of dragging, in the colors of the current theme on a solid background. Below the diagram they name the alphabet, as the canvas does, because labels such as `Σ` and `[^a]` cannot be read without it. The SVG file names fonts that are present on common systems instead of embedding them, so its text can look slightly different in other programs.

## Sharing and remembering

- **Share** copies a link to the clipboard. The link ends in a fragment such as `#regex=a%7Cb&automaton=min-dfa&alphabet=derived&sink=0&limit=200`: the regex, the representation, the alphabet, the sink option, and the size limit. It contains no automaton, no positions, and no image; whoever opens it computes the diagram again in their own browser. The theme is not part of the link. If the browser denies access to the clipboard, the link is shown in a dialog to copy by hand.
- **Opening a share link** shows its regex with its settings, which take precedence over what the browser remembers. A setting that the link does not mention, and the theme, keep their remembered values. The fragment is then removed from the address bar, because it would no longer match after the next edit.
- **The last regex and the settings are remembered** in the browser's local storage under the key `resm`, and restored on the next visit. Nothing else is stored, and nothing is sent anywhere. Without local storage, for example in some private browsing modes, RESM simply starts empty every time.

## Accessibility and browser support

- All controls are standard form controls with labels and can be reached with the tab key. In Safari, the tab key skips buttons and menus unless "Press Tab to highlight each item on a webpage" is enabled; Option+Tab always works.
- The menus close with the Escape key and return the focus to their button.
- The diagram has a text description for screen readers that names the kind of automaton, its initial and accepting states, and every transition.

RESM needs a current version of Chrome, Edge, Firefox, or Safari, on desktop or mobile; in practice a release from 2024 or later. The automated tests run in Chromium, Firefox, and WebKit, with touch gestures simulated in Chromium. It has not been tested on physical phones or tablets.

## Licenses

RESM is free software.

It is licensed under the GNU General Public License, version 3 or, at your option, any later version. It comes without any warranty. The full text of the license is in [LICENSE](LICENSE).

RESM contains the following software by others. The same notices are served with the application, in the file `third-party-licenses.md` next to it.

| Software | Used for | License | Copyright |
| -------- | -------- | ------- | --------- |
| [Lit](https://lit.dev): `lit`, `lit-html`, `lit-element`, `@lit/reactive-element` | The components of the page | BSD-3-Clause | © 2017 Google LLC |
| [dagre](https://github.com/dagrejs/dagre), including its graph library | Placing the states | MIT | © 2012–2014 Chris Pettitt |
| [Octicons](https://github.com/primer/octicons): the GitHub mark | The icon of the link to this repository | MIT | © 2026 GitHub Inc. |

GitHub and its mark are trademarks of GitHub, Inc. The mark is used only to link to this repository.

<details>
<summary>License of Lit (BSD 3-Clause)</summary>

```text
BSD 3-Clause License

Copyright (c) 2017 Google LLC. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

</details>

<details>
<summary>License of dagre (MIT)</summary>

```text
Copyright (c) 2012-2014 Chris Pettitt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

</details>

<details>
<summary>License of Octicons (MIT)</summary>

```text
MIT License

Copyright (c) 2026 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

</details>

## Development

RESM is built with TypeScript, Lit, and Vite. How to set up the project, run its tests, and deploy it is described in [docs/development.md](docs/development.md). The agreed scope and the rules for changes are in [AGENTS.md](AGENTS.md).
