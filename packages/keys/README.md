# @excelsupreme/keys

One keyboard shortcut as data, with no DOM and no dependencies. The template turns a chord into
clickable keycaps, content-lint refuses the ones that cannot work, and the client decides whether a
pressed key is the answer or a typed fallback — all from this module, so the three cannot disagree
about what "Ctrl+Shift+L" is.

| Export | What it owns |
|---|---|
| `parseChord` | `"Mod+Shift+L"` → `{ mods: ["mod", "shift"], key: "l" }`, or a throw that names the string. |
| `parsePress` | A step in a sequence, where `"Alt"` on its own is an answer and not half a chord. |
| `chordKey`, `sameChord` | Canonical order, so two spellings of one chord compare equal. |
| `labelsOf`, `chordText` | The keycaps — `⌘ ⇧ ←` on a Mac, `Ctrl Shift ←` everywhere else. |
| `chordFromEvent`, `matchesEvent` | Is this key press the chord? Modifier-only presses are not answers. |
| `matchesTyped` | The fallback spelling check, for chords the browser will not deliver. |
| `matchesTypedSteps` | The same check for a sequence, one entry per step, in order. |
| `isReserved`, `uncapturable` | Which shortcuts the browser or the OS eats before the page hears them. |

Rules the tests pin, because each one is a screen that would otherwise never match:

- **`Mod` is the platform's primary modifier**: Ctrl on Windows and Linux, Command on macOS. Content
  writes `Mod+L` once for the shortcut Excel documents as Ctrl+L.
- **Modifiers parse in any order and print in one.** `Shift+Ctrl+L` and `Ctrl+Shift+L` are the same
  chord; `chordKey` is `ctrl+shift+l` for both.
- **A bad chord throws at load, not at keypress.** A typo in content is a build failure carrying the
  original string, never a screen whose answer can never be typed.
- **A modifier pressed on its own is not a chord.** Holding Ctrl is how a chord is typed, so
  `Control`, `Shift`, `Alt`, `Meta`, `CapsLock`, `Dead` and friends produce no chord — unless the
  screen asks for a press (`parsePress`), which is what Excel's ribbon access keys need: `Alt`, `H`,
  `O` is a sequence of three presses, and the first one is a modifier alone. A lone modifier only
  counts while no *other* modifier is held, so it cannot fire in the middle of a chord.
- **Shift is folded to the physical key.** `?` is `Slash`, `_` is `Minus`, so `Ctrl+Slash` matches
  the key a learner actually presses. Excel's own "Ctrl++" is written `Mod+Shift+Plus`, because `+`
  is the separator and cannot appear as a key.
- **A layout we cannot read is read from the physical key.** A Cyrillic keyboard reports `д` where the
  shortcut says `L`; anything outside printable ASCII falls back to `event.code` (`KeyL`, `Digit1`), so
  a shortcut stays pressable in the layout the learner actually types in.
- **Reserved shortcuts use the platform's list.** `Cmd+Q` is reserved on a Mac and not on Windows;
  `Ctrl+T` is reserved on both. `uncapturable` is how content-lint and the client find the chords
  that need the typed fallback.
- **`matchesTyped` is deliberately more forgiving than `matchesEvent`.** It is the spelling test used
  when the browser will not deliver the real key, so `Cmd`, `Ctrl` and `Mod` are one token there and
  only there.

The OS is always a parameter (`{ os: "mac" | "other" }`), never sniffed from `navigator`, so the
same call gives the same answer in a test as it does in a browser.
