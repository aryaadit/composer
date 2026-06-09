// Share-link URL encoding/decoding. Share URLs are stateless — the
// itinerary page reads the inputs from the query string and
// re-generates, so a shared link is a recipe, not a snapshot.
//
// Phase 1: the URL carries `startTime`. The decoder also accepts old
// `?timeBlock=...` links (written before Phase 1) and translates via
// `startTimeFromLegacyBlock` so legacy share links keep working.

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

export function encodeInputsToParams(inputs: GenerateRequestBody): string {
  const params = new URLSearchParams();
  params.set("occasion", inputs.occasion);
  params.set("neighborhoods", inputs.neighborhoods.join(","));
  params.set("budget", inputs.budget);
  params.set("vibe", inputs.vibe);
  params.set("day", inputs.day);
  params.set("startTime", inputs.startTime);
  return params.toString();
}

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

export function buildShareUrl(inputs: GenerateRequestBody): string {
  const params = encodeInputsToParams(inputs);
  return `${window.location.origin}/itinerary?${params}`;
}
