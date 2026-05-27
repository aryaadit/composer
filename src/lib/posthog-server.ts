// Server-side PostHog client (posthog-node). Used by API routes via the
// analytics-server wrapper to capture events from inside Vercel
// serverless functions. flushAt:1 + flushInterval:0 ensures the queue
// drains before the function terminates; the wrapper then calls
// shutdown() to wait for the network round-trip.

import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
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
