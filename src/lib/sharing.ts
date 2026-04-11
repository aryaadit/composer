import {
  QuestionnaireAnswers,
  ItineraryResponse,
  SavedItinerary,
  Neighborhood,
} from "@/types";

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

const SAVED_KEY = "composer_saved_itineraries";
const MAX_SAVED = 20;

export function saveItinerary(itinerary: ItineraryResponse): SavedItinerary {
  const record: SavedItinerary = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    itinerary,
  };
  const existing = getSavedItineraries();
  const next = [record, ...existing].slice(0, MAX_SAVED);
  localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  return record;
}

export function getSavedItineraries(): SavedItinerary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedItinerary[]) : [];
  } catch {
    return [];
  }
}

export function deleteSavedItinerary(id: string): void {
  const next = getSavedItineraries().filter((s) => s.id !== id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(next));
}
