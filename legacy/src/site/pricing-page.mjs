/**
 * The offer, as a page. The reference site sells the same track from a modal that interrupts an
 * exercise; this is that modal with a URL a wall can link to. Every number on it is derived from
 * `track.json` and the catalog, so the page cannot drift from what the exercises actually do.
 *
 * One product, one card. The track is sold at three terms, and three terms are a control rather than
 * three products: an earlier version printed three cards side by side, which asked a reader to compare
 * before they could decide, and needed a heading, a how-note explaining its own economics, a fact
 * grid, a duplicate free list and the whole 86-row catalogue to hold the comparison up. The page is
 * now the shape the rest of the web uses for one product: the term switch, the price, one button,
 * three short inclusions, and the questions a buyer asks before typing a card number.
 *
 * The switch is CSS only. Three radios sit before the panel body as siblings, and `:checked ~` reveals
 * the panel that belongs to the checked term, so it works in the static edition with no script, in
 * both deployables, and every panel keeps its own checkout form: a reader who picks the month is never
 * checked out into the year by a shared action.
 *
 * Deliberately `noindex` and out of the sitemap: the track index is the page search engines should
 * land on, and a price page competing with it would be a second, weaker entry point.
 */

import { esc } from "./html.mjs";
import {
  DEFAULT_PLAN,
  GUARANTEE,
  PLANS,
  PRICE,
  REFUND_DAYS,
  offerLine,
  renewalLine,
  savingPercent,
} from "./offer.mjs";
import { renderQuestions } from "./questions.mjs";
import { renderDocument } from "./shell.mjs";

// The plans, the guarantee and the cadence are `site/offer.mjs`'s, not this page's: three other pages
// state the same offer, and one of them once promised a one-off payment for a yearly subscription.
export { PRICE };

/**
 * The questions a reader asks before typing a card number, answered on the page.
 *
 * Each one is a fact about this product and not marketing: the grader runs in the browser, the
 * formulas are the shared Excel grammar, progress is local until an account exists, the plan is the
 * recurring price `lib/stripe.js` sells, and a refund is a request to the address in the footer.
 * Answers are one or two sentences, because an answer a reader did not ask for is read once and
 * remembered never. Wording may change; the facets are pinned by `tests/pricing-page.test.js`.
 *
 * The renewal answer carries a link, so answers arrive as HTML: the prose inside them is escaped
 * where it is written, and `questions.mjs` concatenates what it is given.
 */
const QUESTIONS = [
  [
    "Which Excel versions does this work in?",
    "Excel for Microsoft 365, Excel 2021 and Excel for Mac 2021. The grader runs in your browser, so it does not check your version. An exercise that needs a newer function says so on its own page.",
  ],
  [
    "Will it work in Google Sheets?",
    "No. The track teaches Excel's grammar. Sheets spells several of those functions differently, so what you learn here will not carry over unchanged.",
  ],
  [
    "Can I use it offline?",
    "Yes, once an exercise is open. The grader and your progress live in this browser. Opening a new exercise, or syncing an account, needs a connection.",
  ],
  [
    "How many devices can I use?",
    "As many as you sign in on. The account carries your progress between them, so there is no device limit and no second seat to buy.",
  ],
  [
    "What if it is not for me?",
    `Ask within ${REFUND_DAYS} days and the payment is refunded. A person reads the request, and no reason is required.`,
  ],
  // The one sentence about renewal is `offer.mjs`'s, not this page's: `/about` states it too, and two
  // pages answering the same question in their own words is how a page promised nothing recurring for a
  // plan that charges again. The words are escaped because this answer carries no markup of its own.
  ["When does it renew?", esc(renewalLine())],
];

/**
 * The closing line under the questions. There is an address only when this deployment was given one — a
 * `mailto:` to nowhere is worse than no address at all — so the refund question is answered by the
 * folds either way and this adds the human afterwards.
 */
function renderQuestionFooter({ config, signinHref }) {
  const address = config.contact?.trim().replace(/^mailto:/i, "");
  const write = address
    ? `If the answer is not here, write to <a href="mailto:${esc(address)}">${esc(address)}</a> and a person reads it, usually within a day. `
    : "";
  // The account page is on the same host the sign-in route is, so a build that has neither offers
  // neither: a link to `/account` from a host that only serves files is a 404 with a promise on it.
  const signin = signinHref
    ? `Already have an account? <a href="${esc(signinHref)}">Sign in</a> and the paid exercises are open, or open <a href="/account">your account</a> to change the plan.`
    : `If you have already paid, your account is where the exercises are waiting.`;
  return `        <p class="qa-footer">${write}${signin}</p>`;
}

/**
 * The pricing page as `<main>` markup plus its head metadata; see `prepareIndexPage` for why.
 *
 * `signupHref` is where an account can be created. It defaults to this host's own `/signup`, and the
 * static edition passes an absolute `appUrl` link or `null`: a build with no server and no sibling
 * deployment to point at must not offer a button that leads to a 404, so it offers the free exercises.
 */
export function preparePricingPage({
  config,
  track,
  index,
  checkout = { enabled: false },
  signupHref = "/signup?next=/pricing",
  startHref = "/start",
  checkoutAction = "/api/stripe/checkout",
  signinHref = "/login?next=/pricing",
}) {
  const freeCount = track.freeLessonCount;
  const paidCount = index.length - freeCount;
  // `checkoutAction` is the route, not the whole address: the plan is the panel's, so one posting URL
  // cannot quietly sell the year when a reader chose the month.
  const actionFor = (plan) => `${checkoutAction}?plan=${plan.id}`;

  // The largest number in the panel is what the card is charged, not the term divided by its months.
  // Once the terms are a switch there is nothing left to compare at a glance, so the honest figure is
  // the one that leaves the account and the monthly equivalent is the line under it.
  // `savingPercent` derives the chip, so a chip cannot outlive the price it describes.
  const termPanel = (plan) => {
    const saving = savingPercent(plan);
    const price = `$${plan.amount}`;
    const perMonth =
      plan.months === 1 ? "Renews every month until you cancel" : `$${plan.perMonth} a month`;
    const buy = checkout.enabled
      ? `<form class="term-buy" method="post" action="${esc(actionFor(plan))}">
              <button class="btn btn-primary" type="submit">Pay ${esc(price)} ${esc(plan.cadence)}</button>
            </form>`
      : `<p class="term-buy"><a class="btn btn-primary" href="${esc(
          signupHref ?? startHref,
        )}">${signupHref ? "Create an account" : `Start with the free ${freeCount}`}</a></p>`;
    return `          <div class="term-panel" id="panel-${esc(plan.id)}" data-plan="${esc(plan.id)}">
            <p class="term-price"><span class="term-amount">${esc(price)}</span> <span class="term-unit">${esc(
              plan.cadence,
            )}</span></p>
            <p class="term-note"><span class="term-per-month">${esc(perMonth)}</span>${
              saving > 0 ? `<span class="term-save">save ${saving}%</span>` : ""
            }</p>
            ${buy}
          </div>`;
  };

  const radios = PLANS.map(
    (plan) =>
      `<input class="term-radio" type="radio" name="term" id="term-${esc(plan.id)}"${
        plan.id === DEFAULT_PLAN ? " checked" : ""
      }>`,
  ).join("\n        ");
  const labels = PLANS.map((plan) => `<label for="term-${esc(plan.id)}">${esc(plan.label)}</label>`).join(
    "\n          ",
  );

  // What the money buys, once, beside the price rather than in a band under it. Three lines, each
  // answering an objection a reader actually has: what opens, does it follow me, what if I stop.
  const includes = [
    `All ${paidCount} paid exercises, graded the way the free ones are`,
    "Your progress follows your account to any device",
    "Cancelling stops the next charge, not the time you paid for",
  ]
    .map((line) => `            <p>${esc(line)}</p>`)
    .join("\n");

  // Whether this host can take a card decides the button, not the offer: the terms are the same on
  // both editions, and a reader should be able to read the price whether or not checkout is wired up.
  const gate = checkout.enabled
    ? ""
    : `\n      <p class="gate-note">Checkout is not open on this copy of the site yet. Read the terms here, and start with the ${freeCount} that need no account.</p>`;

  const questions = QUESTIONS.map(([question, answer]) => ({ question: esc(question), answer }));

  const body = `<main class="shell" id="main">
      <div class="page-head">
        <h1>${freeCount} exercises free. The rest from ${esc(PRICE)}</h1>
        <p class="lede">There is no trial and no per-exercise unlock. Pick a term and the paid half opens on every device you sign in on.</p>
      </div>

      <fieldset class="term-switch">
        <legend class="term-legend">How long to pay for</legend>
        ${radios}
        <div class="term-track">
          ${labels}
        </div>
        <div class="term-body">
${PLANS.map(termPanel).join("\n")}
          <div class="term-includes">
${includes}
          </div>
        </div>
        <p class="term-guarantee">${esc(GUARANTEE)} inside ${REFUND_DAYS} days, cancel anytime.</p>
      </fieldset>
${gate}
      <p class="free-more"><a href="${esc(startHref)}">Free lessons</a><a href="/excel-exercises">All exercises</a></p>

      <div class="price-band">
${renderQuestions({
  id: "faq-heading",
  heading: "Before you pay",
  questions,
  footer: renderQuestionFooter({ config, signinHref }),
})}
      </div>
    </main>`;

  return {
    body,
    page: {
      path: "/pricing",
      title: `${freeCount} exercises free, the rest from $${PLANS[0].amount}`,
      // A search result shows about 155 characters, so the page's own offer paragraph is too long here.
      description: `${freeCount} of the ${index.length} Excel exercises are free, with no account and no card. The other ${index.length - freeCount} come with the track, from $${PLANS[0].amount} ${PLANS[0].cadence}.`,
      skipLabel: "pricing",
      noindex: true,
      bodyClass: "pricing",
    },
  };
}

export function renderPricingPage(args) {
  const { body, page } = preparePricingPage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}
