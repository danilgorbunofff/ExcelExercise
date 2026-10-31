/**
 * The offer, as a page. The reference site sells the same track from a modal that interrupts a
 * drill; this is that modal with a URL a wall can link to. Every number on it is derived from
 * `track.json` and the catalog, so the page cannot drift from what the drills actually do.
 *
 * Deliberately `noindex` and out of the sitemap: the track index is the page search engines should
 * land on, and a price page competing with it would be a second, weaker entry point.
 */

import { esc, inlineIcon } from "./html.mjs";
import { renderByline, renderDocument } from "./shell.mjs";

/** The reference premium modal, verbatim: `$59.99/year • 100% refund guarantee • Cancel anytime`. */
export const PRICE = "$59.99/year";
const TERMS = ["100% refund guarantee", "Cancel anytime"];

function drillLine(entry, linked) {
  const number = String(entry.number).padStart(2, "0");
  const title = `${number} · ${esc(entry.exercise.title)}`;
  // Free drills are linked from here; paid ones are named but not linked, because a link into a
  // wall is a dead end dressed as navigation.
  const label = linked ? `<a href="${esc(entry.path)}">${title}</a>` : title;
  return `          <li><strong>${label}</strong>, ${esc(entry.exercise.docs.outcome)}</li>`;
}

function renderDrills(entries, linked) {
  return entries.map((entry) => drillLine(entry, linked)).join("\n");
}

/** The pricing page as `<main>` markup plus its head metadata; see `prepareIndexPage` for why. */
export function preparePricingPage({ config, track, index, icons = {}, checkout = { enabled: false } }) {
  const first = index[0];
  const free = index.filter((entry) => entry.free);
  const paid = index.filter((entry) => !entry.free);
  const freeCount = track.freeLessonCount;
  // The two builds render this page from the same arguments, so "can this deployment take money"
  // has to be an argument and not a guess. When it is false the page says so, and the markup below is
  // byte-identical to the page that shipped before checkout existed.
  const cta = checkout.enabled
    ? `<form class="cta-row" method="post" action="/api/stripe/checkout?plan=annual">
        <button class="btn btn-primary" type="submit">Pay ${esc(PRICE)}${inlineIcon(icons["arrow-right"], {
          size: 16,
        })}</button>
        <a class="btn" href="${esc(first.path)}">Do drill 1 · ${esc(first.exercise.title)}</a>
      </form>
      <p class="gate-note">Card payment through Stripe. Every paid drill opens the moment the payment clears, and you can cancel or ask for a refund from your account page.</p>`
    : `<p class="cta-row">
        <a class="btn btn-primary" href="/signup?next=/pricing">Create an account${inlineIcon(icons["arrow-right"], {
          size: 16,
        })}</a>
        <a class="btn" href="${esc(first.path)}">Do drill 1 · ${esc(first.exercise.title)}</a>
      </p>
      <p class="gate-note">Checkout is not open yet. Until it opens, every paid drill opens free in this browser, no card, no account.</p>`;

  const body = `<main class="shell" id="main">
      <div class="page-head">
        <p class="eyebrow">Excel track · ${index.length} drills · ${freeCount} free</p>
        <h1>The free half, and the paid half</h1>
        <p class="lede">Drills 1–${freeCount} are free, forever, with no account. The other ${paid.length} are the track: one payment for all of them, ${esc(
          PRICE,
        )}, ${TERMS.map((term) => esc(term.toLowerCase())).join(", ")}.</p>
        ${renderByline({ config, index })}
      </div>

      ${cta}

      <section class="how" aria-labelledby="price-heading">
        <h2 id="price-heading">The price, plainly</h2>
        <ol class="how-steps">
          <li><strong>${esc(PRICE)}</strong> for the whole track, one payment, not one per drill.</li>
${TERMS.map((term) => `          <li>${esc(term)}.</li>`).join("\n")}
        </ol>
        <p class="how-note">Your progress lives in this browser whether you pay or not. An account is what carries it to another device.</p>
      </section>

      <section class="how" aria-labelledby="free-heading">
        <h2 id="free-heading">What stays free</h2>
        <ol class="how-steps">
${renderDrills(free, true)}
        </ol>
        <p class="how-note">Free means free: no account, no email, no expiry, and nothing here will ever be moved behind the wall.</p>
      </section>

      <section class="how" aria-labelledby="paid-heading">
        <h2 id="paid-heading">What the paid half adds</h2>
        <ol class="how-steps">
${renderDrills(paid, false)}
        </ol>
        <p class="how-note">Paid drills grade exactly like the free ones: the rule you missed, named, in your browser.</p>
      </section>
    </main>`;

  return {
    body,
    page: {
      path: "/pricing",
      title: "The whole track, one payment",
      description: `Drills 1–${freeCount} are free forever. The other ${paid.length} of ${index.length} come with the track: ${PRICE}, 100% refund guarantee, cancel anytime.`,
      counter: `${freeCount} free · ${paid.length} paid`,
      badge: "Free drills · paid track",
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
