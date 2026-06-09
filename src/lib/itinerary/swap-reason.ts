// Page-level orchestration helpers for the swap-reason modal. Kept as
// pure functions so the rapid-sequence + event-prop logic is testable
// without a React harness. The modal component owns its own visual
// state; the page owns the SwapReasonContext and uses these helpers
// to build event payloads and to handle the "new swap arrives while
// modal still open" race.

import type { SwapContext } from "@/hooks/useSwapStop";

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
 * Common property bag shared by all three swap-reason events.
 * Snake-case to match the rest of the analytics taxonomy.
 */
export interface SwapReasonEventProps {
  stop_index: number;
  stop_role: string;
  original_venue_id: string;
  original_venue_name: string;
  new_venue_id: string;
  new_venue_name: string;
  surface: string;
  vibe: string;
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
    vibe: ctx.vibe,
  };
}

/**
 * Compose the full property bag for `stop_swap_reason_shown` and
 * `stop_swap_reason_skipped`. Per locked decision 4: reason and
 * reason_text are present on every event for schema uniformity, null
 * on shown/skipped.
 */
export function buildShownProps(ctx: SwapContext): Record<string, unknown> {
  return {
    ...buildSwapReasonEventProps(ctx),
    reason: null,
    reason_text: null,
  };
}

export function buildSkippedProps(ctx: SwapContext): Record<string, unknown> {
  // Same shape as shown — reason taxonomy is uniform across all three.
  return buildShownProps(ctx);
}

/**
 * Compose the full property bag for `stop_swap_reason_submitted`.
 * Adds reason, reason_text, and time_to_decision_ms (ms from modal
 * open to submit).
 */
export function buildSubmittedProps(
  ctx: SwapContext,
  reason: string,
  reasonText: string | null,
  timeToDecisionMs: number,
): Record<string, unknown> {
  return {
    ...buildSwapReasonEventProps(ctx),
    reason,
    reason_text: reasonText,
    time_to_decision_ms: timeToDecisionMs,
  };
}

/**
 * Type alias for the analytics emit function this module orchestrates
 * against. Matches the shape of `track()` in src/lib/analytics.ts.
 */
type EmitFn = (eventName: string, props: Record<string, unknown>) => void;

/**
 * Compute the next swap-reason state when a new swap completes.
 *
 * Rapid-sequence path: if a previous swap-reason context is still
 * open when a new swap arrives, fire an implicit `stop_swap_reason_skipped`
 * for the previous one BEFORE replacing it with the new context. Then
 * fire `stop_swap_reason_shown` for the new context.
 *
 * Returns the new SwapReasonContext (caller stores it in state).
 */
export function handleNextSwapContext(
  prev: SwapReasonContext | null,
  next: SwapContext,
  now: number,
  emit: EmitFn,
): SwapReasonContext {
  if (prev) {
    emit("stop_swap_reason_skipped", buildSkippedProps(prev.swapContext));
  }
  emit("stop_swap_reason_shown", buildShownProps(next));
  return { swapContext: next, shownAt: now };
}
