// Server-side analytics wrapper. ALL server-side event captures (API
// routes) go through this — never call posthog.capture from posthog-node
// directly. Mirrors the client wrapper:
//   1. PostHog (posthog-node) capture
//   2. Supabase composer_analytics_events insert via the existing service-role
//      client (getServiceSupabase)
//
// CRITICAL: skip when no stable identifier. Don't fall back to a literal
// "anonymous" string — that collapses every unauthenticated request into
// a single PostHog person and a single Supabase distinct_id, which dilutes
// every funnel and breaks per-user attribution.

import { getPostHogServer } from "./posthog-server";
import { getServiceSupabase } from "./supabase";

type EventProps = Record<string, unknown>;

export interface TrackServerContext {
  /** Authenticated Supabase user id. Preferred. Used to populate
   *  composer_analytics_events.user_id and as the PostHog distinctId. */
  userId?: string | null;
  /** Anonymous PostHog distinct_id passed through from the client.
   *  Used as the distinctId only when userId is absent. */
  distinctId?: string | null;
  /** PostHog session_id from the client, if available. */
  sessionId?: string | null;
}

/**
 * Identity resolution:
 *   - When userId is present, distinctId = userId. This matches PostHog's
 *     client-side identify() behavior: after identify, get_distinct_id()
 *     returns the user id, not the original device id.
 *   - For anonymous events (no userId), distinctId = the client-passed
 *     device id.
 *   - The original device id from BEFORE identify is NOT preserved at the
 *     Supabase mirror once a user has signed in. PostHog handles anon→identified
 *     merging via $identify events client-side; the Supabase mirror tracks
 *     the merged identity.
 *   - If we ever need to preserve the original device id post-signin, add an
 *     anonymous_id column to composer_analytics_events and forward posthog.get_property('$device_id')
 *     separately from the headers.
 */
export async function trackServer(
  eventName: string,
  context: TrackServerContext,
  properties: EventProps = {}
): Promise<void> {
  const distinctId = context.userId ?? context.distinctId;

  if (!distinctId) {
    console.warn(`trackServer skipped — no distinctId for ${eventName}`);
    return;
  }

  // PostHog server-side capture. flushAt:1 + await flush() ensures the
  // event drains before the serverless function terminates without shutting
  // down the singleton client on warm Vercel instances.
  const posthog = getPostHogServer();
  if (posthog) {
    try {
      posthog.capture({
        distinctId,
        event: eventName,
        properties,
      });
      await posthog.flush();
    } catch (err) {
      console.error("PostHog server capture failed:", err);
    }
  }

  // 2. Supabase mirror via service-role client (bypasses RLS).
  try {
    const supabase = getServiceSupabase();
    await supabase.from("composer_analytics_events").insert({
      user_id: context.userId ?? null,
      distinct_id: distinctId,
      session_id: context.sessionId ?? null,
      event_name: eventName,
      properties,
    });
  } catch (err) {
    console.error("Supabase analytics mirror failed:", err);
  }
}
