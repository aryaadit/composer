# composer-v2 — Beli-style onboarding merge

This folder contains the merged React version of Composer. It replaces the
screens listed below with ports of `reids_claude/onboarding.html` (the Beli-style
13-screen mockup) and keeps the full itinerary-generation pipeline intact.

## What changed

### Rebuilt in mockup aesthetic
- `app/globals.css` — new tokens (Fraunces display serif, mango palette, list-row
  & card-option styles, coachmark, map-bg splash background).
- `app/page.js` — now stores the full onboarding prefs object (borough, vibes,
  diet, seeds, phone, email) in sessionStorage under `composer_prefs_v2` and
  passes it through to `HomeScreen`.
- `components/OnboardingFlow.jsx` — 12-screen flow matching the mockup:
  1. Splash: Plan
  2. Splash: Discover
  3. Splash: Date
  4. Name
  5. Phone (US +1 only)
  6. SMS verify — **mocked**: any 6 digits is accepted
  7. Email
  8. Home base (Manhattan / Brooklyn / both)
  9. Vibes (multi-select, Beli list rows)
  10. Dietary (multi-select, Beli list rows)
  11. Seed spots (pick ≥3 card options)
  12. Success → fires `onComplete` → home
- `components/HomeScreen.jsx` — mango gradient hero card + dotted empty state
  and a first-run coachmark overlay that appears once after onboarding.
- `components/PlanFlow.jsx` — the 3-step wizard (where / details / when),
  restyled and now filtered by the borough chosen in onboarding.
- `components/ItineraryView.jsx` — restyled with Fraunces headings and the
  mango soft palette.
- `components/TextMessageShare.jsx` — restyled tone selector and iMessage
  preview.

### Unchanged (reuse from v1)
- `components/TimeWheel.jsx`
- `lib/constants.js`, `lib/firebase.js`, `lib/firebase-admin.js`
- `app/api/places/*`, `app/api/availability/*`, `app/api/events/route.js`
- `lib/itinerary-engine.js` — signature preserved; new onboarding prefs are
  applied at the API route layer, not inside the engine itself.

### Onboarding prefs wired into results
`PlanFlow` sends a new `onboarding` object in the POST body to
`/api/itinerary/generate`:

```json
{
  "onboarding": {
    "borough": "manhattan",
    "vibes": ["Cozy & intimate", "Late-night"],
    "diet": ["Vegan"],
    "seeds": ["via-carota", "dante", "the-met"]
  }
}
```

The API route uses these to:
- **Bias the vibe** if PlanFlow's vibe is missing (maps onboarding labels →
  internal vibe ids).
- **Filter stop categories** based on diet (e.g. a vegan user skips generic
  "bar" stops — they can still add one manually).
- **Prepend a diet hint** (`vegan`, `vegetarian`, `gluten free`, …) to the
  Google Places text query so results match dietary needs.
- **Return diet and onboardingApplied flags** in the response `meta` so the UI
  can surface them later.

`borough` is applied at the client side — `PlanFlow` only shows the borough the
user picked (or both) when selecting neighborhoods.

## Auth status
Phone + SMS verification is **mocked**. Any 6 digits are accepted. Wire
`lib/firebase.js` if you want real phone auth — swap the `verify` handler in
`OnboardingFlow.jsx` to call `signInWithPhoneNumber`.

## Install
Copy the files into a Next.js 15 project with Tailwind v4 and `lucide-react`
installed, or drop them on top of the existing Reid1775/Composer app (they use
the same file paths, just updated contents — there is no new dependency).
