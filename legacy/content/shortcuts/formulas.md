---
title: Writing and checking formulas
summary: Three keys do most of the work here: F4 locks a reference, F2 opens the cell for editing, and Ctrl + Enter keeps the cursor where it is.
description: Keyboard shortcuts for entering, editing and auditing Excel formulas on Windows and macOS, and what Google Sheets does differently.
platforms: windows, macos, sheets
updated: 2026-02-24
---

## Shortcuts

| Action | Windows | macOS | Sheets |
| --- | --- | --- | --- |
| Start a formula in the cell | `=` | `=` | `=` |
| Insert a function from a dialog | `Shift + F3` | `Shift + F3` | `No default` — Insert ▸ Function |
| Total the column above the cell | `Alt + =` | `Command + Shift + T` | `Alt + =` |
| Toggle a reference between relative and absolute | `F4` | `Command + T` | `F4` |
| Show every formula instead of its result | `Ctrl + Grave` | `Control + Grave` | `No default` — View ▸ Show formulas |
| Accept the entry and stay in the cell | `Ctrl + Enter` | `Control + Return` | `No default` — Enter moves you down |
| Cancel the entry you are typing | `Esc` | `Esc` | `Esc` |
| Start a new line inside the cell | `Alt + Enter` | `Control + Option + Return` | `Ctrl + Enter` |
| Insert the argument names of the function | `Ctrl + Shift + A` | `Control + Shift + A` | `No default` — type them yourself |
| See what part of the formula evaluates to | `F9` | `F9` | `No default` — check the cell instead |
| Expand or collapse the formula bar | `Ctrl + Shift + U` | `Control + Shift + U` | `No default` — drag the bar |
| Edit the active cell instead of typing over it | `F2` | `Control + U` | `F2` |
| Copy the value from the cell above | `Ctrl + Shift + "` | `Control + Shift + "` | `No default` — copy and paste |

## When to use it

`F4` is the one to learn first. Every formula you copy down a column needs one part of a reference
held still. The key cycles through the four combinations, so you never type dollar signs by hand. You
can watch the dollars land on the part of the address you mean to lock.

`F2` and `Ctrl + Enter` are the pair that saves the most time in data entry. `F2` puts the cursor in the
cell without overwriting it. `Ctrl + Enter` accepts what you typed and keeps the selection on that
cell. The next thing you type lands in the same place rather than one row below.

## Checked against

Microsoft 365 Apps for Windows, version 2501, checked on 24 February 2026. Excel for Mac 16.91 on the
same day, where `Command + T` cycles the reference and `Control + U` opens the cell for editing. Google
Sheets in Chrome 131, where `Ctrl + Enter` inserts a line break instead of accepting the entry.

## Practice

[Select to the edge of a block](/excel/shortcut-select-to-edge) grades a keypress rather than a
formula, which is what a shortcut page is for.
