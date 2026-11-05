/**
 * The site's own search: an index built from the content at build time, and the ranking that runs on
 * it in the browser.
 *
 * There is no search service and no network call. The index is a few dozen kilobytes of JSON written
 * into the `/search` page itself, so the page works offline, in the static edition, and with the
 * learner's own words — none of which a hosted search box would give us.
 *
 * Both builds use this module: the static build renders the index into `search/index.html`, and the
 * Next route renders the same bytes from the same function. A search that answered differently in the
 * two editions would be two products.
 */

/**
 * Words people type that are not the words the exercises use. Each is a way of asking for a family of
 * functions, mapped onto the names those exercises carry. Kept short on purpose: this is a vocabulary of
 * intent, not a thesaurus, and an entry that guesses wrong costs more than the term it covers.
 */
const VOCABULARY = {
  lookup: ["vlookup", "xlookup", "hlookup", "index", "match"],
  look: ["vlookup", "xlookup", "index", "match"],
  find: ["find", "search", "match"],
  match: ["match", "xlookup", "vlookup"],
  reference: ["index", "match", "cell"],
  blank: ["counta", "isblank"],
  blanks: ["counta", "isblank"],
  empty: ["counta", "isblank"],
  duplicate: ["unique"],
  duplicates: ["unique"],
  distinct: ["unique"],
  dedupe: ["unique"],
  highest: ["max", "large"],
  lowest: ["min", "small"],
  biggest: ["max", "large"],
  smallest: ["min", "small"],
  largest: ["max", "large"],
  mean: ["average", "median"],
  average: ["average", "median"],
  total: ["sum", "sumif", "subtotal", "aggregate"],
  add: ["sum", "sumif", "sumifs", "sumproduct"],
  subtract: ["sum"],
  count: ["count", "counta", "countif", "countifs"],
  condition: ["if", "countif", "sumif", "ifs", "switch"],
  conditions: ["countifs", "sumifs", "and", "or"],
  test: ["if", "and", "or", "not", "ifs"],
  error: ["iferror", "ifna", "iserror", "isna"],
  errors: ["iferror", "ifna", "iserror", "isna"],
  join: ["textjoin", "concat"],
  concatenate: ["textjoin", "concat"],
  split: ["textbefore", "textafter", "mid", "find"],
  cut: ["left", "right", "mid", "len"],
  spaces: ["trim", "substitute"],
  space: ["trim", "substitute"],
  clean: ["trim", "proper", "substitute"],
  replace: ["substitute"],
  date: ["date", "today", "datedif", "days"],
  dates: ["date", "today", "datedif", "days"],
  month: ["datedif", "date", "eomonth"],
  months: ["datedif", "eomonth"],
  year: ["datedif", "date"],
  years: ["datedif"],
  day: ["datedif", "date", "days"],
  days: ["datedif", "date", "days"],
  today: ["today", "now"],
  money: ["round", "sum", "roundup", "rounddown"],
  decimals: ["round", "roundup", "rounddown", "mround"],
  round: ["round", "roundup", "rounddown", "mround"],
  multiple: ["mround", "floor"],
  rank: ["rank", "large", "small"],
  remove: ["unique", "substitute"],
  deleting: ["unique", "substitute"],
  middle: ["median", "mid"],
  common: ["mode"],
  frequent: ["mode"],
  wildcard: ["wildcard", "countif", "vlookup", "search"],
  wildcards: ["wildcard", "countif", "vlookup", "search"],
  case: ["find", "search", "upper", "lower", "proper"],
  capitals: ["upper", "proper"],
  lowercase: ["lower"],
  uppercase: ["upper"],
  filter: ["filter"],
  sort: ["sort"],
  hidden: ["subtotal", "aggregate"],
  ignore: ["aggregate", "subtotal"],
  percentage: ["sumproduct", "round"],
  multiply: ["sumproduct"],
  variance: ["sumproduct", "budget"],
};

/** Words that carry no signal here, dropped from the query before anything is scored. */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "do",
  "does",
  "for",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "the",
  "then",
  "this",
  "to",
  "value",
  "with",
  "what",
  "when",
  "where",
  "which",
]);

/** Function names as they appear in a written formula: `=XLOOKUP(` and `SUMIFS(` both count. */
function functionNames(text) {
  const names = String(text ?? "").match(/[A-Z][A-Z0-9.]{1,20}(?=\s*\()/g) ?? [];
  return [...new Set(names.map((name) => name.toLowerCase()))];
}

/**
 * The words the page's own copy contributes, capped: the first sentence or two is where an exercise says
 * what it is for, and a whole explanation per entry would double the index for words nobody searches.
 */
function bodyWords(text, limit = 110) {
  // One space-joined string rather than an array of words: the index is shipped inside the page, and
  // the quotes and commas of a JSON array would cost more than the words themselves.
  return ` ${unique(words(text).slice(0, limit)).join(" ")} `;
}

/** Lowercase words, with the punctuation a sentence brings removed. */
export function words(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.!]+/g, " ")
    .split(" ")
    .map((word) => word.replace(/^[.]+|[.]+$/g, ""))
    .filter(Boolean);
}

/**
 * One row per destination: the 88 exercises, the function notes, and the group hubs. `text` is what the
 * learner would say, `terms` is what the entry answers to — the two are kept apart so a query never
 * matches on the word "the" inside a title.
 */
export function buildSearchIndex({ index = [], articles = [], formulas = [], shortcuts = [], groups = [] } = {}) {
  const entries = [];

  for (const entry of index) {
    const exercise = entry.exercise;
    const functions = functionNames(exercise.docs?.syntax);
    entries.push(
      hydrate({
        kind: "drill",
        id: exercise.id,
        title: exercise.title,
        path: entry.path,
        number: entry.number,
        level: entry.level?.name ?? null,
        free: Boolean(entry.free),
        slug: exercise.slug,
        functions,
        text: `${exercise.title} ${exercise.seo?.description ?? ""}`.trim(),
        body: bodyWords(`${exercise.seo?.description ?? ""} ${exercise.docs?.explain ?? ""}`),
      }),
    );
  }

  for (const article of articles) {
    entries.push(
      hydrate({
        kind: "note",
        id: article.slug,
        title: article.title,
        path: `/excel-functions/${article.slug}`,
        slug: article.slug,
        functions: unique([
          ...functionNames(article.syntax ?? article.function ?? ""),
          ...words(article.function ?? ""),
        ]),
        text: `${article.title} ${article.summary ?? ""}`.trim(),
        body: bodyWords(`${article.summary ?? ""} ${article.description ?? ""}`),
      }),
    );
  }

  // A problem page is indexed on the question the reader types, not on the formula: "look up to the
  // left" has to find the INDEX page without the word INDEX anywhere in the query.
  for (const formula of formulas) {
    entries.push(
      hydrate({
        kind: "formula",
        id: formula.slug,
        title: formula.question,
        path: `/formulas/${formula.slug}`,
        slug: formula.slug,
        functions: unique([...functionNames(formula.function ?? ""), ...words(formula.function ?? "")]),
        text: `${formula.question} ${formula.title} ${formula.summary ?? ""}`.trim(),
        body: bodyWords(`${formula.title} ${formula.summary ?? ""} ${formula.description ?? ""}`),
      }),
    );
  }

  // A shortcut page is indexed on the actions in its table rather than on its title: "freeze the top
  // row" has to find the panes page, whose title never says "freeze". The chords go in the body, so
  // someone who half-remembers `Ctrl + Shift + L` can search for the keys instead of the words.
  for (const shortcut of shortcuts) {
    const actions = shortcut.rows.map((row) => row.action).join(" ");
    const keys = shortcut.rows
      .flatMap((row) => Object.values(row.cells ?? {}).map((cell) => (cell.none ? "" : cell.keys)))
      .filter(Boolean)
      .join(" ");
    entries.push(
      hydrate({
        kind: "shortcut",
        id: shortcut.slug,
        title: shortcut.title,
        path: `/shortcuts/${shortcut.slug}`,
        slug: shortcut.slug,
        functions: [],
        text: `${shortcut.title} ${shortcut.summary ?? ""} ${actions}`.trim(),
        body: bodyWords(`${shortcut.summary ?? ""} ${shortcut.description ?? ""} ${actions} ${keys}`),
      }),
    );
  }

  for (const group of groups) {
    entries.push(
      hydrate({
        kind: "group",
        id: group.id,
        title: group.title,
        path: `/learn/groups/${group.id}`,
        slug: group.id,
        functions: [],
        text: group.intro ?? "",
        body: bodyWords(group.intro ?? ""),
      }),
    );
  }

  return entries;
}

function unique(list) {
  return [...new Set(list)];
}

/**
 * The shipped row: the facts, none of the derived words. `title`, `terms` and `titleWords` are rebuilt
 * in the browser by `hydrate` from the row itself, which keeps the index a third smaller than shipping
 * every entry's token list twice.
 */
export function serializeIndex(entries) {
  return entries.map(({ kind, id, title, path, number, level, free, slug, functions, text, body }) => ({
    kind,
    id,
    title,
    path,
    ...(number === undefined ? {} : { number }),
    ...(level === undefined ? {} : { level }),
    ...(free === undefined ? {} : { free }),
    ...(slug === undefined ? {} : { slug }),
    ...(functions === undefined || functions.length === 0 ? {} : { functions }),
    text,
    body,
  }));
}

/** A shipped row back into the entry the ranker needs. */
export function hydrate(row) {
  const titleWords = unique(words(row.title));
  return {
    ...row,
    functions: row.functions ?? [],
    titleWords,
    terms: unique([
      ...titleWords,
      ...words(String(row.slug ?? "").replace(/-/g, " ")),
      ...(row.functions ?? []),
      ...words(row.level ?? ""),
    ]),
  };
}

/** The whole index, from its shipped form. */
export function loadIndex(rows) {
  return rows.map(hydrate);
}

/** The query as scored: stopwords gone, every word expanded to the names it could mean. */
export function queryTerms(query) {
  return words(query)
    .filter((word) => !STOPWORDS.has(word))
    .map((word) => ({ word, options: unique([word, ...(VOCABULARY[word] ?? [])]) }));
}

/**
 * How well one entry answers one word. A function name or a title word is the strongest landing; a
 * vocabulary expansion is deliberately weaker, because it earned its place by meaning something close
 * rather than by appearing on the page.
 */
/** A whole word of the page copy, not a fragment: "sum" must not match "summary". */
function inBody(body, word) {
  return typeof body === "string" && body.includes(` ${word} `);
}

function weigh(entry, word, options) {
  let best = 0;
  const title = entry.titleWords ?? [];
  for (const option of options) {
    if (option !== word) {
      // A vocabulary expansion earned its place by meaning something close, so it lands below the word
      // itself. It still beats a title word only when it names a function: "blanks" landing on COUNTA
      // is a better answer than "count" landing on a summary page that happens to mention blanks.
      // Where the expansion lands matters too: an exercise named after the thing the learner meant ("blanks"
      // → COUNTA) is a better answer than one that merely lists it among the functions it uses.
      if (title.includes(option)) best = Math.max(best, 5);
      else if (entry.terms.includes(option)) best = Math.max(best, 4);
      else if (inBody(entry.body, option)) best = Math.max(best, 2);
      continue;
    }
    // The title is what the exercise is called; the function list is what it uses. Both are strong, but
    // the title is how a learner will name it, so a title word outranks a function that merely
    // appears in the formula.
    if (title.includes(word)) best = Math.max(best, 7);
    else if (entry.terms.includes(word)) best = Math.max(best, 5);
    else if (word.length >= 4 && entry.terms.some((term) => term.startsWith(word))) best = Math.max(best, 3);
    // The page's own copy is published too, so a word from it counts — one notch weaker again.
    else if (inBody(entry.body, word)) best = Math.max(best, 2);
  }
  return best;
}

/**
 * Score one entry against a query.
 *
 * Every word has to land somewhere: a result that ignores what the learner typed is a near miss, not
 * an answer, and a search box that returns near misses teaches people not to use it. The weights then
 * say what a strong landing looks like — a function name or a title word beats a vocabulary match, and
 * an entry that carries the words in its title outranks one that merely starts with them.
 */
function score(entry, terms) {
  let total = 0;
  for (const { word, options } of terms) {
    const weight = weigh(entry, word, options);
    if (weight === 0) return 0;
    total += weight;
  }
  return total;
}

/** An exercise outranks a note or a group when everything else about them is equal. */
const KIND_RANK = { drill: 0, note: 1, group: 2 };

/**
 * The ranked answer to a query. Ties break by exact title, then kind, then title, so the same query
 * always produces the same list: a result that reorders between two identical searches reads as a bug.
 *
 * Exact title comes before score because a note titled "VLOOKUP in Excel, exact match first" scores
 * the same as the exercise called "VLOOKUP: exact match" — every word of the query lands in both titles.
 * When someone types an exercise's name, the exercise is the answer, not the essay about it.
 */
export function search(query, entries, { limit = 110 } = {}) {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const asked = words(query).join(" ");
  const exact = (entry) => ((entry.titleWords ?? []).join(" ") === asked ? 1 : 0);
  return entries
    .map((entry) => ({ entry, score: score(entry, terms) }))
    .filter((hit) => hit.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        exact(b.entry) - exact(a.entry) ||
        (KIND_RANK[a.entry.kind] ?? 3) - (KIND_RANK[b.entry.kind] ?? 3) ||
        a.entry.title.localeCompare(b.entry.title),
    )
    .slice(0, limit)
    .map((hit) => ({ ...hit.entry, score: hit.score }));
}
