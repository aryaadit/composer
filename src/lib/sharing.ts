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
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const migrated: SavedItinerary[] = [];
    let didMigrate = false;

    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") {
        didMigrate = true;
        continue;
      }
      const obj = entry as Record<string, unknown>;

      // Current shape: { id, savedAt, itinerary }
      if (
        typeof obj.id === "string" &&
        typeof obj.savedAt === "string" &&
        obj.itinerary &&
        typeof obj.itinerary === "object" &&
        Array.isArray((obj.itinerary as Record<string, unknown>).stops)
      ) {
        migrated.push(obj as unknown as SavedItinerary);
        continue;
      }

      // Legacy shape: flat ItineraryResponse stored directly. Wrap it.
      if (Array.isArray(obj.stops) && obj.header && obj.inputs) {
        migrated.push({
          id: `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          savedAt: new Date(0).toISOString(),
          itinerary: obj as unknown as ItineraryResponse,
        });
        didMigrate = true;
        continue;
      }

      // Anything else is corrupt — drop it.
      didMigrate = true;
    }

    if (didMigrate) {
      localStorage.setItem(SAVED_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return [];
  }
}

export function deleteSavedItinerary(id: string): void {
  const next = getSavedItineraries().filter((s) => s.id !== id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(next));
}
