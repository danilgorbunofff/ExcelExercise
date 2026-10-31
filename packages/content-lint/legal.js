/**
 * The legal-page gate.
 *
 * `/privacy` and `/terms` are the only pages on this site that make promises on the site's behalf, and
 * they are the only pages nothing else checks: they render, they are linked, and a sentence in them can
 * be false without any test noticing. A privacy page that mentions a cohort programme this site does
 * not have is not a typo, it is a claim a reader may rely on.
 *
 * So the copy is linted like the lessons are: the four commercial shapes this site does not have are
 * refused, the typography rules that apply to every other page apply here, every section the document
 * is supposed to carry has to be present, and the two Next routes may not hold prose of their own that
 * bypasses `legalSections()`. The prose itself stays in `legacy/src/site/legal-page.mjs`, which both
 * builds print.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { legalSections, RETENTION } from "../../legacy/src/site/legal-page.mjs";
import { findTypography, splitSentences } from "./copy.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * What this site does not sell. Each entry names the claim and the words that would make it: the
 * ruling is that there are no organisations, universities, cohorts, referrals or institutional seats,
 * so a page that offers one is describing a different product.
 */
const BANNED = [
  { name: "organizations", pattern: /\borgani[sz]ations?\b/i, why: "the site sells to individuals only" },
  { name: "universities", pattern: /\buniversit(y|ies)\b/i, why: "there is no institutional or academic programme" },
  { name: "cohorts", pattern: /\bcohorts?\b/i, why: "there are no cohorts; learners are not grouped" },
  { name: "referrals", pattern: /\breferr(als?|ing)\b/i, why: "there is no referral programme" },
  { name: "institutional seats", pattern: /\b(institutional|institution)|\bseats?\b/i, why: "nothing is sold by the seat" },
  { name: "classrooms", pattern: /\bclassrooms?\b|\bschools?\b|\bcampus\b/i, why: "there is no classroom or school edition" },
];

/** The sections each document must carry. A missing one is a missing promise, not a style choice. */
const REQUIRED = {
  privacy: ["short", "browser", "account", "cookies", "never", "export", "delete", "contact"],
  terms: ["what", "price", "account", "fair-use", "grading", "ending", "status"],
};

/** The two Next routes, which must print the shared document rather than a copy of it. */
const ROUTES = ["app/privacy/page.js", "app/terms/page.js"];

const text = (html) =>
  html
    // A block end is a sentence end: without this, a stripped `<dl>` reads as one 133-word sentence.
    .replace(/<\/(p|li|dd)>/g, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** Comments are not rendered, and the ones in these files discuss the words on purpose. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export function lintLegal({ config, track, root = ROOT }) {
  return lintDocuments({ documents: legalSections({ config, track }), root });
}

/** The lint itself, over documents rather than over the module, so a test can plant a claim. */
export function lintDocuments({ documents, root = ROOT }) {
  const findings = [];
  const add = (where, field, message, severity = "error") => findings.push({ where, field, message, severity });

  for (const [kind, document] of Object.entries(documents)) {
    const where = `${kind}.md`;
    const ids = document.sections.map((section) => section.id);
    for (const id of REQUIRED[kind] ?? []) {
      if (!ids.includes(id)) add(where, "section", `the "${id}" section is missing`);
    }
    if (new Set(ids).size !== ids.length) add(where, "section", "a section id is used twice");

    const fields = [
      ["h1", document.h1],
      ["lede", document.lede],
      ["description", document.description],
      ["badge", document.badge],
      ...document.sections.flatMap((section) => [
        [`${section.id}.heading`, section.heading],
        [`${section.id}.html`, text(section.html)],
      ]),
    ];

    for (const [field, value] of fields) {
      for (const rule of BANNED) {
        const match = String(value).match(rule.pattern);
        if (match) {
          add(where, field, `"${match[0]}" — ${rule.why}`);
        }
      }
      for (const hit of findTypography(String(value))) {
        add(where, field, `${hit.name}: ${hit.fix}`);
      }
      for (const sentence of splitSentences(String(value))) {
        if (String(sentence).split(/\s+/).length > 45) {
          add(where, field, `a ${String(sentence).split(/\s+/).length}-word sentence: split it`, "warning");
        }
      }
    }

    // A retention list is a promise about the database, so every row has to say what it keeps and why.
    if (kind === "privacy") {
      for (const row of RETENTION) {
        for (const key of ["what", "keeps", "because"]) {
          if (typeof row[key] !== "string" || row[key].trim() === "") add(where, "retention", `a row has no "${key}"`);
        }
        if (!text(documents.privacy.sections.find((section) => section.id === "delete")?.html ?? "").includes(row.what)) {
          add(where, "delete", `the deletion section does not mention "${row.what}"`);
        }
      }
      if (RETENTION.length === 0) add(where, "retention", "nothing survives a deletion, so nothing is listed");
    }
  }

  // The Next routes print the shared document. A prose literal long enough to be a sentence is copy
  // that bypasses the lint above, and the metadata beside it can then describe a different page.
  for (const route of ROUTES) {
    const source = stripComments(readFileSync(join(root, route), "utf8"));
    if (!source.includes("prepareLegalPage")) add(route, "copy", "does not print the shared legal document");
    for (const literal of source.matchAll(/["'`]([^"'`\n]{40,})["'`]/g)) {
      const words = literal[1].replace(/\$\{[^}]*\}/g, "").trim().split(/\s+/).filter(Boolean);
      if (words.length >= 8) add(route, "copy", `carries ${words.length} words of its own: "${words.slice(0, 8).join(" ")}…"`);
    }
  }

  const errors = findings.filter((finding) => finding.severity === "error").length;
  return {
    ok: errors === 0,
    findings,
    stats: { documents: Object.keys(documents).length, sections: Object.values(documents).reduce((total, doc) => total + doc.sections.length, 0), retention: RETENTION.length, errors },
  };
}
