// Production-only PostHog client init. Vercel previews, branch deploys,
// and localhost all skip init — events captured before init are buffered
// and discarded by posthog-js. The Supabase mirror is gated symmetrically
// inside the analytics wrappers.
//
// NEXT_PUBLIC_VERCEL_ENV is populated by Vercel's "System Environment
// Variables" (must be enabled on the project — default ON for new
// Vercel projects). If it isn't enabled, the gate will close on
// production too; verify in Vercel project settings before deploy.

import posthog from "posthog-js";

// Double-gate on env AND key presence. The env gate prevents preview /
// dev pollution; the key gate ensures a missing NEXT_PUBLIC_POSTHOG_KEY
// in a production deploy fails loudly to console.error instead of
// silently dropping every event via `posthog.init(undefined, ...)`.
// This matches the symmetric guard in src/lib/posthog-server.ts.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production" && POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
    },
    debug: false,
  });
} else if (
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production" &&
  !POSTHOG_KEY
) {
  // Surface the misconfiguration loudly so deploy QA catches it before
  // it looks like zero-volume in PostHog.
  console.error(
    "[analytics] NEXT_PUBLIC_POSTHOG_KEY is missing in production. " +
      "PostHog init skipped — no client-side events will be captured.",
  );
}
