// Server-side PostHog client (posthog-node). Used by API routes via the
// analytics-server wrapper to capture events from inside Vercel
// serverless functions. flushAt:1 + flushInterval:0 ensures the queue
// drains before the function terminates; the wrapper then calls
// shutdown() to wait for the network round-trip.
//
// Production-only: returns null on any non-production deploy so preview
// branches, localhost, and dev never emit into the production PostHog
// project. VERCEL_ENV is populated by Vercel's "System Environment
// Variables" — must be enabled on the project (default ON for new
// Vercel projects).

import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
  if (process.env.VERCEL_ENV !== "production") return null;
  const key = process.env.POSTHOG_KEY;
  if (!key) return null;
  if (!posthogClient) {
    posthogClient = new PostHog(key, {
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}
