// In-flight browser storage keys.
//
// All persistent user state (profile, saved itineraries) lives in
// Supabase since auth landed — localStorage is no longer used anywhere.
// The two keys below are session-scoped and only exist to bridge the
// questionnaire page to the itinerary page within a single tab.

export const STORAGE_KEYS = {
  session: {
    questionnaireInputs: "composer_inputs",
    currentItinerary: "composer_itinerary",
  },
} as const;
