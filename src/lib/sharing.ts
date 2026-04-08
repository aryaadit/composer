import { QuestionnaireAnswers, ItineraryResponse } from "@/types";

const PARAM_KEYS: (keyof QuestionnaireAnswers)[] = [
  "occasion",
  "neighborhood",
  "budget",
  "vibe",
];

export function encodeInputsToParams(inputs: QuestionnaireAnswers): string {
  const params = new URLSearchParams();
  for (const key of PARAM_KEYS) {
    params.set(key, inputs[key]);
  }
  return params.toString();
}

export function decodeParamsToInputs(
  searchParams: URLSearchParams
): QuestionnaireAnswers | null {
  const result: Partial<QuestionnaireAnswers> = {};
  for (const key of PARAM_KEYS) {
    const val = searchParams.get(key);
    if (!val) return null;
    (result as Record<string, string>)[key] = val;
  }
  return result as QuestionnaireAnswers;
}

export function buildShareUrl(inputs: QuestionnaireAnswers): string {
  const params = encodeInputsToParams(inputs);
  return `${window.location.origin}/itinerary?${params}`;
}

const STORAGE_KEY = "composer_saved_itineraries";

export function saveItinerary(itinerary: ItineraryResponse): void {
  const saved = getSavedItineraries();
  saved.unshift(itinerary);
  // Keep only last 10
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 10)));
}

export function getSavedItineraries(): ItineraryResponse[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
