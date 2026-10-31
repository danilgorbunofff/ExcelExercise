# Phase 8 — SQL track


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 1 week engine + 4–6 weeks content · **Depends on:** phases 2, 4
**Blocks:** phase 10

---

## Objective

Add the second course. 23 lessons in 6 categories, played in the same shell, graded by comparing
result sets rather than matching strings — a deliberate improvement on the reference, which normalises
and compares query text.

## Scope

- Sandboxed SQL engine in the browser (SQLite WASM) seeded per lesson from a fixed schema.
- Query editor with formatting, run, reset, and schema explorer.
- Result-set diffing: column names/order, row values, row order (only when the task requires order),
  floating tolerance for aggregates.
- 23 lessons in 6 categories: basics, query, filtering, modification, join, aggregate.
- Track theming (distinct accent), own dashboard partition, own progress rows.
- Destructive statements confined to a disposable per-lesson database.
- The fifth project page: the reference's SQL case (re-themed), built on this engine.

## Out of scope

- Server-side SQL execution (browser-only for v1; no credentials, no cost, no latency).
- Postgres-specific syntax (note it in lesson copy where relevant).
- Query performance lessons (no `EXPLAIN` analysis in v1).

## Work breakdown

1. **Engine.** Load `sql.js`/SQLite WASM from a pinned first-party asset (vendored, hash-checked, same
   policy as today's build gate). One database instance per lesson, recreated on reset. Wrap in
   `packages/sql-sandbox` with `{ run(sql) → { columns, rows, error, ms } }`.
2. **Grading.** For each screen: `expect` describes the reference result — either `rows` (literal) or
   `query` (run at build time to produce the literal, then frozen). Compare:
   - column count and names (case-insensitive, alias-tolerant when `allowAlias: true`);
   - row count;
   - row values with type coercion for numerics and a tolerance for floats;
   - row order only if `ordered: true`.
   Failure returns a diff summary ("12 rows expected, 14 returned", "column 2 differs at row 5") — not
   the answer.
3. **Editor.** CodeMirror 6 with SQL mode, tab-indent, run on ⌘/Ctrl+Enter, resizable output pane,
   error line highlighting from the engine's message.
4. **Schema explorer.** Tables with columns, types, 5 sample rows, copyable names; collapsed by default
   on mobile.
5. **Safety.** Recreate the DB after every destructive statement run; disable `ATTACH`; cap result
   rows and query time; if a screen requires `UPDATE`/`DELETE`/`INSERT`, grade the *state* after
   execution rather than a result set.
6. **Lessons.** 23 lessons, ~6 screens each (~140 screens): basics (SELECT, aliases, DISTINCT, ORDER
   BY, LIMIT), query (WHERE, operators, LIKE, IN, BETWEEN, NULL), filtering (AND/OR precedence, dates,
   CASE), modification (INSERT, UPDATE, DELETE, transactions), join (INNER, LEFT, self, multi-table),
   aggregate (COUNT, SUM, AVG, GROUP BY, HAVING, subqueries).
7. **Track integration.** `content/tracks/sql.json`, category pages, dashboard tab, progress rows with
   `track='sql'`, entitlement rule shared with Excel.
8. **Fixtures.** Same rule as Excel: ≥6 correct and ≥6 incorrect queries per screen, including one
   that is "right answer, wrong technique" (e.g. `SELECT *` then filtering in the client).

## Acceptance criteria — out of launch (2026-10-31)

The owner removed the SQL track from this launch on 2026-10-31 ("I do not need that sql part on launch"). These eight criteria are not failures and not deferrals: they are out of scope, and this doc is kept as the post-launch plan. Nothing in phases 0–7, 9A or 10 depends on them.

| ID | Criterion | Verdict | Witness | State exercised | Decision |
| --- | --- | --- | --- | --- | --- |
| p8-66 | Aliasing/whitespace-insensitive grading | Absent | no SQL grader | n/a | Out of launch: owner removed the SQL track (2026-10-31) |
| p8-67 | Wrong column order fails with a column diff | Absent | — | n/a | Out of launch: owner removed the SQL track (2026-10-31) |
| p8-68 | Right rows, wrong order passes unless `ordered` | Absent | — | n/a | Out of launch: owner removed the SQL track (2026-10-31) |
| p8-69 | `DELETE`/`UPDATE` grade table state; next screen sees a clean DB | Absent | — | n/a | Out of launch: owner removed the SQL track (2026-10-31) |
| p8-70 | Destructive statements cannot touch anything outside the lesson DB | Absent | — | n/a | Out of launch: owner removed the SQL track (2026-10-31) |
| p8-71 | 23 lessons complete end-to-end, category counts match | Absent | — | n/a | Out of launch: owner removed the SQL track (2026-10-31) |
| p8-72 | Engine loads in < 1.5 s, added JS documented | Absent | — | n/a | Out of launch: owner removed the SQL track (2026-10-31) |
| p8-73 | Every fixture verdict matches in CI | Absent | — | n/a | Out of launch: owner removed the SQL track (2026-10-31) |

## Test plan

| Area | Tests |
|---|---|
| Diffing | unit: 20 cases (alias, order, type coercion, float tolerance, extra column) |
| Sandbox | unit: reset, isolation between lessons, row cap, error surfacing |
| Content | every screen's fixtures pass/fail as declared |
| E2E | one full lesson per category |
| Perf | engine boot time and memory on a 5-table schema |

## Risks

| Risk | Mitigation |
|---|---|
| WASM size hurts page weight | load only on SQL routes, lazy, cached; budget in CI |
| Dialect mismatch with the article copy | every lesson states "SQLite" and notes Postgres differences |
| Grading too strict/loose | explicit per-screen flags; fixture-driven calibration |
| Content cost | 23 lessons but simpler screens; ~2 author-days per lesson |
