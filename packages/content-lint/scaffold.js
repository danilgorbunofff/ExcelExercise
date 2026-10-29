/**
 * `content:new` — the one place a planned slot becomes an authored lesson.
 *
 * The catalog is the contract: the scaffold takes the slot's title, level and group from
 * `track.json` and rewrites that entry to `{ id, group }`, so a lesson cannot be created somewhere
 * the site does not look for it. The file it writes is `schemaVersion: 2` with its fixtures inline
 * and a drill that already passes the gate, because a skeleton that fails `content:check` teaches
 * the author to stop trusting the gate on their first day.
 *
 * What it cannot write is the lesson: the prompt, the explanation and the grid are a working SUM
 * drill standing in for the author's own, and both say so in place.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NUMBERED = /^(\d+)-/;

function readTrack(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`content/track.json: cannot read (${error.message})`);
  }
}

/** Slugs the exercises folder already uses, so a scaffold never lands on a URL already taken. */
function usedSlugs(dir) {
  const taken = new Set();
  if (!existsSync(dir)) return taken;
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".json"))) {
    try {
      const { slug } = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (typeof slug === "string") taken.add(slug);
    } catch {
      // A file that does not parse is the loader's problem to report, not the scaffold's to fix.
    }
  }
  return taken;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** The smallest drill that renders, grades and passes every lint rule, so the gate is green from the first edit. */
function skeleton({ id, slug, level, title }) {
  return {
    id,
    slug,
    level,
    title,
    schemaVersion: 2,
    screens: [
      {
        id: "formula-1",
        type: "formula",
        prompt: `In B4, total B2:B3 with SUM, then replace this scaffold sentence with the drill "${title}" describes.`,
        grid: {
          startCell: "A1",
          rows: [
            ["Month", "Units"],
            ["Jan", 120],
            ["Feb", 180],
            ["Total", null],
          ],
        },
        answerCell: "B4",
        expect: { value: 300 },
        require: [{ id: "func-sum", func: "SUM", minArgs: 1 }],
        forbid: [],
        requireRef: "B2",
        rules: [],
        hints: {
          syntax: "Start with = and close every bracket: =SUM(B2:B3).",
          "func-sum": "Add the two months with SUM instead of typing 120+180.",
          "require-ref":
            "Point SUM at the cells in column B; typing the numbers in gives an answer that never updates.",
          value: "That is not the units total. Check that the range covers B2:B3 and nothing else.",
          error:
            "SUM returns #VALUE! over text and #REF! when a cell it points at is gone. Type =SUM(B2:B3) and let Excel write the range.",
        },
        fixtures: {
          accept: ["=SUM(B2:B3)", "=sum(b2:b3)", "=SUM($B$2:$B$3)", "=SUM(B2,B3)", "=SUM(B2:B3)+0", "=SUM(B$2:B$3)"],
          reject: [
            "=B2+B3",
            "=AVERAGE(B2:B3)",
            "=SUM(B2:B2)",
            "=SUM(B2:B3)*2",
            "=SUM(120,180)",
            "=SUM(B2:B3)/0",
            "=SUM(B2:B3",
          ],
        },
      },
    ],
    docs: {
      syntax: "=SUM(number1, [number2], ...)",
      explain:
        "Replace this scaffold: the drill here totals B2:B3, and it is the smallest lesson that passes the gate, so the answer, the requirement and both fixture lists already agree with the grader. Write three to five sentences that say what the formula does to this data, why the range stops where it does, and what changes when a month is added. Keep the arithmetic in the explanation, not only the name of the function.",
      errors: [
        {
          code: "#VALUE!",
          text: "A cell in the range holds text where SUM expected a number. Replace this with the failures this drill's function actually returns.",
        },
      ],
      atWork:
        "Replace this scaffold with one sentence about where this shows up in a real workbook — a monthly close, an invoice, a roster.",
      outcome: "Total a column with one function instead of typing every cell.",
      teaches: "SUM",
      dataset: "Units by month",
      reference: "=SUM(B2:B3)",
    },
  };
}

/**
 * Turns the first planned slot — in `group` when one is named — into an authored lesson.
 * Returns what it wrote and where the lesson lands in the published order.
 */
export function scaffoldLesson({ contentDir, lesson, group }) {
  const trackPath = join(contentDir, "track.json");
  const track = readTrack(trackPath);
  const authored = track.lessons.filter((entry) => entry.id !== undefined);

  const used = new Set();
  for (const entry of authored) {
    const match = NUMBERED.exec(entry.id);
    if (match) used.add(Number(match[1]));
  }
  let next = 1;
  while (used.has(next)) next += 1;

  if (lesson !== undefined && lesson !== null) {
    if (!/^\d+$/.test(String(lesson))) {
      throw new Error(`--lesson "${lesson}" is not a number — pass the number the new file will carry, e.g. --lesson ${next}`);
    }
    if (Number(lesson) !== next) {
      throw new Error(
        `lesson ${lesson} cannot be created — ${next} is the next free number, because ids are dense and follow the order lessons were written in`,
      );
    }
  }

  // `null` is the CLI's "no --group given", the same as omitting it.
  const inGroup = group === undefined || group === null ? null : group;
  if (inGroup !== null && !track.groups.some((entry) => entry.id === inGroup)) {
    throw new Error(`no group "${inGroup}" — the catalog has ${track.groups.map((entry) => entry.id).join(", ")}`);
  }

  const slotIndex = track.lessons.findIndex(
    (entry) => entry.id === undefined && (inGroup === null || entry.group === inGroup),
  );
  if (slotIndex === -1) {
    throw new Error(
      inGroup === null
        ? "every slot in the catalog is authored — add a planned slot to track.json before scaffolding one"
        : `group "${inGroup}" has no planned slots left — add one to track.json before scaffolding a lesson in it`,
    );
  }
  const slot = track.lessons[slotIndex];

  const base = slugify(slot.title);
  if (base === "") throw new Error(`title "${slot.title}" has no letters or digits to build a slug from`);
  const taken = usedSlugs(join(contentDir, "exercises"));
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix += 1) slug = `${base}-${suffix}`;

  const id = `${String(next).padStart(2, "0")}-${slug}`;
  const path = join(contentDir, "exercises", `${id}.json`);
  if (existsSync(path)) throw new Error(`content/exercises/${id}.json already exists`);

  // Rank among authored lessons once this slot is one: publishing renumbers what follows it, which
  // is why a lesson's number here is not always the number stamped on its file.
  const published = track.lessons.slice(0, slotIndex).filter((entry) => entry.id !== undefined).length + 1;

  track.lessons[slotIndex] = { id, group: slot.group };
  writeFileSync(path, `${JSON.stringify(skeleton({ id, slug, level: slot.level, title: slot.title }), null, 2)}\n`);
  writeFileSync(trackPath, `${JSON.stringify(track, null, 2)}\n`);

  return {
    id,
    slug,
    title: slot.title,
    group: slot.group,
    level: slot.level,
    number: next,
    published,
    publishedTotal: authored.length + 1,
    slot: slotIndex + 1,
    path: `content/exercises/${id}.json`,
  };
}
