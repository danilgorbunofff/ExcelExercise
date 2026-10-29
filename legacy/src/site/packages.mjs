/**
 * The one place the build reaches for `packages/`, which sits one directory above `legacy/`.
 * Importing those paths directly from each caller means a copy of `legacy/` that travelled without the
 * packages dies inside the module graph with a bare `ERR_MODULE_NOT_FOUND` pointing at a path nobody
 * typed — so the imports happen once, lazily, and the failure names what is actually missing.
 */
let packages;
try {
  packages = await Promise.all([
    import("../../../packages/grader/index.js"),
    import("../../../packages/content/index.js"),
  ]);
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
  throw new Error(
    "packages/ is missing: the build reads the grader and the content loader from ../packages/, so " +
      "legacy/ and packages/ must sit side by side (see README, Architecture)",
    { cause: error },
  );
}

const [grader, content] = packages;

export const { KNOWN_FUNCTIONS, addressOf, indexToCol, parseRef } = grader;
export const { LEVELS, loadContent, screenAt, validateLesson } = content;
