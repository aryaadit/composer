// All client-side storage keys Composer reads or writes, in one place.
//
// Grouped by storage type because the two have different lifetimes and
// should not collide:
//   - `local.*`   persist across tabs and sessions (onboarding prefs, saved plans)
//   - `session.*` persist only for the current tab (in-flight generation state)
//
// Consumers still pass the storage backend explicitly — this module doesn't
// wrap localStorage/sessionStorage, it just centralizes the key strings so a
// typo or rename only has to happen in one file.

export const STORAGE_KEYS = {
  local: {
    userName: "composer_name",
    userContext: "composer_context",
    userDrinks: "composer_drinks",
    userDietary: "composer_dietary",
    userFavoriteHoods: "composer_favorite_hoods",
    savedItineraries: "composer_saved_itineraries",
    seenCoachmark: "composer_seen_coachmark",
  },
  session: {
    questionnaireInputs: "composer_inputs",
    currentItinerary: "composer_itinerary",
  },
} as const;
