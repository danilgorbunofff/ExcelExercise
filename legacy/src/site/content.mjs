/**
 * The static site's view of the content: the validated track and lessons from `packages/content/`,
 * plus the navigation shape these pages need. URLs and prev/next belong to the renderer, so they are
 * derived here rather than baked into the package.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  LEVELS,
  loadArticles as loadArticlesFromPackage,
  loadContent as loadFromPackage,
  loadFormulas as loadFormulasFromPackage,
  loadShortcuts as loadShortcutsFromPackage,
} from "./packages.mjs";

export { LEVELS };

/**
 * The notes, in slug order. The folder is optional: a site with no notes yet is a complete site, and a
 * build that fails because a content folder is empty teaches nothing.
 */
export function loadArticles(contentDir) {
  const dir = join(contentDir, "articles");
  return existsSync(dir) ? loadArticlesFromPackage(dir) : [];
}

/**
 * The problem pages, in slug order. Optional for the same reason the notes are: a site with none yet
 * is a complete site, and the build must not fail on a folder that has not been written.
 */
export function loadFormulas(contentDir) {
  const dir = join(contentDir, "formulas");
  return existsSync(dir) ? loadFormulasFromPackage(dir) : [];
}

/**
 * The shortcut pages, ordered by family. Optional like the other silos: the shortcuts folder can be
 * absent, or still be being written, without the rest of the site failing to build.
 */
export function loadShortcuts(contentDir) {
  const dir = join(contentDir, "shortcuts");
  return existsSync(dir) ? loadShortcutsFromPackage(dir) : [];
}

export function loadContent(contentDir) {
  const { track, exercises } = loadFromPackage(contentDir);
  // Group membership lives on the catalogue slot, not on the lesson file: a lesson written into an
  // earlier slot joins that slot's group, which is what the dashboard's sections are keyed on.
  const groupOf = new Map(track.lessons.filter((slot) => slot.id).map((slot) => [slot.id, slot.group ?? null]));
  // Free is a membership test against the curated list, not a position: the free ten are scattered
  // through the catalog on purpose, so `number <= freeLessonCount` would open the wrong ones.
  const freeSet = new Set(track.freeLessons);

  const index = exercises.map((exercise, position) => {
    const number = position + 1;
    const last = position === exercises.length - 1;
    const prev = position > 0 ? exercises[position - 1] : null;
    const next = last ? null : exercises[position + 1];
    return {
      exercise,
      number,
      level: LEVELS[exercise.level],
      free: freeSet.has(exercise.id),
      group: groupOf.get(exercise.id) ?? null,
      slug: exercise.slug,
      path: `/excel/${exercise.slug}`,
      prev,
      prevPath: prev ? `/excel/${prev.slug}` : "/",
      prevLabel: prev ? prev.title : "All exercises",
      next,
      nextPath: next ? `/excel/${next.slug}` : null,
    };
  });

  // Where the prompt sits: a number rather than an id, because the client asks "is this the position that
  // asks once?" and should not have to carry the id around. `null` when the track names no prompt lesson.
  const promptAt = track.promptLesson ? index.find((entry) => entry.exercise.id === track.promptLesson)?.number ?? null : null;

  return { track: { ...track, promptAt }, exercises, index };
}
