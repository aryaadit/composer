// Share-link decoder. Today's share flow is a SNAPSHOT, not a recipe:
// `/api/share` writes the full ItineraryResponse as JSONB into
// `composer_shared_itineraries` and returns a `/itinerary/share/[id]`
// URL. The share page reads the JSONB back verbatim, so shared links
// don't carry the inputs in their query string.
//
// What this module still does: decode the OLD `?occasion=...&...`
// query-string share URLs that pre-date the snapshot flow. The
// itinerary page falls through to sessionStorage when
// `decodeParamsToInputs(searchParams)` returns null, so a current
// share link (no params) lands on the snapshot path; legacy share
// links (with params) get re-generated against today's catalog and
// land via `/api/generate`.
//
// Phase 1: the URL carries `startTime`. The decoder also accepts old
// `?timeBlock=...` links (written before Phase 1) and translates via
// `startTimeFromLegacyBlock` so legacy share links keep working.
//
// The matching encoder (encodeInputsToParams) and builder
// (buildShareUrl) were retired 2026-06-12 — the share button writes
// a snapshot, not a query string, so there was nothing to encode.

import {
  GenerateRequestBody,
  Neighborhood,
  OccasionBucket,
} from "@/types";
import {
  isComposeStartTime,
  startTimeFromLegacyBlock,
} from "@/lib/itinerary/time-blocks";
import { DEPRECATED_OCCASION_SLUG_TO_BUCKET } from "@/config/occasions";

export function decodeParamsToInputs(
  searchParams: URLSearchParams
): GenerateRequestBody | null {
  const occasion = searchParams.get("occasion");
  const neighborhoodsRaw = searchParams.get("neighborhoods");
  const budget = searchParams.get("budget");
  const vibe = searchParams.get("vibe");
  const day = searchParams.get("day");

  // Phase 1 reads `startTime`; legacy links carry `timeBlock`. Accept
  // either — if both are present, `startTime` wins (Phase 1 is canonical).
  const startTimeRaw = searchParams.get("startTime");
  const legacyTimeBlock = searchParams.get("timeBlock");

  const startTime = startTimeRaw
    ? startTimeRaw
    : legacyTimeBlock
    ? startTimeFromLegacyBlock(legacyTimeBlock)
    : null;

  if (
    !occasion ||
    !neighborhoodsRaw ||
    !budget ||
    !vibe ||
    !day ||
    !startTime
  ) {
    return null;
  }

  // Validate startTime is a Phase 1 value. Legacy-translated values
  // (e.g. "09:00" from morning) are also accepted — the algorithm
  // handles arbitrary HH:MM correctly even outside the picker's set.
  if (startTimeRaw && !isComposeStartTime(startTimeRaw)) {
    return null;
  }

  const neighborhoods = neighborhoodsRaw
    .split(",")
    .filter(Boolean) as Neighborhood[];

  // Forward-compat for legacy share links: URLs written before the
  // 2026-05-21 taxonomy collapse carry sheet-side slugs like `dating`
  // or `relationship` instead of the current bucket slugs. Translate
  // at the boundary so the rest of the pipeline only sees bucket values.
  const occasionBucket = (DEPRECATED_OCCASION_SLUG_TO_BUCKET[occasion] ??
    occasion) as OccasionBucket;

  return {
    occasion: occasionBucket,
    neighborhoods,
    budget: budget as GenerateRequestBody["budget"],
    vibe: vibe as GenerateRequestBody["vibe"],
    day,
    startTime,
  };
}
