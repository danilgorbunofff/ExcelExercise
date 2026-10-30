// Credential checks the forms run before they spend a network round trip.
//
// Supabase enforces its own password policy; this is the earlier, friendlier gate, and it is
// deliberately the same rule on the server action and in the page, so a form that says "8
// characters" cannot be bypassed by posting the form directly.

export const MIN_PASSWORD = 8;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @returns {{ ok: boolean, errors: { email?: string, password?: string } }}
 */
export function validateCredentials({ email, password } = {}, { requirePassword = true } = {}) {
  const errors = {};
  const address = typeof email === "string" ? email.trim() : "";
  if (!address) errors.email = "Enter your email address.";
  else if (!EMAIL.test(address)) errors.email = "That does not look like an email address.";

  if (requirePassword) {
    const secret = typeof password === "string" ? password : "";
    if (!secret) errors.password = "Enter your password.";
    else if (secret.length < MIN_PASSWORD) {
      errors.password = `Use at least ${MIN_PASSWORD} characters.`;
    } else if (secret.length > 72) {
      // bcrypt hashes the first 72 bytes and silently ignores the rest; refusing is honest.
      errors.password = "Use at most 72 characters.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
