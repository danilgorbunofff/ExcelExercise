# @excelsupreme/sheet

The grid of a sheet as data. `legacy/src/site/sheet.mjs` renders from it and
`legacy/src/client/drill.js` navigates with it, so the cells a learner can select are the cells the
page drew.

| Export | What it is |
|---|---|
| `gridModel({ grid, answerCell })` | One rendered block: its `start` cell, `width`/`height`, the `rows` it was given, the `addresses` of every cell, the `columns` letters and the `target` (answer) cell. |
| `cellAt(model, address)` | The cell at an address — `{ address, value, rowOffset, colOffset }` — or `null` when the address is not on this sheet. |
| `startCell(model)` | The top-left cell, where the selection starts. |
| `moveSelection(address, key, { model })` | The address one arrow, `Home` or `End` moves to, or `null` at the edge. |
| `MOVE_KEYS` | The keys `moveSelection` answers. Anything else belongs to the caller. |

Rules the tests pin:

- **`startCell` decides every address.** A lesson can show a fragment starting at `C3`, so `A1` is not a
  cell of that block and no offset is assumed to be zero-based on screen.
- **`colIndex` is 1-based**, matching `packages/grader/address.js`, so the model and the grader cannot
  disagree about which column a letter is.
- **A move never wraps.** `ArrowLeft` at the first column returns `null` instead of the previous row's
  last cell: jumping rows would look like a bug to a learner holding the key.
- **An address off the sheet is `null`, not a guessed cell.** `cellAt` refuses anything outside the block
  rather than clamping to the nearest cell, which would silently move the selection.
- **Absolute and lower-case spellings parse**, because the model is the authority on where a cell is.
- **A grid with no rows or an unparsable `startCell` throws** — a model of nothing is a template bug, not
  an empty table.

Nothing here touches the DOM, holds state or knows what a screen is. The markup stayed in
`legacy/src/site/sheet.mjs` because it needs that module's escaping and cell formatting, and moving those
into a package would change bytes the golden snapshot pins for no behavioural gain.
