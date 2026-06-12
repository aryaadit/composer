// Server-only response helpers for the structured ComposeFailure flow.
// Split from compose-failure.ts so the client-side ItineraryPage can
// import `isComposeFailure` / `composeFailure` without dragging
// posthog-node (which uses `node:fs`) into the browser bundle.

import { NextResponse } from "next/server";
import {
  trackServer,
  EVENTS,
  buildComposeContext,
  type TrackServerContext,
} from "@/lib/analytics-server";
import type {
  ComposeContextInputs,
  EventSchemas,
} from "@/lib/analytics/events";
import { composeFailure, type ZeroingStage } from "./compose-failure";

/** Endpoint identifier used in compose_failed / compose_errored event
 *  payloads. Kept in sync with EventSchemas's Endpoint union. */
export type ComposeEndpoint = EventSchemas["compose_failed"]["endpoint"];

/** Build the 422 response AND fire `compose_failed` in one move. The
 * 2026-06-11 audit catalogued 9 per-branch emission sites (one per
 * zeroing path × endpoint); this helper collapses them so the route
 * handler has a single call shape per failure. trackServer is
 * fire-and-forget — the route doesn't await this. */
export function respondComposeFailure(
  zeroingStage: ZeroingStage,
  endpoint: ComposeEndpoint,
  inputs: ComposeContextInputs | null | undefined,
  context: TrackServerContext,
): NextResponse {
  void trackServer(EVENTS.COMPOSE_FAILED, context, {
    ...buildComposeContext(inputs ?? null),
    endpoint,
    zeroing_stage: zeroingStage,
  });
  return NextResponse.json(composeFailure(zeroingStage), { status: 422 });
}

/** Classify an Error's `name` (or constructor name) into a stable
 * snake_case bucket. Avoids shipping raw `error.message` (PII risk per
 * the 2026-06-11 audit) into the `compose_errored` event. Unknown
 * errors fall to "unknown". */
export function classifyErrorName(err: unknown): string {
  if (!err) return "unknown";
  if (typeof err !== "object") return "unknown";
  const name = (err as { name?: unknown }).name;
  if (typeof name === "string" && name.length > 0) {
    return name
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
  }
  const ctor = (err as { constructor?: { name?: unknown } }).constructor;
  if (ctor && typeof ctor.name === "string" && ctor.name.length > 0) {
    return ctor.name
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
  }
  return "unknown";
}

/** Build the 500 response AND fire `compose_errored`. Mirror of
 * respondComposeFailure for the unexpected-exception path. Adds the
 * symmetric event for swap-stop and add-stop catches that previously
 * had no analogue. */
export function respondComposeErrored(
  err: unknown,
  endpoint: ComposeEndpoint,
  inputs: ComposeContextInputs | null | undefined,
  context: TrackServerContext,
  timeToFailMs: number,
): NextResponse {
  void trackServer(EVENTS.COMPOSE_ERRORED, context, {
    ...buildComposeContext(inputs ?? null),
    endpoint,
    error_name: classifyErrorName(err),
    time_to_fail_ms: timeToFailMs,
  });
  return NextResponse.json(
    { error: "Failed to generate itinerary" },
    { status: 500 },
  );
}
