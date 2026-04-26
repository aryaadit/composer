// Compose an itinerary with temporal chain validation. Replaces the
// old compose-then-enrich flow with: score → batch-fetch availability
// → solve chain with forward-checking + backtracking → assemble stops.
//
// The result is a pre-validated chain where every reservation stop has
// a confirmed slot and enough time between stops for walking.

import { pickBestForRole } from "@/lib/scoring";
import { spendEstimate } from "@/config/budgets";
import { planStopMix, ROLE_AVG_DURATION_MIN } from "@/lib/composer";
import { buildResyBookingUrl } from "@/lib/availability/booking-url";
import { batchFetchAvailability } from "./availability-cache";
import {
  solveChain,
  topCandidates,
  type ChainLink,
  type ChainResult,
} from "./chain-solver";
import { resolveTimeWindow } from "./time-blocks";
import type {
  Venue,
  ScoredVenue,
  ItineraryStop,
  StopAvailability,
  StopRole,
  QuestionnaireAnswers,
  WeatherInfo,
} from "@/types";
import type { TimeBlock } from "./time-blocks";
import type { AvailabilitySlot } from "@/lib/availability/resy";

const TOP_N_PER_ROLE = 8;

export interface ChainCompositionResult {
  stops: ItineraryStop[];
  pattern: StopRole[];
  isPartial: boolean;
  partialMessage?: string;
}

function linkToStop(link: ChainLink): ItineraryStop {
  const venue = link.candidate.venue;
  const slots = link.selectedSlot ? [link.selectedSlot] : [];
  const platform = venue.reservation_platform ?? "none";

  let availability: StopAvailability;
  if (link.candidate.isWalkIn) {
    availability = {
      status: "walk_in",
      slots: [],
      bookingUrlBase: null,
      swapped: false,
    };
  } else if (link.selectedSlot) {
    availability = {
      status: "has_slots",
      slots,
      bookingUrlBase: venue.resy_slug
        ? buildResyBookingUrl(venue.resy_slug, "", 2)
        : venue.reservation_url ?? null,
      swapped: false,
    };
  } else {
    availability = {
      status: "unconfirmed",
      slots: [],
      bookingUrlBase: venue.reservation_url ?? null,
      swapped: false,
    };
  }

  return {
    role: link.candidate.role,
    venue,
    curation_note: venue.curation_note ?? "",
    spend_estimate: spendEstimate(venue.price_tier ?? 2),
    is_fixed: !link.candidate.isWalkIn && !!link.selectedSlot,
    plan_b: null,
    availability,
  };
}

export async function composeWithChainValidation(
  venues: Venue[],
  answers: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  timeBlock: TimeBlock,
  date: string,
  partySize: number = 2,
  jitter: number = 10
): Promise<ChainCompositionResult> {
  const pattern = planStopMix(answers);
  const usedIds = new Set<string>();

  // 1. Score candidates per role. Main is picked first as the anchor;
  //    other roles are scored relative to Main's location.
  const mainResult = pickBestForRole(
    venues, "main", answers, weather, usedIds, null, jitter
  );
  if (!mainResult.best) {
    return { stops: [], pattern, isPartial: true, partialMessage: "No venues matched your filters." };
  }

  const candidateSets = new Map<StopRole, ScoredVenue[]>();
  candidateSets.set("main", mainResult.scored.slice(0, TOP_N_PER_ROLE));

  for (const role of pattern) {
    if (role === "main" || candidateSets.has(role)) continue;
    const result = pickBestForRole(
      venues, role, answers, weather, usedIds, mainResult.best, jitter
    );
    candidateSets.set(role, result.scored.slice(0, TOP_N_PER_ROLE));
  }

  // 2. Collect all unique Resy candidate venues for batch fetch.
  const allCandidateVenues = new Map<string, Venue>();
  for (const [, scored] of candidateSets) {
    for (const v of scored) {
      allCandidateVenues.set(v.id, v);
    }
  }

  // 3. Batch-fetch availability (single network round, cached).
  const availCache = await batchFetchAvailability(
    Array.from(allCandidateVenues.values()),
    date,
    partySize,
    timeBlock
  );

  // 4. Build chain candidates per role.
  const chainCandidates = new Map<StopRole, ReturnType<typeof topCandidates>>();
  for (const role of pattern) {
    const scored = candidateSets.get(role) ?? [];
    chainCandidates.set(
      role,
      topCandidates(scored, role, availCache, timeBlock)
    );
  }

  // 5. Solve the temporal chain.
  const { startTime, endTime } = resolveTimeWindow(timeBlock);
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let windowStart = sh * 60 + sm;
  let windowEnd = eh * 60 + em;
  if (windowStart < 4 * 60) windowStart += 24 * 60;
  if (windowEnd < 4 * 60) windowEnd += 24 * 60;
  if (windowEnd <= windowStart) windowEnd += 24 * 60;

  const result: ChainResult = solveChain(
    pattern,
    chainCandidates,
    windowStart,
    windowEnd
  );

  // 6. Convert chain links to ItineraryStops.
  const stops = result.chain.map(linkToStop);

  if (result.isPartial) {
    const msg = result.failedVenueName
      ? `We could fit ${result.chain.length} of ${pattern.length} stops — no openings at ${result.failedVenueName} would leave time for the next stop.`
      : `We could fit ${result.chain.length} of ${pattern.length} stops in your window.`;
    return { stops, pattern, isPartial: true, partialMessage: msg };
  }

  return { stops, pattern, isPartial: false };
}
