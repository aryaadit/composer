import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// PostHog SDKs are only allowed inside the analytics wrappers (the
// typed track/trackServer surface) and the two integration points that
// must touch them directly: instrumentation-client.ts to call
// posthog.init at boot, and AuthProvider.tsx to call identify / reset
// on the auth lifecycle. Any other importer goes through the wrappers
// so the audit's "47 free-floating literals" pattern can't recur.
const POSTHOG_RESTRICT_RULE = [
  "error",
  {
    paths: [
      {
        name: "posthog-js",
        message:
          "Import from `@/lib/analytics` (track, EVENTS, …) instead. " +
          "Direct posthog-js imports are allowed only in instrumentation-client.ts " +
          "and src/components/providers/AuthProvider.tsx (identify / reset).",
      },
      {
        name: "posthog-node",
        message:
          "Import from `@/lib/analytics-server` (trackServer, EVENTS, …) instead. " +
          "Direct posthog-node imports are allowed only in src/lib/posthog-server.ts.",
      },
    ],
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone scripts — not app code, different lint rules apply.
    "scripts/**",
  ]),
  // Default rule applied to every file…
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": POSTHOG_RESTRICT_RULE,
    },
  },
  // …then exempt the wrappers + the two integration points so they can
  // call posthog-js / posthog-node directly. Order matters: the more
  // specific override comes after the global default.
  {
    files: [
      "src/lib/analytics.ts",
      "src/lib/analytics-server.ts",
      "src/lib/posthog-server.ts",
      "instrumentation-client.ts",
      "src/components/providers/AuthProvider.tsx",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
