/**
 * The copy gate.
 *
 * `content` decides whether a lesson renders, `content-lint` decides whether it ships. This decides
 * whether it *reads like a person wrote it*: no marketing vocabulary, no em dashes standing in for a
 * thought, no sentences that need a second pass, no two lessons sharing a third of their sentences,
 * and a title and description per lesson that a search result can actually show.
 *
 * Everything here is advisory by default and blocking under `--strict`, because a rewrite in progress
 * is not a broken build. The ruleset itself lives in `data/copy-rules.json` so that a phrase can be
 * argued about in a diff rather than in code.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadContent } from "../content/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

export const RULES_PATH = join(HERE, "data", "copy-rules.json");

/** Fields a lesson visitor reads as prose, as opposed to the formula they type. */
const PROSE_FIELDS = new Set(["docs.explain", "docs.atWork", "docs.outcome", "docs.syntax"]);

/** Characters that are almost always a sign the text came out of a generator, not a keyboard. */
const TYPOGRAPHY = [
  { source: "\u2014", name: "em dash", fix: "use a comma, a full stop, or a colon" },
  { source: "\u2013", name: "en dash", fix: "write 'to' for a range" },
  { source: "[\u201c\u201d]", name: "curly double quote", fix: "use a straight quote" },
  { source: "[\u2018\u2019]", name: "curly apostrophe", fix: "use a straight apostrophe" },
  { source: "\u2026", name: "ellipsis character", fix: "use three full stops or finish the sentence" },
  { source: "\u00a0", name: "non-breaking space", fix: "use a normal space" },
];

const EMOJI = /\p{Extended_Pictographic}/u;

export function loadRules(path = RULES_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Split on sentence enders followed by a capital, and on line breaks, which are list items here. A
 * sentence that opens with inline code starts with a backtick, not a capital, so the backtick counts
 * as a sentence opener too; without it "…returns 0. `TRIM` fixes it" reads as one 40-word sentence.
 */
export function splitSentences(text) {
  return String(text)
    .split(/\n+/)
    // A sentence can open with a capital, a digit, a quote, a bracket, inline code, or an Excel error
    // code: `#REF!` after a full stop starts a new sentence, and missing that merges two into one long
    // one that is then reported for a length it does not have.
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[`#])/))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function words(text) {
  return String(text).match(/\S+/g) ?? [];
}

/**
 * Vowel groups, with the usual English corrections: a silent final `e`, `ed`, and a leading `y` that
 * is really a consonant. It is a heuristic, and it is the same heuristic the Flesch formula assumes.
 */
export function countSyllables(token) {
  const word = token.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length === 0) return 0;
  if (word.length <= 3) return 1;
  const trimmed = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Flesch reading ease. Higher is simpler; 60 is plain English, 30 is academic. */
export function readingEase(text) {
  const tokens = words(text);
  const sentenceCount = Math.max(1, splitSentences(text).length);
  if (tokens.length === 0) return { ease: 100, tokens: 0, sentenceCount, meanWords: 0, syllables: 0 };
  const syllables = tokens.reduce((total, token) => total + countSyllables(token), 0);
  const mean = tokens.length / sentenceCount;
  const ease = 206.835 - 1.015 * mean - 84.6 * (syllables / tokens.length);
  return {
    ease: Math.round(ease * 10) / 10,
    tokens: tokens.length,
    sentenceCount,
    meanWords: Math.round(mean * 10) / 10,
    syllables,
  };
}

/** A short window around a match, so a report line is actionable without opening the file. */
function excerpt(text, index, length) {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 40);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "..." : ""}${slice}${end < text.length ? "..." : ""}`;
}

export function findBanned(text, rules) {
  const hits = [];
  const lower = String(text).toLowerCase();
  for (const entry of rules.bannedPhrases) {
    const needle = entry.phrase.toLowerCase();
    let at = lower.indexOf(needle);
    while (at !== -1) {
      hits.push({ ...entry, at, match: text.slice(at, at + entry.phrase.length) });
      at = lower.indexOf(needle, at + needle.length);
    }
  }
  for (const entry of rules.bannedOpeners) {
    if (lower.startsWith(entry.phrase.toLowerCase())) hits.push({ ...entry, at: 0, match: entry.phrase });
  }
  return hits.sort((a, b) => a.at - b.at);
}

export function findTypography(text) {
  const hits = [];
  for (const rule of TYPOGRAPHY) {
    const pattern = new RegExp(rule.source, "g");
    for (const match of String(text).matchAll(pattern)) {
      hits.push({ ...rule, at: match.index, match: match[0] });
    }
  }
  if (EMOJI.test(text)) {
    const index = String(text).search(EMOJI);
    hits.push({ name: "emoji", fix: "remove it; a lesson has no decoration", at: index, match: text[index] });
  }
  return hits.sort((a, b) => a.at - b.at);
}

/**
 * Runs every text rule over one field. `prose` decides whether the sentence-length and readability
 * rules apply, since a prompt is one imperative sentence naming a range and is allowed to be dense.
 */
export function checkText(text, { field, where, prose, rules }) {
  if (typeof text !== "string" || text.trim() === "") return { findings: [], stats: null };
  const findings = [];

  for (const hit of findBanned(text, rules)) {
    findings.push({
      rule: "banned-phrase",
      severity: "error",
      field,
      where,
      message: `"${hit.match}" — ${hit.why}`,
      excerpt: excerpt(text, hit.at, hit.match.length),
    });
  }

  for (const hit of findTypography(text)) {
    findings.push({
      rule: "typography",
      severity: "error",
      field,
      where,
      message: `${hit.name} — ${hit.fix}`,
      excerpt: excerpt(text, hit.at, hit.match.length),
    });
  }

  if (prose) {
    const sentences = splitSentences(text);
    for (const sentence of sentences) {
      const length = words(sentence).length;
      if (length > rules.sentence.maxWords) {
        findings.push({
          rule: "long-sentence",
          severity: "warn",
          field,
          where,
          message: `sentence of ${length} words — split it; ${rules.sentence.why}`,
          excerpt: excerpt(sentence, 0, sentence.length),
        });
      }
    }
    if (sentences.length >= 3) {
      const ease = readingEase(text);
      if (ease.ease < rules.flesch.min) {
        findings.push({
          rule: "reading-ease",
          severity: "warn",
          field,
          where,
          message: `Flesch ${ease.ease} is below ${rules.flesch.min} — ${rules.flesch.why}`,
          excerpt: excerpt(text, 0, 60),
        });
      }
      if (ease.meanWords > rules.sentence.maxMeanWords) {
        findings.push({
          rule: "mean-sentence",
          severity: "warn",
          field,
          where,
          message: `average sentence is ${ease.meanWords} words, over ${rules.sentence.maxMeanWords}`,
          excerpt: excerpt(text, 0, 60),
        });
      }
    }
  }

  return { findings, stats: readingEase(text) };
}

/** One lesson as an ordered list of fields, prose first so a report reads like the page. */
export function lessonFields(lesson) {
  const fields = [{ field: "title", text: lesson.title, prose: false }];
  const docs = lesson.docs ?? {};
  for (const key of ["explain", "atWork", "outcome"]) {
    if (docs[key]) fields.push({ field: `docs.${key}`, text: docs[key], prose: true });
  }
  for (const [index, error] of (docs.errors ?? []).entries()) {
    if (error?.text) fields.push({ field: `docs.errors[${index}].text`, text: error.text, prose: true });
  }
  for (const [index, screen] of (lesson.screens ?? []).entries()) {
    const label = (lesson.screens.length > 1 ? `screens[${index}]` : "screens[0]");
    if (screen.prompt) fields.push({ field: `${label}.prompt`, text: screen.prompt, prose: false });
    for (const [key, hint] of Object.entries(screen.hints ?? {})) {
      if (typeof hint === "string") fields.push({ field: `${label}.hints.${key}`, text: hint, prose: false });
    }
  }
  if (lesson.seo?.title) fields.push({ field: "seo.title", text: lesson.seo.title, prose: false });
  if (lesson.seo?.description) fields.push({ field: "seo.description", text: lesson.seo.description, prose: false });
  return fields;
}

/** Every group's intro, in catalog order, so the same rules apply to the hub pages. */
export function groupFields(track) {
  const fields = [];
  if (track.promise) fields.push({ field: "track.promise", text: track.promise, prose: true });
  for (const group of track.groups ?? []) {
    if (group.summary) fields.push({ field: `groups.${group.id}.summary`, text: group.summary, prose: false });
    if (group.intro) fields.push({ field: `groups.${group.id}.intro`, text: group.intro, prose: true });
  }
  return fields;
}

/** Five-word runs, so near-duplicate lessons are caught even when the sentences are reworded a little. */
export function shingles(text, size) {
  const tokens = words(String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " "));
  const set = new Set();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    set.add(tokens.slice(index, index + size).join(" "));
  }
  return set;
}

function overlap(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size === 0) return 0;
  let shared = 0;
  for (const entry of small) if (large.has(entry)) shared += 1;
  return shared / small.size;
}

function checkSeoFields(lesson, { where, rules, report }) {
  const id = lesson.id;
  const title = lesson.seo?.title;
  const description = lesson.seo?.description;

  if (!title) {
    report.warn(where, `${id} has no seo.title — a search result needs a title that names the function`);
  } else if (title.length < rules.seoTitle.minChars || title.length > rules.seoTitle.maxChars) {
    report.warn(where, `${id} seo.title is ${title.length} characters; keep it ${rules.seoTitle.minChars}-${rules.seoTitle.maxChars}`);
  }

  if (!description) {
    report.warn(where, `${id} has no seo.description — the result snippet falls back to the first sentence of the page`);
  } else if (description.length < rules.seoDescription.minChars || description.length > rules.seoDescription.maxChars) {
    report.warn(
      where,
      `${id} seo.description is ${description.length} characters; keep it ${rules.seoDescription.minChars}-${rules.seoDescription.maxChars}`,
    );
  }

  if (!lesson.updated) report.warn(where, `${id} has no updated date, so dateModified claims nothing`);
}

/**
 * The whole report. Returns findings plus the numbers a rewrite is measured against, so a before and
 * after can be compared without re-reading 88 lessons by hand.
 */
export function lintCopy(contentDir, { rules = loadRules() } = {}) {
  const findings = [];
  const lessons = [];
  const content = loadContent(contentDir);

  const push = (finding) => findings.push(finding);

  for (const lesson of content.exercises) {
    const where = `content/exercises/${lesson.id}.json`;
    let lessonEase = [];
    for (const field of lessonFields(lesson)) {
      const result = checkText(field.text, { field: field.field, where, prose: field.prose, rules });
      for (const finding of result.findings) push(finding);
      if (field.prose && result.stats && result.stats.tokens >= 40) lessonEase.push(result.stats.ease);
    }

    const warn = (where, message) => push({ rule: "seo-field", severity: "warn", field: "seo", where, message, excerpt: null });
    checkSeoFields(lesson, { where, rules, report: { warn } });

    const ease = lessonEase.length
      ? Math.round((lessonEase.reduce((a, b) => a + b, 0) / lessonEase.length) * 10) / 10
      : null;
    lessons.push({ id: lesson.id, ease, proseFields: lessonEase.length });
  }

  for (const field of groupFields(content.track)) {
    const result = checkText(field.text, { field: field.field, where: "content/track.json", prose: field.prose, rules });
    for (const finding of result.findings) push(finding);
  }

  const duplicates = (key, label) => {
    const seen = new Map();
    for (const lesson of content.exercises) {
      const value = key(lesson);
      if (!value) continue;
      const normalised = value.trim().toLowerCase();
      if (seen.has(normalised)) {
        push({
          rule: "duplicate-seo",
          severity: "error",
          field: "seo",
          where: `content/exercises/${lesson.id}.json`,
          message: `${label} repeats ${seen.get(normalised)} — every lesson owns its own`,
          excerpt: value,
        });
      } else {
        seen.set(normalised, lesson.id);
      }
    }
  };
  duplicates((lesson) => lesson.seo?.title, "seo.title");
  duplicates((lesson) => lesson.seo?.description, "seo.description");

  const overlaps = [];
  const size = rules.shingle.size;
  const sets = content.exercises.map((lesson) => {
    const prose = lessonFields(lesson)
      .filter((field) => field.prose)
      .map((field) => field.text)
      .join("\n");
    return { id: lesson.id, set: shingles(prose, size) };
  });
  for (let a = 0; a < sets.length; a += 1) {
    for (let b = a + 1; b < sets.length; b += 1) {
      const ratio = overlap(sets[a].set, sets[b].set);
      if (ratio > rules.shingle.maxOverlap) {
        overlaps.push({ a: sets[a].id, b: sets[b].id, ratio: Math.round(ratio * 100) / 100 });
        push({
          rule: "duplicate-prose",
          severity: "warn",
          field: "docs",
          where: `content/exercises/${sets[b].id}.json`,
          message: `${Math.round(ratio * 100)}% of its ${size}-word runs also appear in ${sets[a].id} — ${rules.shingle.why}`,
          excerpt: null,
        });
      }
    }
  }

  const byRule = {};
  for (const finding of findings) byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1;
  const eases = lessons.map((lesson) => lesson.ease).filter((ease) => ease !== null);

  return {
    findings,
    lessons,
    overlaps,
    stats: {
      lessons: content.exercises.length,
      groups: content.track.groups?.length ?? 0,
      findings: findings.length,
      errors: findings.filter((finding) => finding.severity === "error").length,
      byRule,
      ease: {
        min: eases.length ? Math.min(...eases) : null,
        max: eases.length ? Math.max(...eases) : null,
        mean: eases.length ? Math.round((eases.reduce((a, b) => a + b, 0) / eases.length) * 10) / 10 : null,
      },
      missingSeoTitle: content.exercises.filter((lesson) => !lesson.seo?.title).length,
      missingSeoDescription: content.exercises.filter((lesson) => !lesson.seo?.description).length,
      missingUpdated: content.exercises.filter((lesson) => !lesson.updated).length,
    },
  };
}
