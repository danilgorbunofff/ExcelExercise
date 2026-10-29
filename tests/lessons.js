/**
 * The shipped corpus, in the shapes the tests need.
 *
 * Lesson files are schema v2: the drill lives on `screens[]`. `exercise` here is the lesson with its
 * first screen lifted beside its own fields, which is the object a single-screen surface grades and
 * renders, so a test that wants "the drill for lesson 1" does not have to know about `screens`.
 *
 * `toV1` writes the same lesson the old way — the drill's fields flat on the lesson — because that
 * shape is still readable during the deprecation window and is what a validator test wants to mutate
 * one field at a time.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeLesson, screenAt } from "../packages/content/schema.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const LESSON_DIR = join(ROOT, "legacy", "content", "exercises");
export const CONTENT_DIR = join(ROOT, "legacy", "content");

/** The drill fields, in the order the schema lists them. `fixtures` is absent: a v1 lesson keeps those in a sidecar. */
const V1_FIELDS = ["prompt", "grid", "answerCell", "expect", "require", "forbid", "requireRef", "rules", "hints"];

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export const lessonFiles = readdirSync(LESSON_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort();

export const readRawLesson = (name) => readJson(join(LESSON_DIR, name));

/** The lesson file written as a v1 lesson: drill fields at the top level, no `screens`, no version. */
export function toV1(raw) {
  if (!raw.screens) return raw;
  const { id, slug, level, title, docs, screens } = raw;
  const flat = { id, slug, level, title };
  for (const field of V1_FIELDS) {
    if (screens[0][field] !== undefined) flat[field] = screens[0][field];
  }
  flat.docs = docs;
  return flat;
}

export function loadLesson(name) {
  const raw = readRawLesson(name);
  const lesson = normalizeLesson(raw, name);
  const screen = screenAt(lesson, 0);
  const fixtures = screen.fixtures ?? { accept: [], reject: [] };
  const { screens, schemaVersion, ...identity } = lesson;
  const { id: screenId, type, ...drill } = screen;
  return {
    name,
    raw,
    lesson,
    screen,
    // The single-screen view: lesson identity and docs, plus everything the grader reads. The
    // screen's own `id` and `type` stay behind — a single-screen surface never shows them.
    exercise: { ...identity, ...drill },
    fixture: { accepted: fixtures.accept ?? [], rejected: fixtures.reject ?? [] },
  };
}

export const LESSONS = lessonFiles.map(loadLesson);
