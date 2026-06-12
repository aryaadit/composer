// Server-side analytics transport. Type-narrowed mirror of the client
// `track()` — the schema lives in src/lib/analytics/events.ts so server
// route handlers can import EVENTS / EventSchemas directly (the schema
// module is isomorphic, no "use client").
//
// CRITICAL: skip when no stable identifier. Don't fall back to a literal
// "anonymous" string — that collapses every unauthenticated request into
// a single PostHog person and a single Supabase distinct_id, which
// dilutes every funnel and breaks per-user attribution.
//
// PII: same mirrorOnlyProps mechanism as the client wrapper. PostHog
// gets `opts.props`; the Supabase mirror gets the union.

import { getPostHogServer } from "./posthog-server";
import { getServiceSupabase } from "./supabase";
import type { EventName, EventSchemas } from "@/lib/analytics/events";

export type { EventName, EventSchemas };
export {
  EVENTS,
  buildComposeContext,
  buildItineraryContext,
} from "@/lib/analytics/events";

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

interface TrackServerOptions<E extends EventName> {
  props: EventSchemas[E];
  /** Mirror-only payload. Never sent to PostHog; concatenated with
   * `props` for the Supabase insert. */
  mirrorOnlyProps?: Record<string, unknown>;
}

/** Production-only gate. Identical contract to the client wrapper:
 * server captures land in PostHog + the Supabase mirror only when
 * Vercel reports the deploy as production. */
function isProductionEnv(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/**
 * Identity resolution:
 *   - When userId is present, distinctId = userId. This matches PostHog's
 *     client-side identify() behavior.
 *   - For anonymous events (no userId), distinctId = the client-passed
 *     device id.
 *   - The original device id from BEFORE identify is NOT preserved at the
 *     Supabase mirror once a user has signed in.
 */
export async function trackServer<E extends EventName>(
  event: E,
  context: TrackServerContext,
  opts: TrackServerOptions<E>,
): Promise<void>;
export async function trackServer<E extends EventName>(
  event: E,
  context: TrackServerContext,
  props: EventSchemas[E],
): Promise<void>;
export async function trackServer<E extends EventName>(
  event: E,
  context: TrackServerContext,
  arg: TrackServerOptions<E> | EventSchemas[E],
): Promise<void> {
  const distinctId = context.userId ?? context.distinctId;
  if (!distinctId) {
    console.warn(`trackServer skipped — no distinctId for ${event}`);
    return;
  }
  if (!isProductionEnv()) {
    return;
  }
  const { props, mirrorOnlyProps } = isTrackServerOptions<E>(arg)
    ? arg
    : { props: arg, mirrorOnlyProps: undefined };

  // PostHog server-side capture.
  const posthog = getPostHogServer();
  if (posthog) {
    try {
      posthog.capture({
        distinctId,
        event,
        properties: props as Record<string, unknown>,
      });
      await posthog.flush();
    } catch (err) {
      console.error("PostHog server capture failed:", err);
    }
  }

  // Supabase mirror via service-role client (bypasses RLS).
  try {
    const supabase = getServiceSupabase();
    const mirrorPayload = mirrorOnlyProps
      ? { ...(props as Record<string, unknown>), ...mirrorOnlyProps }
      : (props as Record<string, unknown>);
    await supabase.from("composer_analytics_events").insert({
      user_id: context.userId ?? null,
      distinct_id: distinctId,
      session_id: context.sessionId ?? null,
      event_name: event,
      properties: mirrorPayload,
    });
  } catch (err) {
    console.error("Supabase analytics mirror failed:", err);
  }
}

function isTrackServerOptions<E extends EventName>(
  arg: TrackServerOptions<E> | EventSchemas[E],
): arg is TrackServerOptions<E> {
  return (
    typeof arg === "object" &&
    arg !== null &&
    "props" in arg &&
    Object.keys(arg).every((k) => k === "props" || k === "mirrorOnlyProps")
  );
}
