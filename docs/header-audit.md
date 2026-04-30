# Header Consistency Audit

**Date:** 2026-04-29
**Scope:** Every page and component that renders a top-level header/nav

## Shared Header Component

**File:** `src/components/Header.tsx`

One shared component used across most pages:
- Logo: `<img src="/composer-lockup.svg" className="h-8 w-auto" />` (32px height, auto width)
- Wrapped in `<Link href="/">` — always links home
- Right slot: optional "← Back" link controlled by `showBack` + `backHref` props
- Container: `<header className="flex items-center justify-between py-4">` — no padding/max-width (parent controls that)

Single logo asset: `/public/composer-lockup.svg` (400x80 viewBox, burgundy #722F37)

## Page-by-Page Comparison

| Page | File | Header | showBack | Right slot | Container wrapper |
|---|---|---|---|---|---|
| `/` (splash) | `app/page.tsx` | None — manual "Composer" in `font-serif text-6xl` | — | Get Started / Log In buttons | `min-h-screen flex justify-center px-6` |
| `/` (home) | `HomeScreen.tsx` | Shared `<Header />` | No | UserIcon → `/profile` (separate row below header) | `px-6 pt-6 max-w-lg mx-auto` |
| `/compose` | `QuestionnaireShell.tsx` | Shared `<Header />` | No | Step-back button (absolute overlay when step > 0) | `absolute top-0 inset-x-0 px-6 z-10` → `max-w-lg mx-auto relative` |
| `/itinerary` | `app/itinerary/page.tsx` | Shared `<Header showBack backHref="/" />` | Yes | "← Back" via Header prop | `max-w-lg mx-auto mb-6` inside `px-6 pt-6` main |
| `/itinerary/saved/[id]` | `app/itinerary/saved/[id]/page.tsx` | Shared `<Header showBack backHref="/" />` | Yes | "← Back" via Header prop | Same as itinerary |
| `/itinerary/share/[id]` | `app/itinerary/share/[id]/page.tsx` | Shared `<Header />` | No | None (public, no back) | Same as itinerary |
| `/profile` | `app/profile/page.tsx` | Shared `<Header showBack backHref="/" />` | Yes | "← Back" via Header prop | `max-w-lg mx-auto px-6 pt-6 pb-10` (padding on outer div, not main) |
| `/onboarding` | `OnboardingFlow.tsx` | Shared `<Header />` | No | Step-back button (absolute overlay when step > 0) | `px-6` → `max-w-lg mx-auto relative` |
| `/privacy` | `app/privacy/page.tsx` | **None** — custom "← Back" link | — | — | `max-w-2xl mx-auto px-6 py-12` |
| Auth screens | `AuthScreen.tsx` | **None** | — | — | Full-screen centered forms |
| Forgot password | `ForgotPasswordScreen.tsx` | **None** — "← Back to sign in" at bottom | — | — | Centered `px-6` |

## Observed Inconsistencies

### 1. Wrapper-level differences (Category 3)

All pages use the shared Header component, but the wrapper div around it varies:

- **Itinerary pages:** `<div className="w-full max-w-lg mx-auto mb-6">` inside `<main className="... px-6 pt-6 ...">`
- **Profile page:** `<div className="max-w-lg w-full mx-auto px-6 pt-6 pb-10">` — padding is on the wrapper, not main
- **HomeScreen:** `<div className="px-6 pt-6 max-w-lg w-full mx-auto">` — padding on wrapper
- **QuestionnaireShell:** `<div className="absolute top-0 inset-x-0 px-6 z-10">` → `<div className="w-full max-w-lg mx-auto relative">` — absolutely positioned

The max-width is consistent (`max-w-lg` = 512px) but the padding application point varies (some on main, some on wrapper div).

### 2. Right-side content differences (Category 2)

Three different right-slot patterns:
- **Nothing** — itinerary output, share page
- **"← Back" link** — profile, itinerary (via `showBack` prop)
- **Absolute-positioned step-back button** — questionnaire, onboarding (NOT using `showBack` — independent button overlaid)
- **Profile icon** — home screen (not in Header at all — separate row below)

### 3. Pages without Header (Category 1)

- **Privacy page:** Custom inline back link, no logo
- **Auth screens:** No header at all (intentional — stripped-down auth flow)
- **Splash screen:** Logo is rendered as large text "Composer" in serif, not the SVG lockup

### 4. Questionnaire header is absolutely positioned (Category 5)

The questionnaire wraps Header in `absolute top-0 inset-x-0 z-10` so the step content can be viewport-centered independently. This means the header overlays content rather than being in normal flow — could cause issues on very small screens.

## Verdict

**Mostly aligned.** The shared `<Header />` component exists and is used by 8 of 11 page surfaces. The three that don't use it (splash, auth, privacy) have legitimate reasons. The main drift is in wrapper-level padding/positioning differences, not in the header itself.

## Recommended Approach

Standardize the wrapper pattern. The Header component itself is fine — it just needs its parent containers to be consistent. Options:
1. Move `px-6 pt-6` into Header's own wrapper (so parents don't need to repeat it)
2. Create a `<PageShell>` layout component that handles the max-w-lg + padding + header rendering, used by all authenticated pages
3. Keep as-is but normalize the wrapper classes (quick fix — just align the class strings)

Option 3 is lowest risk. Option 2 is cleanest long-term but touches many files.

## Open Design Questions

1. Should the profile icon on the home screen live *inside* the Header's right slot, or stay as a separate row below?
2. Should the questionnaire header be absolutely positioned or in normal document flow?
3. Should the privacy page use the shared Header with `showBack`?
4. Should the splash screen show the SVG lockup logo instead of the serif text treatment? (They're different brand expressions — the text is larger and more dramatic.)
5. Is the step-back button (absolute overlay) pattern acceptable, or should Header gain a `rightSlot` render prop?
6. Should `max-w-lg` be a design token rather than repeated in every page wrapper?
7. On the profile page, padding is on the outer div (`px-6 pt-6 pb-10`) rather than main — is the extra `pb-10` intentional?
8. Should shared itinerary pages (`/itinerary/share/[id]`) show a "Compose your own →" CTA in the header right slot?
