// Share-link URL encoding/decoding. The saved-itinerary persistence
// that used to live here moved to Supabase when auth landed; see
// `composer_saved_itineraries` + ActionBar.Save / HomeScreen.
//
// Share URLs remain stateless — the itinerary page reads the inputs
// from the query string and re-generates, so a shared link is a
// recipe, not a snapshot. The URL carries `duration` (a preset), not
// startTime/endTime; the server resolves it on each generation so a
// shared link regenerated at a different hour still produces a
// coherent window.

import {
  GenerateRequestBody,
  Duration,
  Neighborhood,
} from "@/types";
import { DURATIONS } from "@/config/durations";

const DURATION_IDS = new Set<string>(DURATIONS.map((d) => d.id));

export function encodeInputsToParams(inputs: GenerateRequestBody): string {
  const params = new URLSearchParams();
  params.set("occasion", inputs.occasion);
  params.set("neighborhoods", inputs.neighborhoods.join(","));
  params.set("budget", inputs.budget);
  params.set("vibe", inputs.vibe);
  params.set("day", inputs.day);
  params.set("duration", inputs.duration);
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
  const durationRaw = searchParams.get("duration");

  if (
    !occasion ||
    !neighborhoodsRaw ||
    !budget ||
    !vibe ||
    !day ||
    !durationRaw ||
    !DURATION_IDS.has(durationRaw)
  ) {
    return null;
  }

  const neighborhoods = neighborhoodsRaw
    .split(",")
    .filter(Boolean) as Neighborhood[];

  return {
    occasion: occasion as GenerateRequestBody["occasion"],
    neighborhoods,
    budget: budget as GenerateRequestBody["budget"],
    vibe: vibe as GenerateRequestBody["vibe"],
    day,
    duration: durationRaw as Duration,
  };
}

export function buildShareUrl(inputs: GenerateRequestBody): string {
  const params = encodeInputsToParams(inputs);
  return `${window.location.origin}/itinerary?${params}`;
}
