/**
 * `/privacy` and `/terms`, as pages: the same markup in the static build and in Next, from the same
 * functions, so the sentence a learner reads in either build is one sentence in one place.
 *
 * Two things this module is not:
 *
 * * It is not the reference site's legal text. `reference/excelexercises-mirror/privacy.html` runs to
 *   fifteen sections of App Factory, LLC boilerplate about Privacy Shield and arbitration clauses, in
 *   a jurisdiction this project has no relationship with. Copying it would put claims on the page that
 *   are false about this code — there is no analytics provider here to disclose, no payment processor
 *   wired yet, no company behind it. What is written instead is what the code does, section by
 *   section, and the retention list comes from `RETENTION` so the page cannot promise one thing while
 *   the database keeps another.
 * * It is not `noindex`. These are the two pages a crawler is *supposed* to find: the sitemap lists
 *   them, and `/api/account/export` and `/api/account/delete` are described here rather than only in
 *   the code.
 *
 * Both pages say plainly that a lawyer has not read them yet. That is the honest status of a document
 * written by reading `supabase/migrations/`, and it is the kind of thing a reader deserves to know
 * before they trust a refund term. It is also why neither page pretends to name a governing law: the
 * reference text's arbitration clause belongs to a company this project is not.
 */

import { esc } from "./html.mjs";
import { PRICE } from "./pricing-page.mjs";
import { renderByline, renderDocument } from "./shell.mjs";
import { breadcrumbJsonLd, jsonLd } from "./seo.mjs";

/** What survives a deletion, and why. `lib/legal.js` re-exports this and the export document prints it. */
export const RETENTION = [
  {
    what: "Payment records",
    keeps: "amount, currency, kind, refunded, date",
    because: "tax and refunds have a legal life of their own, and a refund needs the payment it refunds",
  },
  {
    what: "Entitlement records",
    keeps: "the plan, its status and when it ran out",
    because: "it is what the payment bought, and it is what a dispute is argued from",
  },
  {
    what: "Nothing that names you",
    keeps: "no name, no username, no email, no LinkedIn URL, no group",
    because: "the profile row is deleted with the sign-in itself, and the kept rows are unlinked first",
  },
];

const LOCAL_KEYS = [
  ["es.progress", "which drills you finished, the last score, and whether you opened the answer"],
  ["es.trial", "that you started the in-browser trial, and when it ends"],
  ["es.grace", "that you used the one free pass past the wall"],
  ["es.feedback", "the note you typed in the feedback box"],
];

const STORED = [
  ["Account", "your email address, and the password the auth server stores as a hash you and we cannot read"],
  ["Profile", "a username, an optional display name, an optional LinkedIn URL, and a timezone"],
  ["Progress", "per drill: whether it is complete, the score, how many checks you missed, whether the answer was opened"],
  ["Attempts", "one row per screen you submitted, which is where first-try accuracy comes from"],
  ["Points and streaks", "the daily points total and the streak, both derived from the attempts above"],
];

const NEVER = [
  "no analytics script, and no page-view counter of any kind",
  "no advertising or tracking cookie, and nothing that survives you closing the tab",
  "no third-party font, stylesheet, image or script, every page loads only from this site",
  "no profile built from your behaviour, and nothing sold or handed to a data broker",
];

function paragraphs(lines) {
  return lines.map((line) => `      <p>${line}</p>`).join("\n");
}

function definitionList(rows) {
  return `      <dl class="legal-list">\n${rows
    .map(([term, detail]) => `        <dt>${esc(term)}</dt>\n        <dd>${esc(detail)}</dd>`)
    .join("\n")}\n      </dl>`;
}

function retentionList() {
  return `      <dl class="legal-list">\n${RETENTION.map(
    (row) => `        <dt>${esc(row.what)}</dt>\n        <dd>${esc(row.keeps)}, ${esc(row.because)}.</dd>`,
  ).join("\n")}\n      </dl>`;
}

function section(id, heading, html) {
  return `      <h2 id="${esc(id)}">${esc(heading)}</h2>\n${html}`;
}

/** The two documents, as data. The tests read these; nothing else needs to. */
export function legalSections({ config, track }) {
  const free = track.freeLessonCount;
  const contact = config.contact
    ? `<a href="${esc(config.contact.startsWith("mailto:") ? config.contact : `mailto:${config.contact}`)}">${esc(
        config.contact,
      )}</a>`
    : "the feedback button in the footer";

  return {
    privacy: {
      path: "/privacy",
      title: "Privacy",
      h1: "What this site keeps, and what it never sees",
      lede: "The drills grade in your browser. An account is the only thing that puts your work on a server, and it is yours to take out or delete.",
      description:
        "What Excel Supreme stores, what stays in your browser, which cookies exist (one, essential), how to export your data and how to delete your account.",
      badge: "Privacy · no trackers",
      skipLabel: "privacy policy",
      sections: [
        {
          id: "short",
          heading: "The short version",
          html: paragraphs([
            "Grading happens in your browser. Nothing you type into a cell is sent anywhere, and the drills work with JavaScript and no account.",
            "If you create an account, this site stores your progress so it follows you to another device. That is the only reason a server is involved.",
            "There are no analytics, no advertising and no third-party requests on this site. The only cookie is the one that keeps you signed in.",
            `You can take everything out as one JSON file, and you can delete the account and the data behind it, from your <a href="/account">account page</a>.`,
          ]),
        },
        {
          id: "browser",
          heading: "What stays in your browser",
          html: `${paragraphs([
            "Four keys in this site's own <code>localStorage</code> hold the work you do signed out. They never leave the device unless you sign in, at which point the progress key is sent once so your history survives the sign-in.",
          ])}\n${definitionList(LOCAL_KEYS)}\n${paragraphs([
            "Clearing site data in your browser deletes all four, and the drills keep working. Your browser decides how long they last; nothing here expires them on its own.",
          ])}`,
        },
        {
          id: "account",
          heading: "What an account adds on the server",
          html: `${paragraphs(["An account stores exactly these rows, and nothing else:"])}\n${definitionList(
            STORED,
          )}\n${paragraphs([
            "Every row is scoped to your account by a row-level security policy, which is a database rule rather than a promise in the application code: a request carrying your session cannot read another learner's rows, and yours cannot be read by theirs.",
          ])}`,
        },
        {
          id: "cookies",
          heading: "Cookies, and why there is no banner",
          html: paragraphs([
            "Signed out, this site sets no cookies at all.",
            "Signed in, the auth server sets one first-party session cookie. It is the only way to know that the next request is still you, so it is strictly necessary, and a consent banner exists to ask permission for cookies that are not. There is nothing here to ask about, so there is no banner.",
            "The same applies to storage: the four keys above are this site's own functionality, not tracking. A banner offering to switch them off would have to switch the drills off with them.",
          ]),
        },
        {
          id: "never",
          heading: "What this site never does",
          html: `      <ul class="legal-points">\n${NEVER.map((line) => `        <li>${esc(line)}</li>`).join(
            "\n",
          )}\n      </ul>\n${paragraphs([
            `The pages are checked for this mechanically: the build fails if any page, stylesheet or script refers to an origin other than this one.`,
          ])}`,
        },
        {
          id: "others",
          heading: "Who else can see it",
          html: paragraphs([
            "The database and the sign-in service are the Supabase project this deployment is configured against. They process the rows listed above on this site's behalf.",
            "The host that serves the pages may keep access logs of requests, as any web server does. Nothing in this application reads those logs or joins them to an account.",
            "If you buy the track once billing opens, a payment processor (Stripe) handles the card. The card number never reaches this site; the processor returns an identifier and a payment record, which is the row listed under retention below.",
            "There is no other recipient. Nothing is sold, shared for advertising, or sent to an analytics provider, because none is configured and none could be added without this page changing.",
          ]),
        },
        {
          id: "export",
          heading: "Taking your data out",
          html: paragraphs([
            `Your <a href="/account">account page</a> has a download that returns everything in one JSON file: the profile, every progress row, every recorded attempt, points, streaks, and the entitlement and payment history. It is the same data the code reads, in a format you can diff.`,
            "The document also lists what would survive a deletion, so the copy in your hands and the copy on the server say the same thing.",
          ]),
        },
        {
          id: "delete",
          heading: "Deleting your account",
          html: `${paragraphs([
            "The same page deletes the account. It happens immediately, there is no grace period to wait out, and no support ticket to open.",
            "Erased: the profile, every progress row, every attempt, the daily points, the streak, and any feedback you sent through the account.",
            "Kept, unlinked from you:",
          ])}\n${retentionList()}\n${paragraphs([
            "Kept rows lose the link to your account in the same transaction that removes it, so what remains is a payment and a plan with no person attached. Your email address and your name are gone with the profile.",
          ])}`,
        },
        {
          id: "children",
          heading: "Children",
          html: paragraphs([
            "This is a study tool for people learning spreadsheets, and it is not directed at children under 13. An account is not knowingly kept for one; if you believe a child has made one, write to the address below and it will be deleted.",
          ]),
        },
        {
          id: "changes",
          heading: "Changes to this page",
          html: paragraphs([
            "This page is part of the repository and carries the date of the build you are reading. When what the code stores changes, this page changes in the same commit, a policy that drifts from the schema is a bug, not a revision.",
          ]),
        },
        {
          id: "contact",
          heading: "Contact",
          html: paragraphs([`Questions, corrections, or a deletion request: ${contact}.`]),
        },
      ],
    },
    terms: {
      path: "/terms",
      title: "Terms",
      h1: "The deal, in plain English",
      lede: "What you get, what it costs, what you may do with it, and what happens when the grader and Excel disagree.",
      description:
        "The terms for using Excel Supreme: the free drills, the paid track, acceptable use, the limits of a teaching grader, and how to end your account.",
      badge: "Terms · plain English",
      skipLabel: "terms",
      sections: [
        {
          id: "what",
          heading: "What you are using",
          html: paragraphs([
            `A set of Excel drills that grade a formula in your browser and name the rule you missed. It is a functional copy of excelexercises.com, rebuilt from scratch; it is not affiliated with, endorsed by or connected to that site or to Microsoft.`,
            "Excel is a trademark of Microsoft Corporation. This site teaches spreadsheet formulas and is not an official Microsoft product or training material.",
          ]),
        },
        {
          id: "price",
          heading: "Free drills, and the paid track",
          html: paragraphs([
            `Drills 1–${free} are free forever: no account, no email, no expiry. Nothing in this repository moves them behind the wall.`,
            `The rest of the track is ${esc(PRICE)} for the whole thing, one payment, not one per drill, with a 100% refund guarantee and the option to cancel at any time.`,
            "Checkout is not open yet. Until it is, the paid drills open free in this browser, and the price above is what the page says rather than what it charges.",
          ]),
        },
        {
          id: "account",
          heading: "Your account",
          html: paragraphs([
            "Use an email address you can actually receive mail at, because that is how a password reset reaches you. One account per person.",
            "Keep your password to yourself; anyone holding it can read the progress on the account. If you think it has leaked, change it from the account page and sign the other device out.",
            `You can delete the account whenever you like, without asking, from the <a href="/account">account page</a>.`,
          ]),
        },
        {
          id: "fair-use",
          heading: "Fair use",
          html: `${paragraphs(["Do not:"])}\n      <ul class="legal-points">\n${[
            "scrape the site at a rate that degrades it for other people, or run it through a load test without asking first",
            "resell, sublicense or republish the drills, the copy or the grading logic",
            "try to break the grader into showing a verdict the formula does not deserve, it is the thing being taught",
            "attempt to reach another learner's rows, or probe for one",
          ]
            .map((line) => `        <li>${esc(line)}</li>`)
            .join("\n")}\n      </ul>`,
        },
        {
          id: "feedback",
          heading: "Feedback you write",
          html: paragraphs([
            "The note you type in the feedback box is yours. Sending it lets this site read it and act on it, in practice that means fixing the drill it is about, and nothing more: it is not published, not attributed, and not used for advertising.",
            "Keep other people's information out of it.",
          ]),
        },
        {
          id: "content",
          heading: "What belongs to this project",
          html: paragraphs([
            "The drill scripts, the lesson text, the design and the grading rules are this project's work. You may read the source, learn from it and run it yourself; you may not republish it as your own teaching product.",
            "The formulas you write are yours, and always were, nothing here claims any right over a spreadsheet you made.",
          ]),
        },
        {
          id: "grading",
          heading: "A grader is a teaching aid, not an authority",
          html: paragraphs([
            "Excel's formula rules vary by version and by locale: a decimal separator of `.` or `,`, a list separator of `,` or `;`, functions that exist in one release and not another. This grader implements a stated rule set and tells you which rule you broke.",
            "So a red verdict means this site's rules were not met, not that Excel will reject the formula, and not that your spreadsheet is wrong. If a verdict looks wrong, say so: a grader that punishes a correct formula is a bug worth fixing, and the feedback box reaches the person who can fix it.",
          ]),
        },
        {
          id: "warranty",
          heading: "No warranty, and the remedy",
          html: paragraphs([
            "This is a study aid offered as it is. There is no promise that every drill matches the current version of Excel, that the site is uninterrupted, or that it will teach you everything about spreadsheets.",
            "If it does not do what this page says it does, the remedy is a refund under the guarantee above. That is the honest extent of it, and it is stated here rather than buried in capitals.",
          ]),
        },
        {
          id: "ending",
          heading: "Ending it",
          html: paragraphs([
            "You can end it whenever you like: delete the account and the sessions end with it.",
            "An account can be suspended for the fair-use items above, in practice, for attacking the site or another learner. A suspension is not a deletion; your progress is still there, and the message says what happened.",
          ]),
        },
        {
          id: "changes",
          heading: "Changes",
          html: paragraphs([
            "These terms are part of the repository and carry the build date you are reading. A material change lands as a commit with the reason in it.",
          ]),
        },
        {
          id: "status",
          heading: "The status of this page",
          html: paragraphs([
            `It was written by reading the code that enforces it: the schema in <code>supabase/migrations/</code>, the routes in <code>app/api/</code>, and the grading rules in <code>packages/grader/</code>. That makes it accurate about this build. It has not been reviewed by a lawyer, and before money changes hands it should be.`,
            ...(config.contact
              ? [`Write to ${contact} with anything that looks wrong.`]
              : ["The feedback button in the footer reaches the person who can fix what looks wrong."]),
          ]),
        },
      ],
    },
  };
}

/** One document per kind, as `<main>` markup plus the page metadata the shell reads. */
export function prepareLegalPage({ config, track, index, kind }) {
  const document = legalSections({ config, track })[kind];
  if (!document) throw new Error(`legal-page: unknown page "${kind}"`);

  const body = `<main class="shell" id="main">
      <div class="page-head">
        <p class="eyebrow">${esc(document.title)}</p>
        <h1>${esc(document.h1)}</h1>
        <p class="lede">${esc(document.lede)}</p>
        ${renderByline({ config, index })}
      </div>

      <div class="docs">
${document.sections.map((entry) => section(entry.id, entry.heading, entry.html)).join("\n\n")}
      </div>
    </main>`;

  return {
    body,
    page: {
      path: document.path,
      title: document.title,
      description: document.description,
      counter: `${index.length} drills`,
      badge: document.badge,
      skipLabel: document.skipLabel,
      bodyClass: "legal",
      // A legal page is not a lesson, so the only structured data worth emitting is where it sits in
      // the site, which is what keeps the trail in the result rather than a bare URL.
      jsonLd: jsonLd(
        breadcrumbJsonLd({
          config,
          trail: [
            { href: "/", label: "Excel drills" },
            { href: document.path, label: document.title },
          ],
        }),
      ),
    },
  };
}

export function renderLegalPage(args) {
  const { body, page } = prepareLegalPage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons ?? {} });
}
