---
title: Sorting, filtering and cleaning data
summary: The keys that turn a range into a table, a filter, and a set of values you can paste somewhere else. Most of them are Alt sequences.
description: Keyboard shortcuts for filters, tables, text to columns and paste values in Excel on Windows and macOS, plus Google Sheets.
platforms: windows, macos, sheets
updated: 2026-02-24
---

## Shortcuts

| Action | Windows | macOS | Sheets |
| --- | --- | --- | --- |
| Turn filters on or off for the range | `Ctrl + Shift + L` | `Control + Shift + L` | `No default` — Data ▸ Create a filter |
| Open the filter menu on a column | `Alt + Down Arrow` | `Option + Down Arrow` | `No default` — click the filter icon |
| Open the Sort dialog | `Alt + A + S + S` | `No default` — Data ▸ Sort | `No default` — Data ▸ Sort range |
| Find text in the sheet | `Ctrl + F` | `Control + F` | `Ctrl + F` |
| Replace text in the sheet | `Ctrl + H` | `Control + H` | `Ctrl + H` |
| Turn the range into a table | `Ctrl + T` | `Control + T` | `No default` — Format ▸ Convert to table |
| Split one column into several | `Alt + A + E` | `No default` — Data ▸ Text to Columns | `No default` — Data ▸ Split text to columns |
| Remove duplicate rows | `Alt + A + M` | `No default` — Data ▸ Remove Duplicates | `No default` — Data ▸ Data cleanup ▸ Remove duplicates |
| Open the data validation dialog | `Alt + A + V + V` | `No default` — Data ▸ Data Validation | `No default` — Data ▸ Data validation |
| Group the selected rows | `Shift + Alt + Right Arrow` | `No default` — Data ▸ Group and Outline | `No default` — Data ▸ Group rows |
| Paste values instead of formulas | `Ctrl + Alt + V` — then press `V` | `Control + Command + V` | `Ctrl + Shift + V` |
| Fill the column from the pattern you typed | `Ctrl + E` | `Control + E` | `No default` — drag the fill handle |
| Refresh every data connection | `Ctrl + Alt + F5` | `No default` — Data ▸ Refresh All | `No default` — Data ▸ Refresh |

## When to use it

`Ctrl + T` is the first key worth knowing, because a table carries its own filters, its own header row
and a reference that grows when new rows arrive. A plain range does none of that, and the difference
shows up a month later when a pivot table ignores the rows added since.

The rest of the page is cleanup. Conversations with clients arrive as one column of names, and
`Alt + A + E` splits them at the comma without you retyping anything. When the numbers need to leave
the sheet, `Ctrl + Alt + V` then `V` pastes the values. The receiving file then carries numbers rather
than your formulas and their broken references.

## Checked against

Microsoft 365 Apps for Windows, version 2501, checked on 24 February 2026. Excel for Mac 16.91 on the
same day, where the Data menu has no chord for sorting, splitting or removing duplicates. Google Sheets
in Chrome 131, where filters are menu-only and paste values is `Ctrl + Shift + V`.

## Practice

[Select to the edge of a block](/excel/shortcut-select-to-edge) is the selection step that comes before
every cleanup key on this page.
