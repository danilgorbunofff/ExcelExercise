const sha = () => process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "unknown";

export function GET() {
  return Response.json({ status: "ok", sha: sha() });
}
