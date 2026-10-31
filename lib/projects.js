/**
 * The Next shell's view of the project track. Same shape as `lib/site.js` and for the same reason: the
 * loader in `legacy/src/site/projects.mjs` is the only thing that decides what a project is, so the
 * page, the dataset route and the progress route all read it from here rather than re-reading files.
 */
import { join } from "node:path";

import { loadProjects } from "../legacy/src/site/projects.mjs";

// `new URL("..", import.meta.url)` makes Turbopack try to bundle `..` as an asset; cwd is the repo.
const ROOT = process.cwd();

let projects;

/** Loaded once per process: the projects are authored JSON and cannot change under us. */
export function loadProjectTrack() {
  if (!projects) projects = loadProjects(join(ROOT, "legacy/content"));
  return projects;
}

/** The dataset a URL names, or null. The whitelist the dataset route answers from. */
export function datasetFor(file) {
  return loadProjectTrack().datasets.find((dataset) => dataset.file === file) ?? null;
}
