"use client";

// Client-side analytics transport. The schema (EVENTS + EventSchemas +
// context builders) lives in src/lib/analytics/events.ts and is
// isomorphic; this file is the type-narrowed `track()` plus PostHog ↔
// Supabase mirror plumbing. Two reasons to never bypass it:
//   1. PostHog and Supabase composer_analytics_events stay in lockstep.
//   2. The trust boundary (which client may insert what) is enforced
//      by /api/analytics/track + RLS, not the browser.
//
// Failures are swallowed (fire-and-forget). Analytics must never break
// the app.
//
// PII handling: a small subset of events (today: swap_reason_submitted)
// carry free-text fields that should NOT reach PostHog but SHOULD reach
// the Supabase mirror for ad-hoc analysis. Use the `{ props,
// mirrorOnlyProps }` call shape: PostHog gets `props`; the mirror gets
// `{ ...props, ...mirrorOnlyProps }`. The narrow shape stays typed via
// EventSchemas; mirrorOnlyProps is loosely typed since it's PII-class.

import posthog from "posthog-js";
import type { EventName, EventSchemas } from "@/lib/analytics/events";

export {
  EVENTS,
  buildComposeContext,
  buildItineraryContext,
  type ComposeContext,
  type ComposeContextInputs,
  type EventName,
  type EventSchemas,
} from "@/lib/analytics/events";

interface PosthogWithDistinct {
  get_distinct_id?: () => string | undefined;
  get_session_id?: () => string | undefined;
}

/** Production-only gate. Vercel populates NEXT_PUBLIC_VERCEL_ENV via
 * "System Environment Variables" — must be enabled on the project (it
 * is by default for new Vercel projects, but verify). When the env
 * variable is absent (localhost without `vercel dev`), captures are
 * suppressed so dev traffic doesn't pollute the prod project. */
function isProductionEnv(): boolean {
  return process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
}

interface TrackOptions<E extends EventName> {
  /** PostHog + mirror payload, narrowed by event name. */
  props: EventSchemas[E];
  /** Mirror-only payload. Concatenated with `props` for the Supabase
   * insert; NEVER sent to PostHog. Use for free-text PII (e.g.
   * `swap_reason_submitted`'s `reason_text`). */
  mirrorOnlyProps?: Record<string, unknown>;
}

/** Typed event capture. PostHog gets `opts.props`; the Supabase mirror
 * gets `{ ...opts.props, ...opts.mirrorOnlyProps }`. */
export function track<E extends EventName>(event: E, opts: TrackOptions<E>): void;
/** Sugar: omit the wrapper when there are no mirror-only props. */
export function track<E extends EventName>(event: E, props: EventSchemas[E]): void;
export function track<E extends EventName>(
  event: E,
  arg: TrackOptions<E> | EventSchemas[E],
): void {
  if (typeof window === "undefined") {
    console.warn(`track() called server-side for ${event} — use trackServer instead`);
    return;
  }
  if (!isProductionEnv()) {
    return;
  }
  const { props, mirrorOnlyProps } =
    isTrackOptions<E>(arg)
      ? arg
      : { props: arg, mirrorOnlyProps: undefined };

  // PostHog gets `props` only — never the mirror-only payload.
  try {
    posthog.capture(event, props as Record<string, unknown>);
  } catch (err) {
    console.error("PostHog capture failed:", err);
  }

  const ph = posthog as PosthogWithDistinct;
  const distinctId = ph.get_distinct_id?.();
  if (!distinctId) {
    // PostHog buffers and delivers when init completes; mirror row is
    // dropped for events that fire before init. Acceptable per the
    // 2026-06-11 audit.
    return;
  }

  // Mirror gets the union — PII-class fields land in Supabase only.
  const mirrorPayload = mirrorOnlyProps
    ? { ...(props as Record<string, unknown>), ...mirrorOnlyProps }
    : (props as Record<string, unknown>);

  void fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_name: event,
      properties: mirrorPayload,
      distinct_id: distinctId,
      session_id: ph.get_session_id?.() ?? null,
    }),
  })
    .then((res) => {
      if (!res.ok) {
        console.error(`analytics mirror failed: ${res.status} for ${event}`);
      }
    })
    .catch(() => {
      // Network failure swallowed — PostHog still has the data.
    });
}

function isTrackOptions<E extends EventName>(
  arg: TrackOptions<E> | EventSchemas[E],
): arg is TrackOptions<E> {
  return (
    typeof arg === "object" &&
    arg !== null &&
    "props" in arg &&
    // Differentiate from an EventSchemas[E] payload that happens to have
    // a `props` field (none today; if one ever does, switch to a more
    // specific marker).
    Object.keys(arg).every((k) => k === "props" || k === "mirrorOnlyProps")
  );
}

/** Build x-ph-* headers to forward distinct_id / session_id to server
 * routes that emit via trackServer. Spread into fetch's headers. */
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

/** Person-property helper. PostHog $set updates the latest values.
 * No Supabase mirror — person properties live on PostHog only.
 *
 * $set_once writes (signup_at, signup_source — first-identify only)
 * are NOT owned here. AuthProvider's direct posthog.identify(distinct,
 * $set, $set_once) call is the allowlist-blessed writer of those
 * fields; routing them through a thin wrapper here was redundant.
 *
 * PII denylist enforced via tests/unit/analytics-pii-denylist.test.ts —
 * don't pass `email`, `phone`, or `name` here. */
export function setPersonProperties(props: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!isProductionEnv()) return;
  try {
    posthog.setPersonProperties(props);
  } catch (err) {
    console.error("PostHog setPersonProperties failed:", err);
  }
}

/** Increment a numeric person property. */
export function incrementPersonProperty(name: string, amount = 1) {
  if (typeof window === "undefined") return;
  if (!isProductionEnv()) return;
  try {
    const people = (posthog as { people?: { increment?: (p: Record<string, number>) => void } }).people;
    people?.increment?.({ [name]: amount });
  } catch (err) {
    console.error("PostHog increment failed:", err);
  }
}
