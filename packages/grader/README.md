# @excelsupreme/grader

The deterministic formula grader. Same formula, same verdict, everywhere: no network, no DOM, no
clock, no randomness, no LLM. It is the one part of this product that must never become fuzzy.

## Entry point

```js
import { grade } from "@excelsupreme/grader";

const verdict = grade(exercise, "=SUM(B2:B4)");
```

A bad formula never throws: one that does not parse, references a missing cell, or divides by zero is a
normal verdict. A malformed *exercise* does throw `TypeError` — that is a content bug, not a learner error,
and the build rejects those before they ship.

### The verdict contract

| Field | Type | Meaning |
|---|---|---|
| `ok` | `boolean` | Accepted. This is the only field the UI must branch on. |
| `rule` | `string` | The lesson rule that decided it: `correct` when accepted, otherwise an id from the lesson JSON (`func-sum`, `match-exact`, `require-ref`, …) or the built-in `syntax` / `error` / `value`. |
| `message` | `string` | One sentence the learner reads. Always present, even when `ok`. |
| `hint` | `string` | Escalating hint for a rejection; `""` when accepted. |
| `value` | `number \| string \| boolean \| null` | What the formula evaluated to, unformatted. `null` when it never produced a value. |
| `expected` | same | The answer the lesson expects, from `expect.value`. |
| `code` | `string \| null` | An Excel error code (`#VALUE!`, `#REF!`, …) when the formula itself is broken. |
| `position` | `number \| null` | **1-based** index into the formula *body* (one leading `=`, if any, is stripped) of the token that broke the syntax, so a caret sits under it. `null` unless the verdict is a syntax error. |

`message` and `hint` are user-visible copy. Treat changing one as changing the product, not the code.
`formatValue()` renders a value the way a sheet cell would if you need it as text.

## Stability

`tests/golden/snapshot.json` records the exact verdict for every reviewed formula in the curriculum —
196 of them. `tests/golden.test.js` fails on any byte difference. If a grader change is intentional,
run `npm run golden:update` and read the diff it prints: it names every verdict that moved. Never run
that command to make a red test green.

## Layout

| File | Job |
|---|---|
| `index.js` | The public surface; everything else is internal |
| `grade.js` | Lesson rules, acceptance, messages, hints |
| `functions.js` | The spreadsheet function library |
| `evaluate.js` | Formula evaluation and cell context |
| `parse.js`, `tokenize.js` | Grammar |
| `address.js` | A1 references and ranges |
| `values.js` | Excel coercion, comparison, wildcards |
| `errors.js` | `#DIV/0!` and friends, plus `FormulaError` |

## Consumers

- `legacy/src/client/drill.js` imports it at runtime. Client modules are authored in their *shipped*
  position (`dist/assets/client/`), so it reaches the grader as `../grader/index.js`; `legacy/src/build.mjs`
  copies this directory to `dist/assets/grader/` to satisfy that path.
- `legacy/src/site/*.mjs` imports `address.js` and `functions.js` at build time to validate content.
- Tests import it directly. The Next.js app imports the bare specifier `@excelsupreme/grader` (the package
  exports only `"."`; reach for a relative path if you ever need a submodule).
