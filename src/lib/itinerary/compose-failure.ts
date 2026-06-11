// Structured failure response shape returned by the three generation
// endpoints when no honest two-stop itinerary can be produced. The UI
// renders this as a real state (not a toast) with the title +
// suggestion as the two lines. PostHog also fires a single
// `compose_failed` event so the funnel surfaces these as their own
// stage.
//
// Copy per BRAND_VOICE.md — observational, dry, no algorithm internals,
// no numbers. One short line of suggestion that points the user at the
// next move they could try. Editorial pass before launch is fine; the
// shape is the load-bearing part of this module.

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
    title: "Nothing nearby pairs up",
    suggestion: "Try a different anchor or a wider neighborhood.",
  },
  drinks: {
    title: "Most spots here pour drinks",
    suggestion: "Try a different area, or update your drinks preference.",
  },
  fit: {
    title: "Won't fit your window",
    suggestion: "Try an earlier start or a different neighborhood.",
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
