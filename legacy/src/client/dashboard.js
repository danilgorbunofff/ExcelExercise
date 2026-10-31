/**
 * The dashboard island. The page is already whole — every drill, its group and its badge slot are in the
 * HTML — so this module only fills what can only be known in the browser: the counts, the badges and the
 * up-next recommendation, all read from the progress record in `localStorage`.
 *
 * Two rules. Every string reaches the DOM through `textContent` (a lesson title or a stored timestamp is
 * not markup), and a blocked storage is said out loud rather than drawn as "0 of 16": a learner whose
 * browser refuses storage must not be told they have done nothing.
 */

import { BADGE_LABELS, ago, canStart, nextCopy, summarise, summaryLine } from "../progress/index.js";
import { PROGRESS_KEY, emptyProgress, parseProgress, serializeProgress } from "./state.js";

const RESET_CONFIRM_MS = 6000;

const state = { plan: null, storage: null, blocked: null, progress: emptyProgress(), timer: undefined };

const ui = {
  data: document.getElementById("dashboard-data"),
  complete: document.getElementById("dash-complete"),
  total: document.getElementById("dash-total"),
  fill: document.getElementById("dash-fill"),
  rail: document.getElementById("dash-rail"),
  note: document.getElementById("dash-note"),
  nextLink: document.getElementById("dash-next-link"),
  nextLabel: document.getElementById("dash-next-label"),
  nextWhy: document.getElementById("dash-next-why"),
  legend: document.getElementById("dash-legend"),
  recent: document.getElementById("dash-recent"),
  recentSection: document.getElementById("dash-recent-section"),
  resetSection: document.getElementById("dash-reset-section"),
  reset: document.getElementById("dash-reset"),
  resetNote: document.getElementById("dash-reset-note"),
};

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) node.append(typeof child === "string" ? document.createTextNode(child) : child);
  return node;
}

function readPlan() {
  if (!ui.data) return null;
  try {
    const parsed = JSON.parse(ui.data.textContent ?? "");
    return Array.isArray(parsed?.plan) ? parsed.plan : null;
  } catch {
    return null;
  }
}

function safeStorage() {
  try {
    const storage = window.localStorage;
    const probe = `${PROGRESS_KEY}.probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function readProgress() {
  if (!state.storage) return emptyProgress();
  try {
    return parseProgress(state.storage.getItem(PROGRESS_KEY));
  } catch {
    return emptyProgress();
  }
}

function writeProgress(progress) {
  if (!state.storage) return false;
  try {
    state.storage.setItem(PROGRESS_KEY, serializeProgress(progress));
    return true;
  } catch {
    return false;
  }
}

function badgePill(badge) {
  return el("span", { class: "badge-pill", "data-badge": badge, text: BADGE_LABELS[badge] ?? BADGE_LABELS.not_started });
}

function renderRecent(rows) {
  if (!ui.recent) return;
  const items = rows.map((row) =>
    el("li", { class: "dash-recent-item" }, [
      el("a", { class: "dash-recent-link", href: row.path }, [
        el("span", { class: "row-num", "aria-hidden": "true", text: String(row.number).padStart(2, "0") }),
        el("span", { class: "dash-recent-title", text: row.title }),
      ]),
      el("span", { class: "dash-when", text: ago(row.at) }),
      badgePill(row.badge),
    ]),
  );
  ui.recent.replaceChildren(...items);
}

/**
 * The order gate, said on the row. The link stays: a locked drill opens its gate page, which names the
 * drill to finish and offers the one-click unlock — a row that is not a link would be a dead end with
 * the way out behind it.
 */
function paintLock(node, row) {
  const start = canStart({
    plan: state.plan,
    progress: state.progress,
    id: row.id,
    unlocked: state.progress.unlocked === true,
  });
  node.dataset.locked = String(!start.open);
  const note = node.querySelector(".row-locked");
  if (start.open) {
    if (note) note.remove();
    return;
  }
  const slot = node.querySelector(".row-body") ?? node;
  const target = note ?? el("span", { class: "row-locked" });
  target.textContent = `Opens after drill ${start.after.number}`;
  if (!note) slot.append(target);
}

/**
 * Which of the 16 groups open. The page is an index, not a scroll: every group starts closed, and the
 * reader's own record decides which ones are worth opening — the one holding the next drill, and any
 * group with a drill that has something to say. Run on first paint and after a reset, never on every
 * repaint, so a group the reader closed stays closed.
 */
function revealGroups(summary) {
  const wanted = new Set(summary.groups.filter((group) => group.completed > 0).map((group) => group.id));
  if (summary.next?.group) wanted.add(summary.next.group);
  for (const node of document.querySelectorAll("details.dash-group")) {
    node.open = wanted.has(node.id.replace(/^group-/, ""));
  }
}

function paint({ openGroups = false } = {}) {
  const summary = summarise({ plan: state.plan, progress: state.progress });

  if (ui.complete) ui.complete.textContent = String(summary.completed);
  if (ui.total) ui.total.textContent = String(summary.total);
  if (ui.fill) {
    const percent = summary.total === 0 ? 0 : Math.round((summary.completed / summary.total) * 100);
    ui.fill.style.width = `${percent}%`;
    ui.fill.dataset.full = String(summary.completed === summary.total);
  }
  if (ui.note) ui.note.textContent = state.blocked ?? summaryLine(summary);

  for (const row of summary.rows) {
    const node = document.querySelector(`[data-lesson="${row.id}"]`);
    if (!node) continue;
    node.dataset.badge = row.badge;
    const label = node.querySelector("[data-badge-for]");
    if (label) {
      // The pill carries the badge too: its colour is keyed on `data-badge`, and a "Complete" that is
      // grey in the list but green in "Recently finished" reads as two different verdicts.
      label.dataset.badge = row.badge;
      label.textContent = BADGE_LABELS[row.badge] ?? BADGE_LABELS.not_started;
    }
    paintLock(node, row);
  }

  for (const group of summary.groups) {
    const counter = document.querySelector(`[data-group-count="${group.id}"]`);
    if (!counter) continue;
    // On the track a group nobody has started states how much is in it; on that group's own page the
    // count is the page's subject, so it always reads "N of M".
    const onTrack = counter.closest("summary") !== null;
    counter.textContent =
      onTrack && group.completed === 0
        ? `${group.total} drill${group.total === 1 ? "" : "s"}`
        : `${group.completed} of ${group.total}`;
  }

  const copy = nextCopy({ next: summary.next, nextReason: summary.nextReason });
  if (ui.nextLabel) ui.nextLabel.textContent = copy.label;
  if (ui.nextWhy) ui.nextWhy.textContent = copy.why;
  if (ui.nextLink) {
    if (summary.next) ui.nextLink.href = summary.next.path;
    ui.nextLink.hidden = !summary.next;
  }

  renderRecent(summary.recent);

  // Chrome that reports zero is hidden until there is something to report: a first-time reader gets no
  // rail pinned at zero, no legend for badges they have not earned, and no empty "Recently finished".
  if (ui.rail) ui.rail.hidden = summary.completed === 0;
  if (ui.legend) {
    const flagged = summary.rows.some((row) => row.badge === "stale" || row.badge === "needs_practice");
    ui.legend.hidden = !flagged;
  }
  if (ui.recentSection) ui.recentSection.hidden = summary.recent.length === 0;
  if (ui.resetSection) ui.resetSection.hidden = summary.completed === 0 || state.blocked !== null;

  if (openGroups) revealGroups(summary);
}

function disarm() {
  clearTimeout(state.timer);
  state.timer = undefined;
  if (!ui.reset) return;
  ui.reset.dataset.armed = "false";
  ui.reset.textContent = "Reset progress";
  if (ui.resetNote) ui.resetNote.textContent = "";
}

function armReset() {
  if (!ui.reset || !ui.resetNote) return;
  if (ui.reset.dataset.armed === "true") {
    // The unlock is a preference, not a completion: erasing progress does not put the walls back.
    const wiped = { ...emptyProgress(), unlocked: state.progress.unlocked === true };
    const cleared = writeProgress(wiped);
    disarm();
    if (cleared) {
      state.progress = wiped;
      paint({ openGroups: true });
      ui.resetNote.textContent = "Progress cleared. Every drill is unstarted again.";
    } else {
      ui.resetNote.textContent = "This browser would not let the page clear its storage.";
    }
    return;
  }
  ui.reset.dataset.armed = "true";
  ui.reset.textContent = "Click again to erase";
  ui.resetNote.textContent = "This deletes every completion in this browser. Click again within six seconds.";
  state.timer = setTimeout(disarm, RESET_CONFIRM_MS);
}

function main() {
  state.plan = readPlan();
  if (!state.plan) return;
  state.storage = safeStorage();
  state.blocked = state.storage
    ? null
    : "This browser blocks local storage, so nothing is saved. The drills still work, but this page cannot remember them.";
  state.progress = readProgress();

  paint({ openGroups: true });
  ui.reset?.addEventListener("click", armReset);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.reset?.dataset.armed === "true") disarm();
  });
}

main();
