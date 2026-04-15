// Share-link URL encoding/decoding. The saved-itinerary persistence
// that used to live here moved to Supabase when auth landed; see
// `composer_saved_itineraries` + ActionBar.Save / HomeScreen.
//
// Share URLs remain stateless — the itinerary page reads the inputs
// from the query string and re-generates, so a shared link is a
// recipe, not a snapshot.

import { QuestionnaireAnswers, Neighborhood } from "@/types";

export function encodeInputsToParams(inputs: QuestionnaireAnswers): string {
  const params = new URLSearchParams();
  params.set("occasion", inputs.occasion);
  params.set("neighborhoods", inputs.neighborhoods.join(","));
  params.set("budget", inputs.budget);
  params.set("vibe", inputs.vibe);
  params.set("day", inputs.day);
  params.set("startTime", inputs.startTime);
  params.set("endTime", inputs.endTime);
  return params.toString();
}

export function decodeParamsToInputs(
  searchParams: URLSearchParams
): QuestionnaireAnswers | null {
  const occasion = searchParams.get("occasion");
  const neighborhoodsRaw = searchParams.get("neighborhoods");
  const budget = searchParams.get("budget");
  const vibe = searchParams.get("vibe");
  const day = searchParams.get("day");
  const startTime = searchParams.get("startTime");
  const endTime = searchParams.get("endTime");

  if (!occasion || !neighborhoodsRaw || !budget || !vibe || !day || !startTime || !endTime) {
    return null;
  }

  const neighborhoods = neighborhoodsRaw
    .split(",")
    .filter(Boolean) as Neighborhood[];

  return {
    occasion: occasion as QuestionnaireAnswers["occasion"],
    neighborhoods,
    budget: budget as QuestionnaireAnswers["budget"],
    vibe: vibe as QuestionnaireAnswers["vibe"],
    day,
    startTime,
    endTime,
  };
}

export function buildShareUrl(inputs: QuestionnaireAnswers): string {
  const params = encodeInputsToParams(inputs);
  return `${window.location.origin}/itinerary?${params}`;
}
