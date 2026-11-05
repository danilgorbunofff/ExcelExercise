/**
 * The drawer behind the header's Menu button, on every page.
 *
 * It is a `<dialog>`, so the browser owns the parts that are easy to get wrong: the scrim, making the
 * page behind it inert, the focus trap, Escape, and putting focus back on the button afterwards. This
 * file only opens it, closes it, and keeps `aria-expanded` telling the truth.
 *
 * Without this script the same rows are still there: `<noscript>` in the drawer's own markup hides the
 * button and lets the closed dialog sit in the flow, so the site keeps exactly one navigation either way.
 */

const dialog = document.getElementById("site-menu");
const toggle = document.getElementById("menu-open");

if (dialog && toggle) {
  const close = dialog.querySelector(".menu-close");

  const setExpanded = (open) => toggle.setAttribute("aria-expanded", String(open));

  toggle.addEventListener("click", () => {
    if (!dialog.open) dialog.showModal();
    setExpanded(true);
  });

  close?.addEventListener("click", () => dialog.close());

  // A click on the dialog itself is a click on the backdrop: the sheet and its rows stop the event.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => setExpanded(false));

  // The one row that is this page is marked, so the drawer says where the reader already is.
  const here = location.pathname.replace(/\/$/, "") || "/";
  for (const link of dialog.querySelectorAll("a[href^='/']")) {
    if ((link.getAttribute("href").replace(/\/$/, "") || "/") === here) {
      link.setAttribute("aria-current", "page");
    }
  }
}
