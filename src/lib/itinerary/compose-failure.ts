// Structured failure response shape returned by the three generation
// endpoints when no honest two-stop itinerary can be produced. The UI
// renders this as a real state (not a toast) with the title +
// suggestion as the two lines. PostHog also fires a single
// `compose_failed` event so the funnel surfaces these as their own
// stage.
//
// Client-safe: this module exports ONLY the failure-shape primitives
// (`ComposeFailure`, `composeFailure`, `isComposeFailure`). The
// server-only response helpers — respondComposeFailure /
// respondComposeErrored / classifyErrorName — live in
// `./compose-failure-server.ts` so client imports of the
// page-level failure type don't transitively pull posthog-node
// (which uses `node:fs`) into the browser bundle.

import type { ZeroingStage } from "@/lib/itinerary/pre-filter";

export type { ZeroingStage };

export interface ComposeFailure {
  /** Discriminator for client-side narrowing. */
  failed: true;
  /** Which constraint zeroed the pool. Maps 1:1 to a copy entry. */
  zeroingStage: ZeroingStage;
  /** Headline shown in the failure state. */
  title: string;
  /** One-line suggestion for what the user could do next. No numbers, no
   * algorithm internals. */
  suggestion: string;
}

interface FailureCopy {
  title: string;
  suggestion: string;
}

// One entry per ZeroingStage. Keep the lines short — they render under
// a serif headline in the compose failure state. Editorial review
// before launch is fine; the keys + meaning are what's load-bearing.
const COPY_BY_STAGE: Record<ZeroingStage, FailureCopy> = {
  budget: {
    title: "Nothing at this budget here",
    suggestion: "Try a different tier or a different neighborhood.",
  },
  hours: {
    title: "Nothing open in that window",
    suggestion: "Try a different time or a different day.",
  },
  neighborhood: {
    title: "Nothing here for this combo",
    suggestion: "Try a nearby neighborhood, or change one of your picks.",
  },
  exclusions: {
    title: "We've run out of fresh picks",
    suggestion: "Clear recently-seen and try again.",
  },
  proximity: {
    // Audit item 3: "anchor" was internal jargon and "wider
    // neighborhood" referred to a widening behavior that no longer
    // exists. Offer the actions the product actually supports —
    // swapping the other stop, or picking a different neighborhood
    // entirely.
    title: "Nothing nearby pairs up",
    suggestion: "Swap the other stop, or try a different neighborhood.",
  },
  drinks: {
    title: "Most spots here pour drinks",
    suggestion: "Try a different area, or update your drinks preference.",
  },
  fit: {
    // The user only picks startTime — the 5-hour envelope is a product
    // policy (COMPOSE_WINDOW_HOURS in src/lib/itinerary/time-blocks.ts),
    // not a user input. Honest framing: the pairing the algorithm
    // surfaced runs too long to fit one night. Switching startTime
    // doesn't help because the window length is invariant; switching
    // vibe (focus) or neighborhood pulls a different duration profile.
    title: "Too much for one night",
    suggestion: "Try a different focus or neighborhood.",
  },
  system: {
    // Client-synthesized only — see ZeroingStage comment in
    // pre-filter.ts. Used by the swap-stop and add-stop catch paths so
    // a network drop or 500 response doesn't render as a "widen your
    // neighborhood" message. Neutral framing, no user-input blame.
    title: "Something went wrong",
    suggestion: "Give it a moment, then try again.",
  },
};

export function composeFailure(zeroingStage: ZeroingStage): ComposeFailure {
  const copy = COPY_BY_STAGE[zeroingStage];
  return { failed: true, zeroingStage, ...copy };
}

/** Typed predicate for client-side narrowing. */
export function isComposeFailure(x: unknown): x is ComposeFailure {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { failed?: unknown }).failed === true &&
    typeof (x as { zeroingStage?: unknown }).zeroingStage === "string"
  );
}
