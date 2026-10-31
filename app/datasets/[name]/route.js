import { spreadsheet } from "../../../legacy/src/xlsx.mjs";
import { datasetFor, loadProjectTrack } from "../../../lib/projects.js";

const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Every dataset is a deterministic function of the authored project, so the route is prerendered: the
 * bytes are built once with the site and served from the build output, not re-zipped per request. The
 * name is answered from the loader's whitelist — the URL never becomes a path.
 */
export function generateStaticParams() {
  return loadProjectTrack().datasets.map((dataset) => ({ name: dataset.file }));
}

export async function GET(_request, { params }) {
  const dataset = datasetFor((await params).name);
  if (!dataset) return new Response("Not found", { status: 404 });

  const bytes = spreadsheet(dataset.sheet);
  return new Response(bytes, {
    headers: {
      "content-type": MIME,
      "content-disposition": `attachment; filename="${dataset.file}"`,
      "content-length": String(bytes.byteLength),
    },
  });
}
