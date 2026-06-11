"use client";

// Client-side analytics wrapper. ALL client event captures go through
// this — never call `posthog.capture` directly. Two reasons:
//   1. PostHog and Supabase composer_analytics_events stay in lockstep.
//   2. The trust boundary (which client may insert what) is enforced
//      by /api/analytics/track + RLS, not the browser.
//
// Failures are swallowed (fire-and-forget). Analytics must never break
// the app. PostHog client capture is best-effort; the Supabase mirror
// is best-effort. If one succeeds and the other fails, that's fine.

import posthog from "posthog-js";

type EventProps = Record<string, unknown>;

interface PosthogWithDistinct {
  get_distinct_id?: () => string | undefined;
  get_session_id?: () => string | undefined;
}

/**
 * Canonical event names. Use these at call sites instead of string literals
 * to get autocomplete and grep-ability. Adding a new event? Add it here.
 */
export const EVENTS = {
  // Identity
  USER_SIGNED_UP: "user_signed_up",
  USER_SIGNED_IN: "user_signed_in",
  USER_SIGNED_OUT: "user_signed_out",

  // Compose funnel
  COMPOSE_STARTED: "compose_started",
  COMPOSE_STEP_COMPLETED: "compose_step_completed",
  COMPOSE_START_TIME_SELECTED: "compose_start_time_selected",
  COMPOSE_SUBMITTED: "compose_submitted",
  COMPOSE_ABANDONED: "compose_abandoned",
  ITINERARY_GENERATED: "itinerary_generated",
  ITINERARY_GENERATION_FAILED: "itinerary_generation_failed",

  // Engagement
  ITINERARY_VIEWED: "itinerary_viewed",
  ITINERARY_DWELL_TIME: "itinerary_dwell_time",
  ITINERARY_ZERO_ENGAGEMENT: "itinerary_zero_engagement",
  // Removed 2026-06-11: ITINERARY_FALLBACK_SINGLE_STOP. The composer
  // single-stop fallback was deleted with the strict-filters change —
  // unfillable stop 1 now fires `compose_failed` with
  // zeroing_stage="proximity" before the response is built.
  ITINERARY_EXTENDED_TO_THREE: "itinerary_extended_to_three",
  STOP_SWAPPED: "stop_swapped",
  STOP_SWAP_REASON_SHOWN: "stop_swap_reason_shown",
  STOP_SWAP_REASON_SUBMITTED: "stop_swap_reason_submitted",
  STOP_SWAP_REASON_SKIPPED: "stop_swap_reason_skipped",
  STOP_ADDED: "stop_added",
  TIME_SLOT_SELECTED: "time_slot_selected",
  RESERVATION_CLICKED: "reservation_clicked",
  MAPS_OPENED: "maps_opened",
  VENUE_DETAIL_OPENED: "venue_detail_opened",
  ITINERARY_MAP_PIN_TAPPED: "itinerary_map_pin_tapped",
  ITINERARY_MAP_EXPANDED: "itinerary_map_expanded",

  // Save / share
  ITINERARY_SAVED: "itinerary_saved",
  ITINERARY_CALENDAR_ADDED: "itinerary_calendar_added",
  SHARE_LINK_COPIED: "share_link_copied",
  SHARE_LINK_VISITED: "share_link_visited",
  ONBOARDING_COMPLETED: "onboarding_completed",

  // Errors
  ERROR_ENCOUNTERED: "error_encountered",
  FEATURE_BLOCKED: "feature_blocked",
} as const;

export function track(eventName: string, properties: EventProps = {}) {
  if (typeof window === "undefined") {
    console.warn(`track() called server-side for ${eventName} — use trackServer instead`);
    return;
  }

  // 1. PostHog
  try {
    posthog.capture(eventName, properties);
  } catch (err) {
    console.error("PostHog capture failed:", err);
  }

  // 2. Supabase mirror (via internal API route to use the service role server-side)
  const ph = posthog as PosthogWithDistinct;
  const distinctId = ph.get_distinct_id?.();

  if (!distinctId) {
    // PostHog not initialized yet — skip Supabase mirror.
    // PostHog client buffers and will deliver once init completes.
    return;
  }

  // Fire-and-forget. The `void` discards the Promise so this never blocks the caller.
  // Do NOT add `await` — that would tie user-perceived latency to /api/analytics/track.
  void fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_name: eventName,
      properties,
      distinct_id: distinctId,
      session_id: ph.get_session_id?.() ?? null,
    }),
  })
    .then((res) => {
      if (!res.ok) {
        console.error(`analytics mirror failed: ${res.status} for ${eventName}`);
      }
    })
    .catch(() => {
      // Network failure swallowed — PostHog still has the data
    });
}

/**
 * Build x-ph-* headers to forward the current PostHog distinct_id /
 * session_id to server routes that emit events via trackServer. Spread
 * into fetch's headers when calling /api/generate, /api/swap-stop, etc.
 * Without these, server-side captures fall back to userId-only and skip
 * entirely for anonymous users.
 */
export function getAnalyticsHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const ph = posthog as PosthogWithDistinct;
  const headers: Record<string, string> = {};
  const distinctId = ph.get_distinct_id?.();
  const sessionId = ph.get_session_id?.();
  if (distinctId) headers["x-ph-distinct-id"] = distinctId;
  if (sessionId) headers["x-ph-session-id"] = sessionId;
  return headers;
}

/**
 * Person-property helpers. PostHog $set updates the latest values;
 * $set_once only writes on first identify (signup_at, signup_source).
 * No Supabase mirror — person properties live on PostHog only.
 */
export function setPersonProperties(props: EventProps) {
  if (typeof window === "undefined") return;
  try {
    posthog.setPersonProperties(props);
  } catch (err) {
    console.error("PostHog setPersonProperties failed:", err);
  }
}

export function setPersonPropertiesOnce(props: EventProps) {
  if (typeof window === "undefined") return;
  try {
    // posthog-js exposes the once variant via the second arg.
    posthog.setPersonProperties(undefined, props);
  } catch (err) {
    console.error("PostHog setPersonPropertiesOnce failed:", err);
  }
}

/**
 * Increment a numeric person property. Wraps posthog.people.increment
 * with a safe no-op fallback when the SDK shape varies.
 */
export function incrementPersonProperty(name: string, amount = 1) {
  if (typeof window === "undefined") return;
  try {
    const people = (posthog as { people?: { increment?: (p: Record<string, number>) => void } }).people;
    people?.increment?.({ [name]: amount });
  } catch (err) {
    console.error("PostHog increment failed:", err);
  }
}
