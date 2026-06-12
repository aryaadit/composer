// In-flight browser storage keys (sessionStorage only).
//
// These are session-scoped and only exist to bridge the questionnaire
// page to the itinerary page within a single tab. All persistent user
// state (profile, saved itineraries) lives in Supabase.

export const STORAGE_KEYS = {
  session: {
    questionnaireInputs: "composer_inputs",
    currentItinerary: "composer_itinerary",
    /** Deferred user_signed_in / user_signed_up emit. Auth action sites
     *  (verifyPhoneOtp, signInOrSignUp) stash {method, source} here on
     *  verification success because phone OTP can't locally distinguish
     *  signup from signin — that's a routing-layer decision based on
     *  whether the Composer profile row exists. The root page drains the
     *  token after AuthProvider resolves the profile and emits the right
     *  funnel event, then routes. Cookie-hydrated reloads find no token
     *  and don't false-fire. */
    authPendingEmit: "composer_auth_pending_emit",
  },
} as const;
