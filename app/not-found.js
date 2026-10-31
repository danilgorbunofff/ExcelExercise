import { notFoundView } from "../lib/not-found.js";

// `notFound()` lands here from the lesson route (unknown slug), and Next uses this file for every
// address the app does not have. The markup is shared with the proxy, which has to answer the same
// page itself when an unknown param would otherwise be flushed as a `200` — see `lib/not-found.js`.
export const metadata = {
  title: "Page not found",
};

export default function NotFound() {
  const { skip, header, body, footer } = notFoundView();

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: skip }} />
      <div dangerouslySetInnerHTML={{ __html: header }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <div dangerouslySetInnerHTML={{ __html: footer }} />
    </>
  );
}
