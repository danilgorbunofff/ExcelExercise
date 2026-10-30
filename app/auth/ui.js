import Link from "next/link";

// Presentational only: no directives, no request APIs, so both the server pages and the client forms
// can render these. Anything that needs the session belongs in `./shell.js`.

export function AuthCard({ title, lede, children }) {
  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">{title}</h1>
      {lede ? <p className="auth-lede">{lede}</p> : null}
      {children}
    </section>
  );
}

export function Notice({ children }) {
  return <p className="auth-notice">{children}</p>;
}

/**
 * The Suspense fallback. It is deliberately not a `Notice`: a page that is still streaming has not
 * decided what to tell the learner yet, and a locator or a screen reader pointed at the notices would
 * otherwise find "Loading…" sitting where an explanation is expected.
 */
export function Loading() {
  return (
    <p className="auth-loading" role="status">
      Loading the form…
    </p>
  );
}

export function ErrorText({ children }) {
  return children ? (
    <p className="auth-error" role="alert">
      {children}
    </p>
  ) : null;
}

export function OkText({ children }) {
  return children ? (
    <p className="auth-ok" role="status">
      {children}
    </p>
  ) : null;
}

export function Field({ label, name, type = "text", ...rest }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input name={name} type={type} {...rest} />
    </label>
  );
}

export function Submit({ pending, disabled, children }) {
  return (
    <button className="auth-submit" type="submit" disabled={pending || disabled}>
      {children}
    </button>
  );
}

export function Links({ items }) {
  return (
    <ul className="auth-links">
      {items.map(({ href, label }) => (
        <li key={href}>
          <Link href={href}>{label}</Link>
        </li>
      ))}
    </ul>
  );
}
