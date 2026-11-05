/**
 * The search box on `/search`, and the one in the header.
 *
 * The index is already in the page when this runs, so a keystroke costs a string scan and nothing
 * else: no request, no debounce, no spinner. The listbox is the part that has to be keyboard-first —
 * arrows move, Enter opens, Escape clears — because a search box you cannot use without a mouse is a
 * search box half the people who need it cannot use.
 */

import { loadIndex, search } from "../search/index.js";

const MAX_RESULTS = 8;

/** The shipped rows, read from the page. A page without the script tag gets no index and no box. */
function readIndex(doc) {
  const node = doc.getElementById("search-index");
  if (!node) return [];
  try {
    const rows = JSON.parse(node.textContent ?? "[]");
    return Array.isArray(rows) ? loadIndex(rows) : [];
  } catch {
    return [];
  }
}

function resultItem(entry, index) {
  const number = entry.number === undefined ? "" : `<span class="search-num">${String(entry.number).padStart(2, "0")}</span>`;
  const kind =
    entry.kind === "note"
      ? "Function note"
      : entry.kind === "formula"
        ? "Problem page"
        : entry.kind === "shortcut"
          ? "Shortcut family"
          : entry.kind === "group"
            ? "Skill group"
            : entry.free
              ? "Free exercise"
              : "Exercise";
  return `<li class="search-result" id="search-result-${index}" role="option" aria-selected="false" data-index="${index}">
          <a href="${entry.path}">
            ${number}<span class="search-title">${entry.title}</span>
            <span class="search-kind">${kind}</span>
          </a>
        </li>`;
}

function start() {
  const input = document.getElementById("search-input");
  const list = document.getElementById("search-results");
  const status = document.getElementById("search-status");
  if (!input || !list) return;

  const entries = readIndex(document);
  if (entries.length === 0) return;

  let results = [];
  let active = -1;

  const close = () => {
    active = -1;
    list.hidden = true;
    list.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };

  const select = (position) => {
    active = position;
    for (const option of list.querySelectorAll("[role='option']")) {
      const isActive = Number(option.dataset.index) === position;
      option.setAttribute("aria-selected", isActive ? "true" : "false");
      option.classList.toggle("is-active", isActive);
      if (isActive) input.setAttribute("aria-activedescendant", option.id);
    }
    if (position >= 0) list.children[position]?.scrollIntoView({ block: "nearest" });
  };

  const clearStatus = () => {
    if (status) status.textContent = "";
  };

  const render = (query) => {
    if (query.trim() === "") {
      results = [];
      close();
      clearStatus();
      return;
    }
    results = search(query, entries, { limit: MAX_RESULTS });
    if (results.length === 0) {
      results = [];
      close();
      if (status) status.textContent = `No exercise covers "${query.trim()}" yet. Every exercise is listed below.`;
      return;
    }
    list.innerHTML = results.map(resultItem).join("\n");
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    select(0);
    if (status) {
      status.textContent = `${results.length} ${results.length === 1 ? "result" : "results"} for "${query.trim()}".`;
    }
  };

  input.addEventListener("input", () => render(input.value));

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      select((active + 1) % results.length);
      return;
    }
    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      select((active - 1 + results.length) % results.length);
      return;
    }
    if (event.key === "Enter" && active >= 0 && results[active]) {
      event.preventDefault();
      window.location.assign(results[active].path);
      return;
    }
    if (event.key === "Escape") {
      // The first Escape is the browser's own clear for a search input; this is the case it misses.
      if (input.value !== "") {
        event.preventDefault();
        input.value = "";
        render("");
        input.dispatchEvent(new Event("search"));
      }
    }
  });

  list.addEventListener("click", (event) => {
    if (event.target.closest("a")) close();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-form") && !event.target.closest("#search-results")) close();
  });

  // A shared link carries the query, so `/search?q=count+blanks` opens on its own answers.
  const initial = new URLSearchParams(window.location.search).get("q") ?? "";
  if (initial.trim() !== "") {
    input.value = initial;
    render(initial);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}
