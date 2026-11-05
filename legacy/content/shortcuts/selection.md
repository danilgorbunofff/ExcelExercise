---
title: Selecting cells and ranges
summary: Selecting is the half of the keyboard people skip. Bolding the wrong range is almost always a selection mistake, not a formatting one.
description: Keyboard shortcuts for selecting cells and ranges in Excel on Windows and macOS, and the equivalents in Google Sheets.
platforms: windows, macos, sheets
updated: 2026-02-24
---

## Shortcuts

| Action | Windows | macOS | Sheets |
| --- | --- | --- | --- |
| Select the whole column | `Ctrl + Space` | `Control + Space` | `Ctrl + Space` |
| Select the whole row | `Shift + Space` | `Shift + Space` | `Shift + Space` |
| Select everything on the sheet | `Ctrl + A` | `Command + A` | `Ctrl + A` |
| Extend the selection by one cell | `Shift + Arrow key` | `Shift + Arrow key` | `Shift + Arrow key` |
| Extend the selection to the edge of the block | `Ctrl + Shift + Arrow key` | `Command + Shift + Arrow key` | `Ctrl + Shift + Arrow key` |
| Extend the selection to the last used cell | `Ctrl + Shift + End` | `Command + Shift + End` | `Ctrl + Shift + End` |
| Add a second range to what is already selected | `Ctrl + drag` | `Command + drag` | `Ctrl + drag` |
| Select only the rows a filter left visible | `Alt + ;` | `Command + Shift + Z` | `No default` — filters hide rows instead |
| Extend the selection down one screen | `Shift + Page Down` | `Shift + Page Down` | `Shift + Page Down` |
| Move the active cell inside the selection | `Tab` | `Tab` | `Tab` |
| Turn extend-selection mode on | `F8` | `F8` — Fn + F8 on a laptop | `No default` — hold Shift instead |
| Shrink the selection back to the active cell | `Shift + Backspace` | `Shift + Delete` | `No default` — press Escape |

## When to use it

Most formatting accidents are selection accidents. You bold a heading, then click somewhere else and
bold one cell because the selection was still live. `Ctrl + Space` takes the whole column and
`Shift + Space` takes the whole row. That is the difference between formatting a label and formatting a
hundred rows of data.

The two you will use most are the ones people never learn. `Ctrl + Shift + Arrow` extends to the edge of
the block, so you never drag to row 4,812 by hand. `Ctrl + A` takes the whole region before you sort it.
That step is what stops a sort from eating half your table.

## Checked against

Microsoft 365 Apps for Windows, version 2501, checked on 24 February 2026. Excel for Mac 16.91 on the
same day, where `Command + Shift + Z` selects visible cells only. Google Sheets in Chrome 131, where
visible-cells selection has no chord and filtering hides rows rather than filtering them in place.

## Practice

[Select to the edge of a block](/excel/shortcut-select-to-edge) starts with a single cell and asks you
to reach the end of the data with the keyboard. Then it grades the press you made.
