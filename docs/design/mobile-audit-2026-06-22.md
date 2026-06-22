# Composer Mobile Readiness Audit

- Date: 2026-06-22
- Repo / branch: aryaadit/composer @ adit/sandbox-testing (HEAD d2111b6 at time of writing)
- Target: make the web app correct on a mobile device, then wrap it with Capacitor (same path as Pour Decisions)
- Pass 1 author: static code audit via chat. Pass 2 is for Claude Code to run independently.

## How to use this doc

This audit runs in three passes that are meant to be cross-checked, not trusted in isolation.

1. Pass 1 (this doc, below): a static code audit already done. Findings have file:line refs and a severity.
2. Pass 2: Claude Code runs its own independent audit from the brief in the Pass 2 section. It must form its own view first, then reconcile against Pass 1. Two viewpoints, one backlog.
3. Pass 3: an on-device manual test protocol that a human runs, because rendering, real touch, keyboard, and OAuth behavior cannot be confirmed from source.

Then merge the three into a single prioritized backlog (see Reconciliation) and fix in order. Every fix clears the four gates (tsc, eslint, vitest, build) before commit, and follows the usual draft-then-commit flow.

## Severity legend

- P0: breaks the experience on a real device or blocks the Capacitor wrap. Fix first.
- P1: visibly wrong or risky on mobile. Fix before launch on mobile.
- P2: degraded but usable, or needs device confirmation before it is actionable.
- P3: polish.

## Context

Stack: Next.js 15 App Router, TypeScript, Tailwind v4, Supabase auth (Google sign-in), Mapbox GL, Resy/OpenTable links, PostHog. Five routes: home, onboarding, compose, itinerary, profile.

The app is already built mobile-first. Modals are bottom sheets that re-center on desktop via `md:` breakpoints, the layout is responsive throughout, and `env(safe-area-inset-bottom)` is handled in six components. The gaps below are specific, not structural.

"Perfect on mobile" here means two things that are easy to conflate: (1) correct in mobile Safari and Chrome as a website, and (2) correct inside a Capacitor WKWebView as a wrapped app. Some items matter for one and not the other; each finding says which.

---

## Pass 1 findings (static code audit)

### A. Mobile-web correctness

**A1 (P0) Missing viewport config disables every safe-area inset already in the code.**
`src/app/layout.tsx` exports `metadata` but has no `export const viewport`, so Next.js applies its default viewport, which does not include `viewport-fit=cover`. On iOS WebKit (mobile Safari and the Capacitor WKWebView both), `env(safe-area-inset-*)` resolves to 0 unless `viewport-fit=cover` is set. That means the safe-area padding already written in all six of these places is currently inert on a notched device:
- `src/components/itinerary/LooksGoodCTA.tsx:206`
- `src/components/itinerary/ConfirmModal.tsx:218`
- `src/components/itinerary/SwapReasonModal.tsx:331`
- `src/components/venue/VenueDetailModal.tsx:109`
- `src/components/questionnaire/CitySwitcher.tsx:57`
- `src/components/ui/FeedbackButton.tsx:25`

Fix: add a `viewport` export to `layout.tsx` with `viewportFit: "cover"` and a `themeColor`. This one change activates work that already exists. Highest leverage item in the audit.

**A2 (P1) No top safe-area inset anywhere.**
Every `safe-area-inset` reference in the codebase is `-bottom`. There is not a single `-top`. Once `viewport-fit=cover` is on (A1), and especially inside a full-bleed Capacitor webview, the top of every screen runs under the status bar and Dynamic Island. The top-level `min-h-screen` containers (Home, Auth, Onboarding, Itinerary) and any top header need `pt-[env(safe-area-inset-top)]` or a shared safe-area wrapper.

Fix: introduce a top safe-area inset at the layout or per-screen container level. Consider a small reusable wrapper rather than sprinkling the same utility across screens.

**A3 (P1) `min-h-screen` is 100vh, used on ~10 screens.**
`min-h-screen` compiles to `min-height: 100vh`. On mobile Safari and Chrome, `100vh` includes the area behind the address bar, the classic "content cut off / extra scroll" bug. Occurrences:
- `src/components/questionnaire/QuestionnaireShell.tsx:340`
- `src/components/auth/ForgotPasswordScreen.tsx:83`
- `src/components/auth/AuthScreen.tsx:168, 242, 382`
- `src/components/home/HomeScreen.tsx:94`
- `src/components/onboarding/OnboardingFlow.tsx:127, 145`
- `src/app/admin/onboarding/page.tsx:29`
- `src/app/auth/reset/page.tsx:102`

Fix: swap `min-h-screen` to `min-h-dvh` (Tailwind v4 supports the dvh family). Less critical inside the webview, where there is no dynamic chrome, but it is a real mobile-web bug.

**A4 (P2, needs device confirmation) Input zoom on focus.**
Could not confirm input font sizes from markup. If any `input`, `textarea`, or `select` renders below 16px, iOS auto-zooms the page when the field is focused, which reads as broken. Confirm on a real iPhone (tap a field in onboarding/auth and watch for zoom). If present, the fix is to ensure those fields are at least 16px rather than disabling zoom in the viewport, which hurts accessibility.

**A5 (P2, needs device confirmation) FeedbackButton is hover-driven and bottom-fixed.**
`src/components/ui/FeedbackButton.tsx:15-16` uses `onMouseEnter`/`onMouseLeave`; touch devices have no hover, so whatever the hover reveals will not appear on a tap. It is also fixed to the bottom (`:25`), and the itinerary screen has a separate bottom-fixed CTA (`LooksGoodCTA.tsx:203`, z-30). Confirm on device that (a) the button is fully usable by tap without the hover state, and (b) it does not overlap or sit on top of the Looks Good CTA.

**A6 (P3) Tap-target density and tap highlight.**
`text-xs` (12px) appears ~160 times. Not wrong on its own, but worth a once-over for any 12px text that is also a tap target. Also no `-webkit-tap-highlight-color` is set, so taps show the default grey flash. Polish, not a blocker.

### B. Capacitor-conversion risks (plan before the wrap, not visible in a browser audit)

**B1 (P0 for the app) Auth in a webview.**
Supabase auth with Google sign-in. OAuth redirect and popup flows do not behave the same inside a WKWebView, and Google actively blocks sign-in from embedded webviews. Without the Capacitor Browser plugin plus deep-link handling (or a native auth approach), sign-in can fail outright in the wrapped app. De-risk this first; it is invisible in a browser audit and can sink the conversion.

**B2 (P1) External links must leave the webview.**
Resy and OpenTable booking URLs and Google Maps links should open in the system browser or native app via Capacitor's Browser/App plugins, not navigate the webview, or the user gets trapped with no way back.

**B3 (P1) Mapbox GL fullscreen overlay on mobile.**
`src/components/itinerary/ItineraryMap.tsx:184` renders a fullscreen `fixed inset-0` overlay. Its close control needs to sit inside the top safe area (depends on A2), map pinch-zoom versus page scroll needs `touch-action` thought so gestures do not fight, and Mapbox GL performance on a mobile webview is worth a real-device check.

**B4 (P1) Status bar and Android back button.**
A wrapped app needs status-bar style configured (Capacitor StatusBar plugin) and the Android hardware back button handled, or back will exit the app from the first screen instead of navigating.

**B5 (P2) No PWA manifest.**
There is no web app manifest. Irrelevant for Capacitor, since the native shell supplies icons, splash, and status bar. Only a gap if a PWA install path is also wanted.

---

## Pass 2: Claude Code independent audit brief

Paste the block below to Claude Code. The goal is a second, independent viewpoint, not a confirmation of Pass 1.

```
Audit the Composer web app for mobile readiness, targeting both mobile Safari/Chrome
and a future Capacitor (WKWebView) wrap. Work from the current source on
adit/sandbox-testing. Form your own findings FIRST, before reading any prior audit,
then reconcile.

Produce docs/design/mobile-audit-cc-findings.md with: each finding as
ID, severity (P0-P3), file:line refs, why it matters on mobile and/or in a webview,
and the recommended fix. Do not change any app code in this pass; this is read-only
analysis that ends in a doc.

Audit at least these dimensions, and add any others you find:
- Viewport + meta: is there an `export const viewport`? viewport-fit=cover? themeColor?
  Is user-scalable being disabled anywhere (accessibility risk)?
- Safe areas: every fixed/sticky element top and bottom. Which handle
  env(safe-area-inset-*) and which do not. Note that insets are inert without
  viewport-fit=cover.
- Viewport height: every 100vh / h-screen / min-h-screen / vh usage; whether dvh is
  warranted.
- Touch targets: interactive elements smaller than ~44x44px; tap targets relying on
  text-xs.
- Inputs: any input/textarea/select rendering below 16px (iOS zoom-on-focus). Check
  shared input components and global CSS, not just inline classes.
- Hover and pointer: hover-only affordances (onMouseEnter/Leave, hover: that reveals
  content or controls) with no touch/focus equivalent.
- Scroll and overflow: nested scroll containers, overflow traps, body-scroll lock on
  open modals, momentum scrolling, overscroll-behavior.
- Stacking: z-index collisions among fixed elements (e.g. the feedback button vs the
  itinerary bottom CTA).
- Gestures: touch-action on the map and any draggable/swipe surfaces; pinch-zoom vs
  page-zoom conflicts.
- Images and media: responsive sizing, intrinsic dimensions, oversized assets on
  mobile.
- Keyboard: inputs that the on-screen keyboard would cover; whether anything scrolls
  the focused field into view.
- Orientation: anything that breaks in landscape or assumes portrait.
- Capacitor-specific: Supabase/Google OAuth behavior in a webview; external links
  (Resy/OpenTable/Maps) opening in-webview vs system browser; status bar and Android
  back button; Mapbox GL fullscreen control placement and perf.
- Accessibility on mobile: contrast at small sizes, focus order, reduced-motion
  coverage.
- Performance: mobile bundle weight, anything obviously heavy on first paint for the
  compose/itinerary routes.

After your independent findings, append a "Reconciliation with Pass 1" section: read
docs/design/mobile-audit-2026-06-22.md, and for each Pass 1 item note agree / disagree
/ refine, plus any item Pass 1 missed. Do not silently inherit Pass 1 severities.
```

---

## Pass 3: On-device manual test protocol (human-run)

Static analysis cannot see rendering, real touch, the keyboard, or OAuth. Run this on hardware.

Devices and surfaces:
- One notched / Dynamic Island iPhone, mobile Safari.
- One small Android (narrow width), Chrome.
- Later, the Capacitor debug build on both, once the wrap exists.

Per-screen pass (Home, Onboarding, Auth, Compose questionnaire, Itinerary + map + each modal, Profile/admin):
- Nothing is clipped under the notch/status bar (top) or home indicator (bottom).
- No horizontal scroll or content overflow at the narrowest width.
- Bottom-sheet modals open, scroll internally, and dismiss; the page behind does not scroll while a modal is open.
- The itinerary bottom CTA and the feedback button do not overlap.

Cross-cutting:
- Tap each input. The page must not zoom on focus (A4).
- The on-screen keyboard does not cover the field being typed into.
- The feedback button is fully usable by tap, no hover required (A5).
- Map: pinch-zoom works without zooming the whole page; the close control is reachable and not under the notch.
- Rotate to landscape on at least the itinerary and compose screens.
- Google sign-in completes end to end (this is the one most likely to break in the eventual webview, B1).
- Resy/OpenTable/Maps links open somewhere sensible and the user can get back.

---

## Reconciliation and sequencing

Once Pass 2 lands its findings doc and Pass 3 is run, merge all three into one backlog, deduped, with a single agreed severity per item. Where Pass 1 and Pass 2 disagree, the device result from Pass 3 breaks the tie.

Suggested fix order:
1. A1 viewport-fit=cover + themeColor. One change, unblocks all existing safe-area code.
2. A2 top safe-area inset.
3. A3 min-h-screen to min-h-dvh.
4. Confirm and fix A4 (input zoom) and A5 (feedback button) from device results.
5. Capacitor prep: B1 auth in webview (de-risk early), then B2 external links, B3 map, B4 status bar / back button.
6. A6 polish last.

Each fix follows the standard flow: drafted, gates green (tsc, eslint, vitest, build), then committed with a clear message. No auto-commit.
