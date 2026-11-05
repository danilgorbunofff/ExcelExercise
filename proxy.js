// The request-side half of the session: refresh the token pair, and send signed-out visitors to
// `/login?next=…` before the page renders.
//
// Next 16 renamed this file convention from `middleware.js` to `proxy.js` (the export is `proxy`),
// and that is the name used here. The matcher covers the pages, not the assets: a request for
// `/assets/...` has no session to refresh.
//
// With accounts unconfigured (CI, a fresh clone) this returns immediately: no network call, no
// cookie work, and the app behaves exactly as it did before phase 4.

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import { authConfig } from "./lib/auth/config.js";
import { loginUrl } from "./lib/auth/redirect.js";
import { entitledFor, paywallDecision, paywallEnforced } from "./lib/paywall.js";
import { EVENTS, logEvent } from "./lib/log-event.js";
import { notFoundDocument } from "./lib/not-found.js";
import { loadProjectTrack } from "./lib/projects.js";
import { loadSite } from "./lib/site.js";
import { admitVerifyRequest, clientAddress, refusalPage } from "./lib/verify/limit.js";

// Everything under `/account`, the board it links to, and the daily challenge need a session. Keep the
// list here rather than duplicating it in each page: a page that forgets to check would render a
// signed-out shell and look like a bug.
//
// `/api/daily` is deliberately absent: it is fetched, not navigated to, and its own `401` is an answer
// the runner can show. A redirect there would hand `fetch` a login page and read as a network failure.
const GATED = [/^\/account(?:\/|$)/, /^\/leaderboard\/?$/, /^\/daily(?:\/|$)/];

// The exception, and the only one: `/account/deleted` is where the delete form redirects, and by then
// the session is gone by design — a gate there would bounce a just-deleted learner to `/login`.
const PUBLIC = [/^\/account\/deleted\/?$/];

// The public certificate page is the one URL a stranger can guess at, so it is the one URL with a
// limit on it. It is read signed in or out, and it is answered before the session work below: a
// crawl must not cost a database round trip per guess, and the guard has to hold on a deployment
// with accounts unconfigured.
const VERIFY = /^\/verify\/[^/]+\/?$/;

// The four addresses whose last segment names something in the catalog: an exercise, a project, a dashboard
// group, or a function note. Everything else the app serves has a fixed path.
const DYNAMIC = [
  [/^\/learn\/excel\/([^/]+)\/?$/, "lesson"],
  [/^\/learn\/projects\/([^/]+)\/?$/, "project"],
  [/^\/learn\/groups\/([^/]+)\/?$/, "group"],
  [/^\/excel-functions\/([^/]+)\/?$/, "note"],
];

// The three silos whose pages carry an exercise, and the surface word the funnel report prints for each.
// A page in one of them is the denominator of "started / completed", so this is where every rate on the
// phase-7 scorecard begins.
const RENDERED = [
  [/^\/learn\/excel\/([^/]+)\/?$/, "lesson"],
  [/^\/formulas\/([^/]+)\/?$/, "formula"],
  [/^\/excel-functions\/([^/]+)\/?$/, "article"],
];

// A prefetch is not a reader, and a crawler that typed nothing would sit in every denominator forever.
// The e2e run is skipped by the same rule, because Playwright's user agent contains `HeadlessChrome`.
const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|preview/i;

/**
 * `content_rendered`, the funnel's denominator. Nothing here reads a cookie or changes the response:
 * the proxy can fail to write a line, never to serve a page.
 */
function noteRendered(request) {
  const path = request.nextUrl.pathname;
  const family = RENDERED.find(([pattern]) => pattern.test(path));
  if (!family) return;
  if (request.headers.get("next-router-prefetch") === "1") return;
  if (request.headers.get("purpose") === "prefetch") return;
  if (BOT.test(request.headers.get("user-agent") ?? "")) return;
  const slug = family[0].exec(path)?.[1];
  if (slug) logEvent(EVENTS.contentRendered, { surface: family[1], slug });
}

/**
 * Whether this path names a real entry, or `null` when the path is not one of the four families.
 *
 * The answer comes from the same catalog the pages prerender from, so a slug cannot be known to one and
 * unknown to the other. A malformed escape sequence is not a guess either way: it is refused.
 */
function knownEntry(pathname) {
  for (const [pattern, family] of DYNAMIC) {
    const match = pattern.exec(pathname);
    if (!match) continue;
    let slug;
    try {
      slug = decodeURIComponent(match[1]);
    } catch {
      return false;
    }
    if (slug === "" || slug === "." || slug === "..") return false;
    if (family === "lesson") return loadSite().entryFor(slug) !== null;
    if (family === "project") return loadProjectTrack().entryFor(slug) !== null;
    if (family === "note") return loadSite().articleFor(slug) !== null;
    // A group is the dashboard's own grouping, and only a group that holds an exercise has a page.
    const { track, index } = loadSite();
    return track.groups.some((group) => group.id === slug && index.some((entry) => entry.group === slug));
  }
  return null;
}

// The one place a paid exercise can be opened. The lesson pages are prerendered HTML, which cannot be
// refused once it exists, so the refusal has to happen on the request.
const LESSON = /^\/learn\/excel\/([^/]+)\/?$/;

/**
 * The paywall verdict for this path. Kept next to the session work because entitlement is only
 * knowable for a signed-in reader, and the catalog is only read when enforcement is on at all.
 */
async function paywallFor(pathname, supabase, user) {
  if (!paywallEnforced()) return null;
  const slug = LESSON.exec(pathname)?.[1];
  if (!slug) return null;
  const { track, entryFor } = loadSite();
  const entry = entryFor(decodeURIComponent(slug));
  if (!entry) return null; // an unknown slug is the route's 404, not the paywall's business
  return paywallDecision({
    entry,
    promptAt: track.promptAt,
    entitled: await entitledFor(supabase, user),
  });
}

export async function proxy(request) {
  // Before the session work, and before the accounts-unconfigured shortcut below: a wrong address is a
  // wrong address on every deployment, signed in or not.
  if (knownEntry(request.nextUrl.pathname) === false) {
    return new NextResponse(notFoundDocument(), {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Not cached for long: the catalog can gain an entry on the next deploy, and this answer is
        // only true for the deployment that made it.
        "cache-control": "public, max-age=0, must-revalidate",
      },
    });
  }

  if (VERIFY.test(request.nextUrl.pathname)) {
    const verdict = admitVerifyRequest({ address: clientAddress(request.headers) });
    if (!verdict.allowed) {
      return new NextResponse(refusalPage(verdict.retryAfter), {
        status: 429,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "retry-after": String(verdict.retryAfter),
        },
      });
    }
  }

  const config = authConfig();
  if (!config.enabled) {
    // Accounts off is still a deployment that serves content, so the funnel has to be counted here.
    noteRendered(request);
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // `getUser()` is what refreshes an expired access token, so this call is the session keep-alive,
  // not just the gate.
  const { data, error } = await supabase.auth.getUser();
  const user = error ? null : data.user ?? null;

  const pathname = request.nextUrl.pathname;
  if (
    !user &&
    GATED.some((pattern) => pattern.test(pathname)) &&
    !PUBLIC.some((pattern) => pattern.test(pathname))
  ) {
    const next = pathname + request.nextUrl.search;
    return NextResponse.redirect(new URL(loginUrl(next), request.url));
  }

  // After the session, not before: a signed-out reader on a paid exercise belongs at the offer, and a
  // signed-in one needs their entitlement asked for. Both answers come from the same rule the exercise
  // paints in the browser (`gateFor`), so the two cannot disagree.
  const paywall = await paywallFor(request.nextUrl.pathname, supabase, user);
  if (paywall) return NextResponse.redirect(new URL(paywall, request.url));

  // Last, not first: a paid exercise served as a redirect to the offer was never rendered, and counting it
  // would put a reader in a denominator they never joined.
  noteRendered(request);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|assets|favicon\.ico|robots\.txt|sitemap\.xml).*)"],
};
