import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// Scope: the Next app and its helpers. `legacy/` is frozen, `packages/` and `tests/` are plain Node.
// Rules that would flag the existing, intentional patterns (the shared-template `dangerouslySetInnerHTML`)
// are warnings, so `npm run lint` fails only on real errors.
export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "legacy/**",
    "packages/**",
    "tests/**",
    "e2e*/**",
    "scripts/**",
    "public/**",
    "reference/**",
    ".review/**",
    "lighthouse-reports/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    rules: {
      "react/no-danger": "off",
      "@next/next/no-html-link-for-pages": "warn",
      "@next/next/no-img-element": "warn",
      // Existing findings in working code, kept visible as warnings until each is triaged (not fixed blind).
      "react/no-unescaped-entities": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "@next/next/no-sync-scripts": "warn",
    },
  },
]);
