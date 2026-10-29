/**
 * Keyboard shortcuts as data: one chord is `{ mods, key }`, and everything that decides whether a
 * chord was typed — the parse, the labels, the match against a KeyboardEvent, the browser-reserved
 * check — lives here so the template, the client and the gate cannot disagree about what
 * "Ctrl+Shift+L" means.
 *
 * `mod` is the platform's primary modifier: Ctrl on Windows and Linux, Command on macOS. Content
 * writes `Mod` for the shortcuts Excel documents as Ctrl, and nobody has to write two lessons.
 *
 * Nothing here touches a real `KeyboardEvent`, `navigator` or the DOM: the callers pass a plain
 * `{ key, ctrlKey, metaKey, altKey, shiftKey }` and say which platform they are on.
 */

export const MODIFIERS = ["mod", "ctrl", "alt", "shift", "meta"];

export const NAMED_KEYS = [
  "space",
  "enter",
  "tab",
  "escape",
  "backspace",
  "delete",
  "insert",
  "home",
  "end",
  "pageup",
  "pagedown",
  "left",
  "right",
  "up",
  "down",
  "plus",
  "minus",
  "comma",
  "period",
  "slash",
  "semicolon",
  "quote",
  "bracketleft",
  "bracketright",
  "backslash",
  "backtick",
  "equal",
  "f1",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
  "f8",
  "f9",
  "f10",
  "f11",
  "f12",
];

/** Spellings people type, and the tokens they mean. Keys are lowercased before lookup. */
const ALIASES = new Map(
  Object.entries({
    control: "ctrl",
    ctrl: "ctrl",
    cmd: "meta",
    command: "meta",
    meta: "meta",
    win: "meta",
    windows: "meta",
    super: "meta",
    mod: "mod",
    option: "alt",
    opt: "alt",
    alt: "alt",
    shift: "shift",
    return: "enter",
    del: "delete",
    ins: "insert",
    esc: "escape",
    spacebar: "space",
    pgup: "pageup",
    pgdn: "pagedown",
    arrowleft: "left",
    arrowright: "right",
    arrowup: "up",
    arrowdown: "down",
    // No "+" alias: "+" is the separator, so the Plus key is always written out.
    "-": "minus",
    ",": "comma",
    ".": "period",
    "/": "slash",
    ";": "semicolon",
    "'": "quote",
    "[": "bracketleft",
    "]": "bracketright",
    "\\": "backslash",
    "`": "backtick",
    "=": "equal",
  }),
);

/** `event.key` for a key that is only a modifier, plus the shapes that are not answers at all. */
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "OS", "CapsLock", "Dead"]);

/** The modifier keys a sequence may press on their own, and the token each one is. */
const MODIFIER_EVENT_KEYS = new Map([
  ["Control", "ctrl"],
  ["Shift", "shift"],
  ["Alt", "alt"],
  ["Meta", "meta"],
  ["OS", "meta"],
]);

/** How one modifier prints when it is the whole press rather than part of a chord. */
const SOLO_LABELS = {
  ctrl: { mac: "⌃", other: "Ctrl" },
  alt: { mac: "⌥", other: "Alt" },
  shift: { mac: "⇧", other: "Shift" },
  meta: { mac: "⌘", other: "Win" },
};

const EVENT_KEYS = new Map(
  Object.entries({
    " ": "space",
    Spacebar: "space",
    Enter: "enter",
    Tab: "tab",
    Escape: "escape",
    Backspace: "backspace",
    Delete: "delete",
    Insert: "insert",
    Home: "home",
    End: "end",
    PageUp: "pageup",
    PageDown: "pagedown",
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    "+": "plus",
    "-": "minus",
    ",": "comma",
    ".": "period",
    "/": "slash",
    ";": "semicolon",
    "'": "quote",
    "[": "bracketleft",
    "]": "bracketright",
    "\\": "backslash",
    "`": "backtick",
    "=": "equal",
    // Shift turns the physical key into a different character; the chord is about the key, not the
    // character, so the shifted spellings fold back.
    "?": "slash",
    "<": "comma",
    ">": "period",
    ":": "semicolon",
    '"': "quote",
    "{": "bracketleft",
    "}": "bracketright",
    "|": "backslash",
    "~": "backtick",
    _: "minus",
  }),
);

const KEY_LABELS = {
  space: "Space",
  enter: "Enter",
  tab: "Tab",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Del",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "PgUp",
  pagedown: "PgDn",
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
  plus: "+",
  minus: "−",
  comma: ",",
  period: ".",
  slash: "/",
  semicolon: ";",
  quote: "'",
  bracketleft: "[",
  bracketright: "]",
  backslash: "\\",
  backtick: "`",
  equal: "=",
};

/**
 * Shortcuts the browser or the OS swallows before a page ever sees them, written with `mod` for
 * whichever modifier the platform treats as primary. `ctrl` on a Mac is the Control key, which is
 * its own thing, so the Mission Control arrows are listed with it.
 */
const RESERVED = {
  other: [
    ["mod", "n"],
    ["mod", "t"],
    ["mod", "w"],
    ["mod", "l"],
    ["mod", "shift", "n"],
    ["mod", "shift", "t"],
    ["mod", "shift", "w"],
    ["mod", "tab"],
    ["mod", "shift", "tab"],
    ["mod", "space"],
    ["alt", "f4"],
    ["alt", "left"],
    ["alt", "right"],
    ["f11"],
  ],
  mac: [
    ["mod", "n"],
    ["mod", "t"],
    ["mod", "w"],
    ["mod", "l"],
    ["mod", "q"],
    ["mod", "shift", "n"],
    ["mod", "shift", "t"],
    ["mod", "shift", "w"],
    ["mod", "tab"],
    ["mod", "space"],
    ["ctrl", "up"],
    ["ctrl", "down"],
    ["ctrl", "left"],
    ["ctrl", "right"],
  ],
};

const KEY_SORT = (a, b) => MODIFIERS.indexOf(a) - MODIFIERS.indexOf(b);

function labelOf(token) {
  if (token.length === 1) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function fail(text, message) {
  throw new Error(`"${text}" ${message}`);
}

function tokenize(text) {
  if (typeof text !== "string") fail(String(text), "is a chord only when it is a string");
  const parts = text.split("+").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part === "")) fail(text, "has an empty key or modifier");
  return parts.map((part) => ALIASES.get(part.toLowerCase()) ?? part.toLowerCase());
}

/**
 * `Ctrl+Shift+L`, `Mod+Space`, `Alt+H`: the canonical chord. Throws rather than returning null —
 * a typo in content is a build failure with the string in it, not a screen that never matches.
 */
export function parseChord(text) {
  const tokens = tokenize(text);

  const mods = [];
  for (const token of tokens.slice(0, -1)) {
    if (!MODIFIERS.includes(token)) fail(text, `names "${token}", which is not a modifier — write the key last`);
    if (mods.includes(token)) fail(text, `repeats the modifier "${token}"`);
    mods.push(token);
  }
  const key = tokens[tokens.length - 1];
  if (MODIFIERS.includes(key)) fail(text, "ends on a modifier — a chord needs a key after it");
  if (key.length !== 1 && !NAMED_KEYS.includes(key)) {
    fail(text, `ends on "${key}", which is not a key this player can match`);
  }
  return Object.freeze({ mods: Object.freeze(mods.sort(KEY_SORT)), key });
}

/**
 * A press in a sequence, where `Alt` on its own is an answer (Excel's ribbon access keys are
 * Alt, H, O) but a chord screen's `Alt` on its own never is. Anything else is a chord.
 */
export function parsePress(text) {
  const tokens = tokenize(text);
  if (tokens.length === 1) {
    const [token] = tokens;
    if (token === "mod") fail(text, "is the platform's primary modifier alone — write Mod with a key after it");
    if (MODIFIERS.includes(token)) {
      return Object.freeze({ mods: Object.freeze([]), key: token, solo: true });
    }
  }
  return parseChord(text);
}

/** A stable string for one chord: sorted modifiers, then the key. Two equal chords print the same. */
export function chordKey(chord) {
  return [...chord.mods].sort(KEY_SORT).concat(chord.key).join("+");
}

export function sameChord(left, right) {
  return chordKey(left) === chordKey(right);
}

/** The keyboard labels for one chord, in the order they are held. */
export function labelsOf(chord, { os = "other" } = {}) {
  if (chord.solo) return [SOLO_LABELS[chord.key][os === "mac" ? "mac" : "other"]];
  const labels = [];
  if (chord.mods.includes("mod")) labels.push(os === "mac" ? "⌘" : "Ctrl");
  if (chord.mods.includes("ctrl")) labels.push(os === "mac" ? "⌃" : "Ctrl");
  if (chord.mods.includes("meta")) labels.push(os === "mac" ? "⌘" : "Win");
  if (chord.mods.includes("alt")) labels.push(os === "mac" ? "⌥" : "Alt");
  if (chord.mods.includes("shift")) labels.push(os === "mac" ? "⇧" : "Shift");
  labels.push(KEY_LABELS[chord.key] ?? labelOf(chord.key));
  return labels;
}

/** One string for the whole chord: what an `aria-label`, a hint and the fallback copy say. */
export function chordText(chord, { os = "other" } = {}) {
  return labelsOf(chord, { os }).join(" + ");
}

/** Which modifier flags a chord holds down on this platform. */
function flagsOf(chord, os) {
  return {
    ctrl: chord.mods.includes("ctrl") || (chord.mods.includes("mod") && os !== "mac"),
    meta: chord.mods.includes("meta") || (chord.mods.includes("mod") && os === "mac"),
    alt: chord.mods.includes("alt"),
    shift: chord.mods.includes("shift"),
  };
}

/**
 * The chord an event represents, or null when the event is not an answer: modifier-only presses
 * (holding Ctrl before the key is how a chord is typed) and the keys a keyboard sends that are not
 * part of any shortcut.
 */
export function chordFromEvent(event, { solo = false } = {}) {
  if (!event || typeof event.key !== "string") return null;
  const modifier = MODIFIER_EVENT_KEYS.get(event.key);
  if (modifier !== undefined) {
    if (!solo) return null;
    // The pressed key sets its own flag, so only the *other* modifiers have to be off for this to be
    // the press on its own rather than the start of a chord.
    const held = { ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, meta: event.metaKey };
    delete held[modifier];
    if (held.ctrl || held.shift || held.alt || held.meta) return null;
    return Object.freeze({ mods: Object.freeze([]), key: modifier, solo: true });
  }
  if (MODIFIER_KEYS.has(event.key)) return null;
  const named = EVENT_KEYS.get(event.key);
  const key = named ?? (event.key.length === 1 ? event.key.toLowerCase() : null);
  if (key === null) return null;

  const mods = [];
  if (event.ctrlKey) mods.push("ctrl");
  if (event.metaKey) mods.push("meta");
  if (event.altKey) mods.push("alt");
  if (event.shiftKey) mods.push("shift");
  return Object.freeze({ mods: Object.freeze(mods.sort(KEY_SORT)), key });
}

/** Did this event type the chord? The platform decides what `mod` means. */
export function matchesEvent(event, chord, { os = "other" } = {}) {
  const pressed = chordFromEvent(event, { solo: chord.solo === true });
  if (pressed === null) return false;
  const want = flagsOf(chord, os);
  return (
    pressed.key === chord.key &&
    pressed.mods.includes("ctrl") === want.ctrl &&
    pressed.mods.includes("meta") === want.meta &&
    pressed.mods.includes("alt") === want.alt &&
    pressed.mods.includes("shift") === want.shift
  );
}

/**
 * The typed fallback: `Ctrl+Shift+L`, `cmd shift l` and `control-shift-l` all read as the same
 * chord. It is more forgiving than a key press on purpose — this is a spelling test used when the
 * browser will not let the page see the real keys, so Cmd, Ctrl and Mod are one token here.
 */
export function matchesTyped(text, chord) {
  if (typeof text !== "string" || text.trim() === "") return false;
  let typed;
  try {
    typed = parsePress(text.trim().replace(/[+\-\s]+/g, "+"));
  } catch {
    return false;
  }
  if (Boolean(typed.solo) !== Boolean(chord.solo)) return false;
  if (typed.key !== chord.key) return false;
  const isPrimary = (mod) => mod === "mod" || mod === "ctrl" || mod === "meta";
  const fold = (mods) => new Set(mods.map((mod) => (isPrimary(mod) ? "primary" : mod)));
  const want = fold(chord.mods);
  const got = fold(typed.mods);
  if (want.size !== got.size) return false;
  for (const mod of want) if (!got.has(mod)) return false;
  return true;
}

/**
 * The typed fallback for a sequence: `Alt, H, O`, `alt > h > o` and `Alt then H then O` all read as
 * the same three presses, in order. A sequence is graded step by step on the keyboard, so the typed
 * spelling is graded the same way — one entry per step, and no extra step at either end.
 */
export function matchesTypedSteps(text, steps) {
  if (typeof text !== "string" || typeof steps !== "object" || steps === null) return false;
  const typed = text
    .split(/\s*(?:,|>|→|then)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (typed.length !== steps.length) return false;
  return steps.every((step, index) => matchesTyped(typed[index], step));
}

/**
 * The chord with the platform's primary modifier folded to `mod`, so `Cmd+Q`, `Meta+Q` and
 * `Mod+Q` are one chord on a Mac and `Ctrl+N` is the same chord off one.
 */
function primaryOf(chord, os) {
  const swap = os === "mac" ? "meta" : "ctrl";
  const mods = chord.mods.map((mod) => (mod === swap ? "mod" : mod));
  return [...mods.sort(KEY_SORT), chord.key].join("+");
}

/** Would the browser or the OS eat this chord before the page hears it? */
export function isReserved(chord, { os = "other" } = {}) {
  const want = primaryOf(chord, os);
  const list = os === "mac" ? RESERVED.mac : RESERVED.other;
  return list.some((entry) => entry.join("+") === want);
}

/**
 * Which shortcuts in a chord list the browser will not deliver. Content-lint warns on these, and
 * the client renders the typed fallback instead of a listener that would never fire.
 */
export function uncapturable(chords, options = {}) {
  return chords.filter((chord) => isReserved(chord, options));
}
