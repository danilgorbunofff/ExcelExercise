/**
 * The static site's view of the content: the validated track and lessons from `packages/content/`,
 * plus the navigation shape these pages need. URLs and prev/next belong to the renderer, so they are
 * derived here rather than baked into the package.
 */
import { LEVELS, loadContent as loadFromPackage } from "./packages.mjs";

export { LEVELS };

export function loadContent(contentDir) {
  const { track, exercises } = loadFromPackage(contentDir);
  // Group membership lives on the catalogue slot, not on the lesson file: a lesson written into an
  // earlier slot joins that slot's group, which is what the dashboard's sections are keyed on.
  const groupOf = new Map(track.lessons.filter((slot) => slot.id).map((slot) => [slot.id, slot.group ?? null]));

  return {
    track,
    exercises,
    index: exercises.map((exercise, position) => {
      const number = position + 1;
      const last = position === exercises.length - 1;
      const prev = position > 0 ? exercises[position - 1] : null;
      const next = last ? null : exercises[position + 1];
      return {
        exercise,
        number,
        level: LEVELS[exercise.level],
        free: number <= track.freeLessonCount,
        group: groupOf.get(exercise.id) ?? null,
        slug: exercise.slug,
        path: `/excel/${exercise.slug}`,
        prev,
        prevPath: prev ? `/excel/${prev.slug}` : "/",
        prevLabel: prev ? prev.title : "All drills",
        next,
        nextPath: next ? `/excel/${next.slug}` : null,
      };
    }),
  };
}
