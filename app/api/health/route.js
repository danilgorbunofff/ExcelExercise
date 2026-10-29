import { execFileSync } from "node:child_process";

/**
 * The commit this artifact was built from. `/api/health` is prerendered, so this runs at build
 * time, not per request: CI exports `GIT_SHA` and the value is baked in; a local build asks git so
 * the endpoint is honest instead of "unknown"; a checkout with no `.git` (a packed deploy without
 * the env var) keeps the fallback rather than pretending.
 */
function buildSha(cwd = process.cwd()) {
  const fromEnvironment = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA;
  if (fromEnvironment) return fromEnvironment;
  try {
    return (
      execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || "unknown"
    );
  } catch {
    return "unknown";
  }
}

export { buildSha };

export function GET() {
  return Response.json({ status: "ok", sha: buildSha() });
}
