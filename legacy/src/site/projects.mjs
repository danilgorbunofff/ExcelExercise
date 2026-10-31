/**
 * Projects: the same authored screens as a drill, over one spreadsheet each.
 *
 * A lesson is one file per screen because every screen is its own question about its own rows. A
 * project is the opposite shape — one dataset, eight tasks that all read it — so the file is authored
 * once on the project and every task screen is filled with it at load time. The screens themselves go
 * through the same validator the lesson catalog uses, so a task is exactly as strict as a lesson.
 *
 * Nothing here is in the legacy build's page set: projects are served by the Next app, and this module
 * is the one place that decides what they are, so the page, the dataset writer and the progress route
 * cannot disagree about the list.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { LEVELS, normalizeLesson } from "../../../packages/content/index.js";

import { esc } from "./html.mjs";

const DATASET_FILE = /^[a-z0-9]+(-[a-z0-9]+)*\.xlsx$/;

/** Where the app serves a project. Not `/excel/`: a project is not a drill and its rail is not the track. */
export const PROJECT_BASE = "/learn/projects";

/** The shelf itself. One level up from a project, and where a project's rail sends you back to. */
export const PROJECT_SHELF = "/projects";

function fail(file, problem) {
  throw new Error(`projects/${file}: ${problem}`);
}

function readJson(path, file) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    fail(file, `cannot read (${error.code ?? error.message})`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(file, `invalid JSON (${error.message})`);
  }
}

function text(value, file, label, max = Infinity) {
  if (typeof value !== "string" || value.trim() === "") fail(file, `${label} must be a non-empty string`);
  if (value.length > max) fail(file, `${label} is ${value.length} characters, the limit is ${max}`);
  return value.trim();
}

/**
 * The reading a project opens with. Two sections is the floor: what the file is, and what the work is.
 * One section is a caption, not a brief.
 */
function readBrief(raw, file) {
  if (!Array.isArray(raw) || raw.length < 2) {
    fail(file, "brief must be an array of at least two sections, what the file is, then what the work is");
  }
  return raw.map((section, index) => {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      fail(file, `brief[${index}] must be an object with a heading and a body`);
    }
    return {
      heading: text(section.heading, file, `brief[${index}].heading`, 80),
      body: text(section.body, file, `brief[${index}].body`),
    };
  });
}

function readDataset(raw, file) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail(file, "dataset must be an object with a file, a description and a sheet");
  }
  // Authored, so it is checked rather than trusted: this name becomes a URL and a path under public/.
  if (!DATASET_FILE.test(raw.file ?? "")) {
    fail(file, `dataset.file ${JSON.stringify(raw.file)} must be lowercase-kebab and end in .xlsx`);
  }
  const sheet = raw.sheet;
  if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) {
    fail(file, "dataset.sheet must be an object with a name, a startCell and rows");
  }
  return {
    file: raw.file,
    description: text(raw.description, file, "dataset.description", 200),
    sheet,
  };
}

/**
 * One project, validated. The screens are the lesson schema's screens with the project's sheet filled
 * in, so `renderWorkbook`, the preview and the `.xlsx` writer all read the same rows they already read
 * for a workbook lesson. A screen that tries to bring its own sheet is refused: two sheets on one
 * download is a learner opening the file and not finding the rows the task asked about.
 */
function normalizeProject(raw, file) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(file, "must be a JSON object");
  const dataset = readDataset(raw.dataset, file);
  const brief = readBrief(raw.brief, file);

  if (!Array.isArray(raw.screens) || raw.screens.length === 0) fail(file, "screens must be a non-empty array");
  const screens = raw.screens.map((screen, index) => {
    if (!screen || typeof screen !== "object" || Array.isArray(screen)) {
      fail(file, `screens[${index}] must be an object`);
    }
    if (screen.type !== "workbook") {
      fail(file, `screens[${index}].type ${JSON.stringify(screen.type)}, a project task is a workbook screen`);
    }
    if (screen.sheet !== undefined) {
      fail(file, `screens[${index}].sheet, a project task reads the project's dataset, so the sheet is not authored twice`);
    }
    return { ...screen, sheet: dataset.sheet };
  });

  const lesson = normalizeLesson({ ...raw, screens }, file);
  return {
    ...lesson,
    // The player and the page need the tasks to name the one file they all read.
    screens: lesson.screens.map((screen) => ({ ...screen, file: dataset.file })),
    brief,
    dataset,
  };
}

/**
 * The track a project page is served from. The free count is the lesson rule applied to four projects:
 * everything is free except the last one, which is the gate the pricing page sells through.
 */
function projectTrack(projects) {
  return {
    id: "projects",
    title: "Guided projects",
    promise: "Four spreadsheets, eight tasks each. The work a hiring test would ask for.",
    lessonNoun: "Project",
    eyebrow: "Project track",
    // The paywall's sentence about what the paid half is. The drill track's is the default in the client;
    // four projects are not rounding, lookups and text splitting, so they say what they are.
    paidHalf: "are the paid half of the shelf",
    freeLessonCount: Math.max(projects.length - 1, 0),
    showAnswerAfter: 3,
  };
}

export function loadProjects(contentDir) {
  const dir = join(contentDir, "projects");
  let files;
  try {
    files = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    fail("projects/", `cannot read ${dir} (${error.code ?? error.message})`);
  }
  if (files.length === 0) fail("projects/", "no project files, the project track would render an empty rail");

  const projects = files
    .map((file) => normalizeProject(readJson(join(dir, file), file), file))
    // Easiest first, so the rail climbs and the gated fourth is the one that earns it. Ties break on
    // the file name, which keeps the order stable across machines.
    .sort((left, right) => left.level - right.level || (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0));

  const seen = new Set();
  for (const project of projects) {
    if (seen.has(project.slug)) fail(`${project.id}.json`, `duplicate slug "${project.slug}"`);
    seen.add(project.slug);
  }

  const track = projectTrack(projects);
  const index = projects.map((project, position) => {
    const previous = position > 0 ? projects[position - 1] : null;
    const following = position < projects.length - 1 ? projects[position + 1] : null;
    const number = position + 1;
    return {
      exercise: project,
      number,
      slug: project.slug,
      level: LEVELS[project.level],
      // Identical to a lesson's rule so the paywall reads one number, not two.
      free: number <= track.freeLessonCount,
      group: null,
      brief: project.brief,
      path: `${PROJECT_BASE}/${project.slug}`,
      prev: previous,
      prevPath: previous ? `${PROJECT_BASE}/${previous.slug}` : PROJECT_SHELF,
      prevLabel: previous ? previous.title : "All projects",
      next: following,
      nextPath: following ? `${PROJECT_BASE}/${following.slug}` : null,
    };
  });

  return {
    track,
    index,
    entryFor: (slug) => index.find((entry) => entry.slug === slug) ?? null,
    /** Every dataset the track ships, for the route that serves them and the script that writes them. */
    datasets: projects.map((project) => project.dataset),
  };
}

/** One project, as the index lists it: what it is called, what it teaches, and the file it reads. */
function renderProjectCard(entry) {
  const { exercise } = entry;
  const tasks = `${exercise.screens.length} tasks`;
  return `
          <li class="project-card"${entry.free ? "" : ' data-gated="true"'}>
            <p class="project-meta">
              <span class="rail-num" aria-hidden="true">${String(entry.number).padStart(2, "0")}</span>
              <span class="chip chip-level">${esc(entry.level)}</span>
              ${entry.free ? "" : `<span class="chip chip-trial">Trial</span>`}
            </p>
            <h2 class="project-title"><a class="project-link" href="${esc(entry.path)}">${esc(exercise.title)}</a></h2>
            <p class="project-outcome">${esc(exercise.docs.outcome)}</p>
            <p class="project-note">${esc(tasks)} · ${esc(exercise.dataset.description)}</p>
          </li>`;
}

/**
 * The project shelf. The drill track has a rail and a dashboard; four projects need neither — they need
 * one page that says what each file is, in the order they climb, with the one gate marked where it is.
 */
export function prepareProjectsPage({ track, index }) {
  const cards = index.map((entry) => renderProjectCard(entry)).join("");
  const body = `<main class="shell" id="main">
      <div class="page-head">
        <p class="eyebrow">${esc(track.eyebrow ?? "Project track")} · ${index.length} project${
          index.length === 1 ? "" : "s"
        }</p>
        <h1>${esc(track.title)}</h1>
        <p class="lede">${esc(track.promise)}</p>
      </div>

      <ol class="project-list">${cards}
      </ol>

      <p class="project-foot">Every project opens the same player a drill does, and every task reads the one
        <code>.xlsx</code> its brief names, download it, work in it, and answer with the number the sheet gives you.</p>
    </main>`;

  return {
    body,
    page: {
      path: PROJECT_SHELF,
      title: track.title,
      description: track.promise,
      counter: `${index.length} projects`,
      bodyClass: "projects-page",
      skipLabel: "projects",
    },
  };
}
