/**
 * The credential id on a certificate: an opaque handle a stranger can type into `/verify`.
 *
 * Crockford base32 — digits and letters, minus `I`, `L`, `O` and `U` — chosen for the two ways this
 * string is actually read. It gets typed by hand off a PDF, so confusable characters are out; and it
 * appears in a URL case-insensitively, so `normaliseCredentialId` upper-cases and the database compares
 * the upper form. Sixteen characters at five bits each is exactly 80 bits, which is the same order as a
 * UUID's 122 but short enough to read aloud and short enough to fit on a certificate line.
 *
 * The id is generated here, not in Postgres, because this file is also what the tests import and what
 * proves the alphabet and the length — `0013` only constrains the shape with a check.
 */
import { randomBytes } from "node:crypto";

/** The 32 symbols, in Crockford's order. No I, L, O, U. */
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Five bits per symbol × 16 symbols = 80 bits of entropy. */
export const CREDENTIAL_LENGTH = 16;

/** The check constraint in `0013_certificates.sql`, kept in one place on the JS side. */
const SHAPE = /^[0-9A-HJKMNP-TV-Z]{16}$/;

/**
 * A fresh credential id.
 *
 * @param {(bytes: number) => Buffer} [source] injectable for tests; defaults to `crypto.randomBytes`.
 */
export function credentialId(source = randomBytes) {
  const bytes = source(10);
  if (!(bytes instanceof Uint8Array) || bytes.length < 10) {
    throw new TypeError("credentialId needs at least 10 random bytes");
  }
  let bits = 0;
  let buffer = 0;
  let out = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < CREDENTIAL_LENGTH) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

/** The form the database stores and compares: trimmed and upper-cased. */
export function normaliseCredentialId(value) {
  return String(value ?? "").trim().toUpperCase();
}

/**
 * Whether `value` could be a credential id at all.
 *
 * This is shape, not existence: the verify page uses it to tell "you mistyped" from "we have no record
 * of that", which are different sentences for a reader holding a certificate.
 */
export function isCredentialId(value) {
  return SHAPE.test(normaliseCredentialId(value));
}
