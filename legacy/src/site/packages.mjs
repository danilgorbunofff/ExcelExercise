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
    import("../../../packages/progress/index.js"),
    import("../../../packages/keys/index.js"),
    import("../../../packages/sheet/index.js"),
    import("../../../packages/search/index.js"),
    import("../../../packages/content/markdown.js"),
    import("../../../packages/content/articles.js"),
    import("../../../packages/content/formulas.js"),
    import("../../../packages/content/shortcuts.js"),
  ]);
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
  throw new Error(
    "packages/ is missing: the build reads the grader, the content loader, the progress model, the " +
      "keyboard model, the sheet model and the search engine from " +
      "../packages/, so legacy/ and packages/ must sit side by side (see README, Architecture)",
    { cause: error },
  );
}

const [grader, content, progress, keys, sheet, searchPkg, markdown, articles, formulas, shortcuts] = packages;

export const { KNOWN_FUNCTIONS, addressOf, buildCells, compute, indexToCol, isFormulaError, parseRef } = grader;
export const { LEVELS, loadContent, referenceOf, revealOf, screenAt, validateLesson } = content;
export const { BADGES, BADGE_LABELS, badgeFor, nextCopy, summarise, summaryLine } = progress;
export const { chordText, isReserved, labelsOf, parseChord, parsePress } = keys;
export const { cellAt, gridModel, moveSelection, startCell } = sheet;
export const { buildSearchIndex, hydrate, loadIndex, queryTerms, search, serializeIndex, words } = searchPkg;
export const { headingId, parseMarkdown, sectionIds, wordCount } = markdown;
export const { REQUIRED_SECTIONS, articleProblems, loadArticles, parseArticle } = articles;
export const { FAMILIES, loadFormulas, parseFormula, formulaProblems } = formulas;
export const {
  FAMILIES: SHORTCUT_FAMILIES,
  PLATFORMS: SHORTCUT_PLATFORMS,
  PLATFORM_TITLES,
  loadShortcuts,
  parseKeyCell,
  parseShortcut,
  shortcutProblems,
} = shortcuts;
