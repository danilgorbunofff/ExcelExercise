/**
 * The offer, in one place.
 *
 * Four pages state what this costs — `/pricing`, `/about`, `/excel-exercises` and `/privacy` — and each
 * one used to spell it out for itself. Two of them called it a one-off payment while `lib/stripe.js`
 * sold `annual` as a Stripe subscription, so the page promised "nothing recurring" and the checkout
 * charged again a year later. The plans, the guarantee and the cadence are values here, and every
 * sentence about them is built from those values, so a page cannot invent a friendlier version.
 *
 * There is no trial and no free month: the free exercises are the trial, and they do not expire. What
 * is left is a choice of commitment — the same track at three terms — which is why the plans live in
 * one array rather than in three branches of a page.
 *
 * The exercise count is passed in rather than counted here: the static pages know it from the content
 * index, and `track.lessons` is the same plan from the other side.
 */

/** The currency every amount below is in, kept apart because structured data wants it separately. */
export const PRICE_CURRENCY = "USD";

/**
 * The three ways to buy the track, in the order the pricing page prints them: the shortest commitment
 * first, because a reader deciding should see the smallest thing they can buy before the biggest
 * discount. `months` is what a term is; `amount` is what that term costs; `perMonth` is the same money
 * divided by it, rounded to the cent and stated rather than implied; `cadence` is the term in the words
 * a sentence needs, so the page can build "pay $39.99 every six months" from two fields that cannot
 * disagree.
 *
 * There is no per-plan description any more. The page shows one card with a term switch, so `label` is
 * only the word on a segment and the three plans differ in nothing a paragraph could add: a sentence
 * per term was three quarters of the old pricing page explaining why its own three cards existed.
 */
export const PLANS = [
  {
    id: "monthly",
    label: "One month",
    months: 1,
    amount: "9.99",
    perMonth: "9.99",
    cadence: "a month",
  },
  {
    id: "semiannual",
    label: "Six months",
    months: 6,
    amount: "39.99",
    perMonth: "6.67",
    cadence: "every six months",
  },
  {
    id: "annual",
    label: "One year",
    months: 12,
    amount: "59.99",
    perMonth: "5.00",
    cadence: "a year",
  },
];

/**
 * The plan the wall's one button sells, and the fallback when a request names no plan. The wall has no
 * room for a comparison table, so it sells the shortest commitment: a reader who is curious should not
 * be pushed into a year by the page they cannot leave, and the cheaper per-month terms are one click
 * away on `/pricing`, where the switch opens on the same term this constant names.
 */
export const DEFAULT_PLAN = "monthly";

/** The plans by id, so a page can look one up without scanning the array. */
export const PLAN_BY_ID = Object.fromEntries(PLANS.map((plan) => [plan.id, plan]));

/**
 * The price the pages lead with: the shortest commitment per month, not the cheapest per month. A
 * headline that quotes the yearly price per month flatters the offer by comparing a year to nothing.
 */
export const PRICE_AMOUNT = PLANS[0].amount;
export const PRICE = `$${PRICE_AMOUNT}/month`;

/** Every plan's price in one sentence fragment: `$9.99 a month, $39.99 every six months or $59.99 a year`. */
export function planMenu() {
  const prices = PLANS.map((plan) => `$${plan.amount} ${plan.cadence}`);
  const last = prices.pop();
  return `${prices.join(", ")} or ${last}`;
}

/** What a reader saves against the monthly plan, in whole percent. Derived, never typed. */
export function savingPercent(plan) {
  const monthly = PLANS[0];
  const full = Number(monthly.amount) * plan.months;
  if (!full || plan.months === monthly.months) return 0;
  return Math.round((1 - Number(plan.amount) / full) * 100);
}

export const GUARANTEE = "100% refund guarantee";

/** The three terms the price tag carries, in the order they are printed. */
export const TERMS = [PRICE, GUARANTEE, "Cancel anytime"];

/** Days a refund request is honoured for, in the words a reader uses. */
export const REFUND_DAYS = 30;

/**
 * The one sentence that says what the offer is, used verbatim on every page that states it.
 * `free` and `total` come from `track.json` and the content index, never from a number typed here.
 */
export function offerLine({ free, total }) {
  // No dashes: the legal page runs the same copy through `content-lint`, which refuses decorative
  // punctuation, so the sentence has to read without one.
  return `${free} exercises are free forever, with no account and no card, and every payment carries a ${GUARANTEE.toLowerCase()} inside ${REFUND_DAYS} days. The other ${total - free} come with the track, one price for all of them: ${planMenu()}.`;
}

/** What a payment buys, and when it charges again — the answer to "does it renew?". */
export function renewalLine() {
  return `Every plan renews for another term of the same length unless you cancel: a month, six months or a year, whichever you bought. Cancel from your account page in one click, and the time you already paid for runs to its end. The price does not change for the term you are in.`;
}
