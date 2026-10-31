import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  LEVELS,
  SCHEMA_VERSION,
  SCREEN_TYPES,
  failAt,
  normalizeLesson,
  normalizeTrack,
  referenceOf,
  revealOf,
  screenAt,
} from "./schema.js";

export { LEVELS, SCHEMA_VERSION, SCREEN_TYPES, normalizeLesson, normalizeTrack, referenceOf, revealOf, screenAt };
export { headingId, parseMarkdown, sectionIds, wordCount } from "./markdown.js";
export { REQUIRED_SECTIONS, articleProblems, loadArticles, parseArticle } from "./articles.js";

/** Kept as the public name of the lesson gate: everything that read it before still does. */
export const validateLesson = normalizeLesson;

function readJson(path, label) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`content/${label}: cannot read (${error.code ?? error.message})`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`content/${label}: invalid JSON (${error.message})`);
  }
}

export function loadContent(contentDir) {
  const track = normalizeTrack(readJson(join(contentDir, "track.json"), "track.json"), "track.json");

  const dir = join(contentDir, "exercises");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const exercises = files.map((file) => validateLesson(readJson(join(dir, file), `exercises/${file}`), file));

  const byId = new Map();
  const bySlug = new Map();
  for (const exercise of exercises) {
    if (byId.has(exercise.id)) failAt(`exercises/${exercise.id}.json`, `duplicate id`);
    if (bySlug.has(exercise.slug)) failAt(`exercises/${exercise.id}.json`, `duplicate slug "${exercise.slug}"`);
    byId.set(exercise.id, exercise);
    bySlug.set(exercise.slug, exercise);
  }

  const authored = track.lessons.filter((entry) => !entry.planned);
  const listed = new Set();
  for (const entry of authored) {
    if (listed.has(entry.id)) failAt("track.json", `lessons lists "${entry.id}" twice`);
    listed.add(entry.id);
    if (!byId.has(entry.id)) failAt("track.json", `lessons lists "${entry.id}" but content/exercises/${entry.id}.json does not exist`);
  }
  for (const exercise of exercises) {
    if (!listed.has(exercise.id)) {
      failAt(`exercises/${exercise.id}.json`, "is not listed in track.json lessons — it would never be linked");
    }
  }

  const ordered = authored.map((entry) => byId.get(entry.id));

  return { track, exercises: ordered };
}
