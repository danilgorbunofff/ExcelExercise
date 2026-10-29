/**
 * The chord model. The cases that matter are the ones that fail silently in a browser: a chord that
 * parses but never matches, a `Mod` that means Ctrl on one machine and Command on the next, a
 * shortcut the browser eats before the page hears it, and a shift that turns `=` into `+`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MODIFIERS,
  NAMED_KEYS,
  chordFromEvent,
  chordKey,
  chordText,
  isReserved,
  labelsOf,
  matchesEvent,
  matchesTyped,
  matchesTypedSteps,
  parseChord,
  parsePress,
  sameChord,
  uncapturable,
} from "../packages/keys/index.js";

/** A `KeyboardEvent` stand-in: the pure module only reads these fields. */
function press(key, { ctrl = false, meta = false, alt = false, shift = false, code } = {}) {
  return { key, code, ctrlKey: ctrl, metaKey: meta, altKey: alt, shiftKey: shift };
}

describe("parseChord", () => {
  it("reads modifiers in any order and the key last", () => {
    const chord = parseChord("Shift+Ctrl+L");
    assert.deepEqual(chord, { mods: ["ctrl", "shift"], key: "l" });
  });

  it("sorts modifiers canonically, so two spellings compare equal", () => {
    assert.ok(sameChord(parseChord("Shift+Mod+L"), parseChord("Mod+Shift+L")));
    assert.equal(chordKey(parseChord("Shift+Mod+L")), "mod+shift+l");
    assert.notEqual(chordKey(parseChord("Mod+L")), "l+mod");
  });

  it("folds the spellings content will use into one token", () => {
    const pairs = [
      ["Control+A", "Ctrl+A"],
      ["Cmd+A", "Meta+A"],
      ["Command+A", "Super+A"],
      ["Option+A", "Alt+A"],
      ["Return", "Enter"],
      ["Esc", "Escape"],
      ["Spacebar", "Space"],
      ["Space", "Space"],
      ["ArrowLeft", "Left"],
      ["Del", "Delete"],
      ["Ins", "Insert"],
    ];
    for (const [left, right] of pairs) {
      assert.equal(chordKey(parseChord(left)), chordKey(parseChord(right)), `${left} vs ${right}`);
    }
  });

  it("accepts the punctuation keys as themselves", () => {
    for (const key of ["-", ",", ".", "/", ";", "'", "[", "]", "\\", "`", "="]) {
      const chord = parseChord(`Ctrl+${key}`);
      assert.equal(chord.mods.length, 1);
      assert.ok(key.length === 1);
    }
  });

  it("refuses a chord that would never match, and says which string", () => {
    const bad = ["", "Ctrl", "Ctrl+", "+L", "Ctrl++L", "Ctrl+Ctrl+L", "Hyper+L", "Cmd+Somekey", null, 42];
    for (const text of bad) {
      assert.throws(() => parseChord(text), /is a chord only when it is a string|has an empty key or modifier|ends on a modifier|is not a modifier|repeats the modifier|is not a key this player can match/, String(text));
    }
    assert.throws(() => parseChord("Hyper+L"), /"Hyper\+L" names "hyper"/);
  });

  it("keeps the literals it replaces in sync with the key table", () => {
    assert.deepEqual(MODIFIERS, ["mod", "ctrl", "alt", "shift", "meta"]);
    for (const key of ["space", "enter", "tab", "escape", "left", "pageup", "f12"]) {
      assert.ok(NAMED_KEYS.includes(key), key);
    }
  });
});

describe("parsePress", () => {
  it("reads one modifier on its own as a press, for sequences like Alt, H, O", () => {
    for (const text of ["Alt", "alt", "Option", "Ctrl", "Shift", "Meta", "Cmd"]) {
      const press = parsePress(text);
      assert.equal(press.solo, true, text);
      assert.deepEqual(press.mods, [], text);
    }
    assert.equal(parsePress("Option").key, "alt");
    assert.equal(parsePress("Cmd").key, "meta");
    assert.equal(chordKey(parsePress("Alt")), "alt");
  });

  it("falls back to a chord for anything with a key after it", () => {
    assert.deepEqual(parsePress("Ctrl+S"), parseChord("Ctrl+S"));
    assert.deepEqual(parsePress("Shift+Left"), parseChord("Shift+Left"));
    assert.ok(!parsePress("Alt+H").solo);
  });

  it("refuses a bare Mod and a bare modifier pair", () => {
    assert.throws(() => parsePress("Mod"), /is the platform's primary modifier alone/);
    assert.throws(() => parsePress("Ctrl+Shift"), /ends on a modifier/);
  });

  it("matches the modifier key itself, and only while no other modifier is held", () => {
    const alt = parsePress("Alt");
    assert.ok(matchesEvent(press("Alt", { alt: true }), alt));
    assert.ok(!matchesEvent(press("Alt", { alt: true, ctrl: true }), alt), "Ctrl is being held");
    assert.ok(!matchesEvent(press("Alt"), parseChord("Alt+H")), "never for a chord screen");
    assert.ok(!matchesEvent(press("h"), alt), "a key is not the modifier");
  });

  it("labels a lone modifier the way the platform's keyboard does", () => {
    assert.deepEqual(labelsOf(parsePress("Alt"), { os: "mac" }), ["\u2325"]);
    assert.deepEqual(labelsOf(parsePress("Alt"), { os: "other" }), ["Alt"]);
    assert.equal(chordText(parsePress("Cmd"), { os: "mac" }), "\u2318");
  });

  it("grades the typed fallback for a lone modifier too", () => {
    assert.ok(matchesTyped("Alt", parsePress("Alt")));
    assert.ok(matchesTyped("option", parsePress("Alt")));
    assert.ok(!matchesTyped("Alt+H", parsePress("Alt")), "a chord is not a press");
    assert.ok(!matchesTyped("Alt", parseChord("Alt+H")), "a press is not a chord");
  });
});

describe("labelsOf / chordText", () => {
  it("prints Mac symbols on a Mac and words everywhere else", () => {
    const chord = parseChord("Mod+Shift+Left");
    assert.deepEqual(labelsOf(chord, { os: "mac" }), ["⌘", "⇧", "←"]);
    assert.deepEqual(labelsOf(chord, { os: "other" }), ["Ctrl", "Shift", "←"]);
    assert.equal(chordText(chord, { os: "other" }), "Ctrl + Shift + ←");
  });

  it("never prints the same modifier twice", () => {
    assert.deepEqual(labelsOf(parseChord("Mod+Ctrl+Alt+Shift+A"), { os: "other" }), [
      "Ctrl",
      "Ctrl",
      "Alt",
      "Shift",
      "A",
    ]);
    assert.deepEqual(labelsOf(parseChord("Mod+Ctrl+Alt+Shift+A"), { os: "mac" }), ["⌘", "⌃", "⌥", "⇧", "A"]);
  });

  it("spells out the keys a keycap cannot show", () => {
    assert.equal(chordText(parseChord("Alt+Enter")), "Alt + Enter");
    assert.equal(chordText(parseChord("Ctrl+Space")), "Ctrl + Space");
    assert.equal(chordText(parseChord("Ctrl+F4")), "Ctrl + F4");
  });
});

describe("chordFromEvent / matchesEvent", () => {
  it("ignores a modifier pressed on its own", () => {
    for (const key of ["Control", "Shift", "Alt", "Meta", "CapsLock", "Dead"]) {
      assert.equal(chordFromEvent(press(key, { ctrl: true })), null, key);
    }
    assert.equal(chordFromEvent(null), null);
    assert.equal(chordFromEvent({}), null);
  });

  it("matches the chord the learner actually typed", () => {
    assert.ok(matchesEvent(press("l", { ctrl: true, shift: true }), parseChord("Ctrl+Shift+L")));
    assert.ok(matchesEvent(press("L", { ctrl: true, shift: true }), parseChord("Ctrl+Shift+L")));
    assert.ok(matchesEvent(press("Enter", { alt: true }), parseChord("Alt+Enter")));
    assert.ok(matchesEvent(press(" ", { ctrl: true }), parseChord("Ctrl+Space")));
    // Shifted punctuation folds back to the physical key.
    assert.ok(matchesEvent(press("?", { ctrl: true }), parseChord("Ctrl+Slash")));
    assert.ok(matchesEvent(press("_", { ctrl: true, shift: true }), parseChord("Ctrl+Shift+Minus")));
  });

  it("rejects an extra or missing modifier", () => {
    const chord = parseChord("Ctrl+Shift+L");
    assert.ok(!matchesEvent(press("l", { ctrl: true }), chord), "missing Shift");
    assert.ok(!matchesEvent(press("l", { ctrl: true, shift: true, alt: true }), chord), "extra Alt");
    assert.ok(!matchesEvent(press("k", { ctrl: true, shift: true }), chord), "wrong key");
  });

  it("reads Mod as Ctrl off a Mac and as Command on one", () => {
    const chord = parseChord("Mod+L");
    assert.ok(matchesEvent(press("l", { ctrl: true }), chord, { os: "other" }));
    assert.ok(!matchesEvent(press("l", { meta: true }), chord, { os: "other" }));
    assert.ok(matchesEvent(press("l", { meta: true }), chord, { os: "mac" }));
    assert.ok(!matchesEvent(press("l", { ctrl: true }), chord, { os: "mac" }));
  });

  it("reads a non-Latin layout off the physical key", () => {
    // A Cyrillic keyboard reports the character it prints; the shortcut is written for the key.
    const chord = parseChord("Ctrl+Shift+L");
    assert.ok(matchesEvent(press("д", { ctrl: true, shift: true, code: "KeyL" }), chord));
    assert.ok(matchesEvent(press("Д", { ctrl: true, shift: true, code: "KeyL" }), chord));
    assert.ok(!matchesEvent(press("д", { ctrl: true, code: "KeyK" }), chord), "the code decides the key");
    // Nothing left to read: a currency symbol with no physical key we know.
    assert.equal(chordFromEvent(press("€", { ctrl: true })), null);
  });

  it("treats Ctrl++ as Shift+Plus, the way Excel documents it", () => {
    assert.ok(matchesEvent(press("+", { ctrl: true, shift: true }), parseChord("Mod+Shift+Plus")));
  });
});

describe("matchesTyped", () => {
  it("accepts the ways a learner might spell the same shortcut", () => {
    const chord = parseChord("Mod+Shift+L");
    for (const typed of ["Ctrl+Shift+L", "ctrl shift l", "control-shift-l", "Mod+Shift+L", "Shift+Ctrl+L"]) {
      assert.ok(matchesTyped(typed, chord), typed);
    }
  });

  it("rejects a wrong key, a wrong modifier set, and noise", () => {
    const chord = parseChord("Mod+Shift+L");
    for (const typed of ["", "  ", "Ctrl+L", "Ctrl+Alt+Shift+L", "Ctrl+Shift+K", "l", "nonsense+", null]) {
      assert.ok(!matchesTyped(typed, chord), String(typed));
    }
  });
});

describe("matchesTypedSteps", () => {
  const steps = ["Alt", "H", "O"].map(parsePress);

  it("accepts the ways a learner might spell a sequence", () => {
    for (const typed of ["Alt, H, O", "alt > h > o", "Alt then H then O", "Alt→H→O"]) {
      assert.ok(matchesTypedSteps(typed, steps), typed);
    }
  });

  it("rejects a sequence that is short, long, or out of order", () => {
    for (const typed of ["", "Alt, H", "Alt, H, O, O", "H, Alt, O", "Alt, H, P", null]) {
      assert.ok(!matchesTypedSteps(typed, steps), String(typed));
    }
  });
});

describe("isReserved / uncapturable", () => {
  it("knows the shortcuts the browser eats", () => {
    assert.ok(isReserved(parseChord("Ctrl+T")));
    assert.ok(isReserved(parseChord("Ctrl+Shift+N")));
    assert.ok(isReserved(parseChord("F11")));
    assert.ok(!isReserved(parseChord("Ctrl+Shift+L")));
  });

  it("uses the platform's list", () => {
    assert.ok(isReserved(parseChord("Mod+T"), { os: "mac" }));
    assert.ok(isReserved(parseChord("Cmd+Q"), { os: "mac" }));
    assert.ok(!isReserved(parseChord("Cmd+Q"), { os: "other" }));
  });

  it("filters a whole chord list down to the ones that need the typed fallback", () => {
    const chords = ["Ctrl+T", "Ctrl+Shift+L", "F11", "Mod+B"].map(parseChord);
    assert.deepEqual(
      uncapturable(chords).map(chordKey),
      ["ctrl+t", "f11"],
    );
  });
});
