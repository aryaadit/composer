// In-flight browser storage keys (sessionStorage only).
//
// These are session-scoped and only exist to bridge the questionnaire
// page to the itinerary page within a single tab. All persistent user
// state (profile, saved itineraries) lives in Supabase.

export const STORAGE_KEYS = {
  session: {
    questionnaireInputs: "composer_inputs",
    currentItinerary: "composer_itinerary",
  },
} as const;
