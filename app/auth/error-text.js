"use client";

import { useEffect, useRef } from "react";

/**
 * The error paragraph from `./ui.js`, plus the one thing it cannot do there: `ui.js` is rendered by
 * server pages as well as by the client forms, so it may not hold a hook. A rejected sign-in leaves
 * the message above the fields the visitor just filled, where the eye is already at the submit
 * button; moving the focus to it is how a keyboard or screen-reader user learns the attempt failed
 * instead of being put back at the top of the form with nothing announced.
 */
export function FocusedError({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (children) ref.current?.focus();
  }, [children]);

  return children ? (
    <p className="auth-error" role="alert" tabIndex={-1} ref={ref}>
      {children}
    </p>
  ) : null;
}
