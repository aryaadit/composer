// Page-level orchestration helpers for the swap-reason modal. Kept as
// pure functions so the rapid-sequence + event-prop logic is testable
// without a React harness. The modal component owns its own visual
// state; the page owns the SwapReasonContext and uses these helpers
// to build event payloads and to handle the "new swap arrives while
// modal still open" race.

import type { SwapContext } from "@/hooks/useSwapStop";
import type {
  ComposeContext,
  EventName,
  EventSchemas,
} from "@/lib/analytics";

/** Compose context + itinerary_id + first-engagement timing are injected
 *  by EngagementProvider's trackEngagement at the single passthrough
 *  point. These builders return only the event-specific fields the
 *  caller has to supply — Omit-aligned with EngagementProvider's
 *  EngagementProps shape. Using `keyof ComposeContext` keeps this in
 *  lockstep with the schema (e.g. new fields like `mode` and `attempt`
 *  are auto-included). */
type EventSpecificProps<E extends EventName> = Omit<
  EventSchemas[E],
  keyof ComposeContext | "itinerary_id" | "time_to_first_engagement_ms"
>;

/**
 * Per-shown swap-reason state. `shownAt` is captured at the moment
 * the parent transitions the modal to open, and is used to compute
 * time_to_decision_ms on submit.
 */
export interface SwapReasonContext {
  swapContext: SwapContext;
  shownAt: number;
}

/**
 * Common property bag shared by all three swap-reason events. Vibe
 * used to live here as an explicit field; it now travels via the
 * EngagementProvider-injected ComposeContext, so the builders no
 * longer surface it directly.
 */
export interface SwapReasonEventProps {
  stop_index: number;
  stop_role: string;
  original_venue_id: string;
  original_venue_name: string;
  new_venue_id: string;
  new_venue_name: string;
  surface: string;
}

export function buildSwapReasonEventProps(
  ctx: SwapContext,
): SwapReasonEventProps {
  return {
    stop_index: ctx.stopIndex,
    stop_role: ctx.stopRole,
    original_venue_id: ctx.originalVenue.id,
    original_venue_name: ctx.originalVenue.name,
    new_venue_id: ctx.newVenue.id,
    new_venue_name: ctx.newVenue.name,
    surface: ctx.surface,
  };
}

export function buildShownProps(
  ctx: SwapContext,
): EventSpecificProps<"swap_reason_shown"> {
  return buildSwapReasonEventProps(ctx);
}

export function buildSkippedProps(
  ctx: SwapContext,
): EventSpecificProps<"swap_reason_skipped"> {
  return buildSwapReasonEventProps(ctx);
}

/** PII split. `reason` (the taxonomy slug — "wrong_vibe", "too_far",
 * etc.) is fine for PostHog. `reason_text` (free-text "other" input)
 * is mirror-only — see EngagementProvider's `opts.mirrorOnlyProps`. */
export interface SubmittedBuildResult {
  props: EventSpecificProps<"swap_reason_submitted">;
  mirrorOnlyProps: { reason_text: string | null };
}

export function buildSubmittedProps(
  ctx: SwapContext,
  reason: string,
  reasonText: string | null,
  timeToDecisionMs: number,
): SubmittedBuildResult {
  return {
    props: {
      ...buildSwapReasonEventProps(ctx),
      reason,
      time_to_decision_ms: timeToDecisionMs,
    },
    mirrorOnlyProps: { reason_text: reasonText },
  };
}

/** One event to emit, paired with the typed event name the caller
 *  should pass through trackEngagement. The discriminator + props
 *  shape lets the caller fan out without re-deriving anything. */
export type SwapReasonEmit =
  | {
      event: "swap_reason_shown";
      props: EventSpecificProps<"swap_reason_shown">;
    }
  | {
      event: "swap_reason_skipped";
      props: EventSpecificProps<"swap_reason_skipped">;
    };

export interface SwapReasonTransition {
  nextState: SwapReasonContext;
  /** Emit each in order. Caller wires them to EngagementProvider's
   *  trackEngagement so ComposeContext + itinerary_id are auto-injected. */
  events: SwapReasonEmit[];
}

/**
 * Compute the next swap-reason state when a new swap completes.
 *
 * Rapid-sequence path: if a previous swap-reason context is still
 * open when a new swap arrives, queue an implicit `swap_reason_skipped`
 * for the previous one BEFORE the new context's `swap_reason_shown`.
 * Returns both the next state and the ordered events the caller
 * should emit; this keeps the helper pure (no React, no analytics
 * coupling) so tests can assert against the returned shape directly.
 */
export function handleNextSwapContext(
  prev: SwapReasonContext | null,
  next: SwapContext,
  now: number,
): SwapReasonTransition {
  const events: SwapReasonEmit[] = [];
  if (prev) {
    events.push({
      event: "swap_reason_skipped",
      props: buildSkippedProps(prev.swapContext),
    });
  }
  events.push({
    event: "swap_reason_shown",
    props: buildShownProps(next),
  });
  return {
    nextState: { swapContext: next, shownAt: now },
    events,
  };
}
