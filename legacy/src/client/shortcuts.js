/**
 * The shortcut pages, once they are in a browser: which platform's column is showing, the banner a
 * touch screen gets, and the filter box on the hub.
 *
 * All three are enhancements. The page is built with every column in the HTML, the filter box is
 * rendered hidden and the banner is rendered hidden, so a reader whose JavaScript did not run gets a
 * complete table and no controls that would do nothing.
 */

/** Where a dismissal is remembered. The site prefix, so the whole store can be cleared as one thing. */
const BANNER_KEY = "es.shortcuts-banner";

const DEFAULT_PLATFORM = "windows";

/** `?platform=macos`, and nothing else: anything unknown means the default tab. */
function platformFromSearch(search) {
  const platform = new URLSearchParams(search).get("platform");
  return platform ? platform.toLowerCase() : DEFAULT_PLATFORM;
}

/**
 * Show one platform's column. Cells are hidden rather than removed, so switching tabs never needs a
 * request and the table a crawler reads keeps every platform in it.
 */
function switchPlatform(selected) {
  const table = document.querySelector("[data-shortcut-table]");
  if (!table) return false;
  const cells = table.querySelectorAll("[data-platform]");
  let found = false;
  for (const cell of cells) {
    const match = cell.dataset.platform === selected;
    cell.hidden = !match;
    if (match) found = true;
  }
  return found;
}

/** The tab that matches the URL says so, in the one way a screen reader announces. */
function markCurrentTab(selected) {
  for (const tab of document.querySelectorAll(".platform-tab")) {
    const platform = new URLSearchParams(tab.getAttribute("href")?.split("?")[1] ?? "").get("platform");
    const isCurrent = (platform ?? DEFAULT_PLATFORM) === selected;
    if (isCurrent) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
}

/**
 * One address per tabbed state. Without this every tab would claim the bare URL as canonical after a
 * click, and the three states would compete for the same page in a search result.
 *
 * The rewrite has to survive hydration, which is why it watches the head instead of running once. The
 * static build has a single canonical tag to edit, but in the app the framework owns that tag and
 * inserts its own copy once it takes over, leaving two canonical links that contradict each other. This
 * keeps the head at exactly one, on the address the reader is looking at, for as long as the page lives.
 */
function startCanonical() {
  const url = new URL(location.href);
  const selected = platformFromSearch(location.search);
  if (selected === DEFAULT_PLATFORM) url.searchParams.delete("platform");
  else url.searchParams.set("platform", selected);
  // The static edition serves a folder, so the address in the bar ends in a slash while the sitemap and
  // the page's own `path` do not. The canonical names the one the sitemap does.
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  const href = url.toString();

  const sync = () => {
    const links = [...document.querySelectorAll('link[rel="canonical"]')];
    const extra = links.slice(1);
    const stale = links.filter((link) => link.getAttribute("href") !== href);
    const metas = [...document.querySelectorAll('meta[property="og:url"]')].filter(
      (meta) => meta.getAttribute("content") !== href,
    );
    if (extra.length === 0 && stale.length === 0 && metas.length === 0) return;
    for (const link of extra) link.remove();
    for (const link of stale) link.setAttribute("href", href);
    for (const meta of metas) meta.setAttribute("content", href);
  };

  sync();
  new MutationObserver(sync).observe(document.head, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "content"],
  });
}

function startTabs() {
  if (!document.querySelector("[data-shortcut-table]")) return;
  const selected = platformFromSearch(location.search);
  if (!switchPlatform(selected)) return;
  markCurrentTab(selected);
  startCanonical();
}

/**
 * The banner a coarse pointer gets. It is in the HTML already, hidden; revealing it here rather than
 * rendering it unconditionally keeps it out of a screen reader's queue on the machines it is wrong
 * for, and a dismissal is remembered so it is not the second thing a returning reader meets.
 */
function startBanner() {
  const banner = document.getElementById("shortcuts-banner");
  if (!banner) return;
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(BANNER_KEY) === "1";
  } catch {
    dismissed = false; // private mode, or storage denied: show the banner, forget the dismissal
  }
  const coarse = window.matchMedia?.("(pointer: coarse)");
  const update = () => {
    banner.hidden = dismissed || !coarse?.matches;
  };
  update();
  coarse?.addEventListener?.("change", update);

  document.getElementById("shortcuts-banner-dismiss")?.addEventListener("click", () => {
    dismissed = true;
    update();
    try {
      localStorage.setItem(BANNER_KEY, "1");
    } catch {
      // nothing to remember with, and nothing to break: the banner stays away for this page
    }
  });
}

/** A query as it is typed against a row as it is written: case and punctuation are not the question. */
const normalise = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The hub filter. Rows are already in the page with their actions and keys, so this is a string scan
 * per keystroke: no index, no request. Families whose rows all fall away are hidden whole, because a
 * heading over an empty list is a page that looks broken.
 */
function startFilter() {
  const box = document.getElementById("shortcut-filter");
  const input = document.getElementById("shortcut-search");
  const status = document.getElementById("shortcut-filter-status");
  if (!box || !input) return;
  box.hidden = false;

  const rows = [...document.querySelectorAll(".shortcut-row")].map((row) => ({
    row,
    haystack: normalise(`${row.textContent ?? ""} ${row.dataset.keys ?? ""}`),
    section: row.closest(".shortcut-family"),
  }));

  input.addEventListener("input", () => {
    const query = normalise(input.value);
    let shown = 0;
    for (const entry of rows) {
      const match = !query || entry.haystack.includes(query);
      entry.row.hidden = !match;
      if (match) shown += 1;
    }
    for (const section of document.querySelectorAll(".shortcut-family")) {
      section.hidden = ![...section.querySelectorAll(".shortcut-row")].some((row) => !row.hidden);
    }
    if (status) {
      status.textContent = query
        ? `${shown} ${shown === 1 ? "shortcut matches" : "shortcuts match"} “${input.value.trim()}”`
        : "";
    }
  });
}

startTabs();
startBanner();
startFilter();
