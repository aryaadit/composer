# Mobile-readiness audit — findings (Claude Code pass)

Read-only audit of Composer on adit/sandbox-testing. Target surfaces: mobile
Safari, mobile Chrome, future Capacitor (WKWebView) wrap. Source-of-truth is the
running app; this doc captures issues that surface only on small touch screens
or inside a webview.

Severity scale used here:

- **P0** — blocker. Either visibly breaks on a current iPhone, or guarantees a
  break the moment Capacitor wraps the app. Ship-stopping.
- **P1** — high. Frequent UX papercut (zoom-on-focus, gestures that fight the
  page, dead safe-area, broken redirect on Capacitor).
- **P2** — medium / needs device verification. Touch-target sizing, hover-only
  affordances, viewport-height units, body-scroll-leak. Often invisible in dev
  on desktop.
- **P3** — polish / license / accessibility nice-to-have.

---

## P0 — Blockers

### F1. No `export const viewport` in the root layout

[src/app/layout.tsx](src/app/layout.tsx) — entire file. The Metadata export is
present, but Next 16 expects viewport config via the separate `viewport` export
and NONE is shipped. The downstream effect:

- `viewport-fit=cover` is unset, so every `env(safe-area-inset-*)` in the
  codebase evaluates to 0px. Affected callsites (live, but inert today):
  - [src/components/itinerary/LooksGoodCTA.tsx](src/components/itinerary/LooksGoodCTA.tsx) (`pb-[max(0.75rem,env(safe-area-inset-bottom))]`)
  - [src/components/venue/VenueDetailModal.tsx](src/components/venue/VenueDetailModal.tsx) (`pb-[max(1.5rem,env(safe-area-inset-bottom))]`)
  - [src/components/itinerary/SwapReasonModal.tsx](src/components/itinerary/SwapReasonModal.tsx) (same)
  - [src/components/itinerary/ConfirmModal.tsx](src/components/itinerary/ConfirmModal.tsx) (same)
  - [src/components/questionnaire/CitySwitcher.tsx](src/components/questionnaire/CitySwitcher.tsx) (same)
  - [src/components/ui/FeedbackButton.tsx](src/components/ui/FeedbackButton.tsx) (`env(safe-area-inset-bottom, 0px) + 6rem`)
- `themeColor` is unset, so the iOS Safari URL bar / Android Chrome chrome
  doesn't take on the cream brand color.
- `initialScale=1` and `width=device-width` are also unset; Next ships sane
  defaults but they're not declared, so any future Capacitor build that strips
  defaults will render in desktop-emulation mode.

**Why mobile-critical:** the entire safe-area padding system is currently a
no-op. The bug only becomes visible the day the app ships to a notched device
(homescreen install, Capacitor, or any Safari version that respects
viewport-fit). It will then look perfectly fine in DevTools and broken on the
device — the worst kind of bug.

**Fix:**

```ts
// src/app/layout.tsx
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAF8F5",
};
```

Then audit every `env(safe-area-inset-*)` callsite on a real iPhone (the simple
visual test: open VenueDetailModal on an iPhone 15 — the close button should
sit above the home-indicator pill, not under it).

---

## P1 — High

### F2. Text inputs at 14px trigger iOS focus-zoom

iOS Safari auto-zooms when a focused `<input>` / `<textarea>` has a computed
`font-size` below 16px. The current offenders, all user-reachable (admin
surfaces grouped separately):

User-facing:

- [src/components/itinerary/SwapReasonModal.tsx:373](src/components/itinerary/SwapReasonModal.tsx#L373) — the "Other" freeform text input is `font-sans text-sm` (14px). Highly used: every "I didn't like this swap" reason flows through this control.
- [src/app/profile/_components/AddEmailSection.tsx:72](src/app/profile/_components/AddEmailSection.tsx#L72) — email input is `text-sm`. Profile-page reachable by every user without an email on their phone-OTP account.

Admin-only (still worth fixing; admin uses the same iPhone):

- [src/app/profile/_components/AddVenuePanel.tsx:441](src/app/profile/_components/AddVenuePanel.tsx#L441) — maps-link input is `text-sm`.
- [src/app/profile/_components/VenueLookup.tsx](src/app/profile/_components/VenueLookup.tsx) — search input is `text-xs` (12px, even worse).
- [src/app/profile/_components/ThresholdOverrideDialog.tsx](src/app/profile/_components/ThresholdOverrideDialog.tsx) — override input is `text-sm`.

Confirmed safe (already 16px+): AuthScreen phone/email/password (text-base),
ForgotPasswordScreen, /auth/reset, OnboardingFlow name (text-xl), SavedPlanRow
rename (text-lg).

**Why mobile-critical:** users focus the SwapReasonModal "Other" field, the
viewport snaps to ~2x zoom, and there is no zoom-out gesture in the typical
"why did you swap" flow because the modal is short. They lose the modal's
context, sometimes lose the close button off-screen. Same papercut on the
profile email field.

**Fix:** raise the four user-reachable inputs to `text-base` (16px). For
admin-only fields, either match or accept the zoom (low frequency). Do NOT
"fix" this by setting `maximum-scale=1` on the viewport — that breaks
accessibility (pinch-zoom) and Safari now ignores it anyway for AA compliance.

---

### F3. Floating Feedback chat-bubble overlaps every modal

[src/components/ui/FeedbackButton.tsx](src/components/ui/FeedbackButton.tsx) is
`fixed right-6 bottom-… z-50`. The app's modal panels are ALSO `z-50`
([ConfirmModal](src/components/itinerary/ConfirmModal.tsx), [SwapReasonModal](src/components/itinerary/SwapReasonModal.tsx),
[VenueDetailModal](src/components/venue/VenueDetailModal.tsx), [ItineraryMap fullscreen](src/components/itinerary/ItineraryMap.tsx),
[LuckyOverlay](src/components/home/LuckyOverlay.tsx), [CitySwitcher](src/components/questionnaire/CitySwitcher.tsx)).
When z-index ties, paint order is decided by document order. FeedbackButton
mounts late in the tree (it's rendered by the layout, after the page content),
so it paints on top of the modal panel — the chat bubble visually sits over the
modal's bottom-right CTA cluster.

**Why mobile-critical:** on a 390px-wide iPhone screen the bubble eats the
modal's primary action button area, and worse, intercepts taps if the user
aims for the right edge of "Submit" / "Confirm". I have not confirmed this on
device but the layered z-index + fixed bottom positioning makes the collision
inevitable.

**Fix:** drop FeedbackButton to `z-30` (below modal backdrop `z-40`), OR hide
the button while any modal is open via a small open-modal context. Dropping
z-index is the smaller change.

---

### F4. Mapbox map captures single-finger touch on the itinerary page

[src/components/itinerary/ItineraryMapInner.tsx](src/components/itinerary/ItineraryMapInner.tsx)
renders the embedded inline map at `h-[220px]` with no `cooperativeGestures`
flag and no `touch-action` on the wrapper. The default Mapbox GL behavior is:
one-finger drag pans the map. The page below the seam has more content (Plan B,
walking notes, save CTA), and the user scrolls down — and gets stuck panning
the map instead of scrolling the page.

**Why mobile-critical:** every itinerary view ends in a "scroll past the map to
hit Save" flow. If the user's thumb lands on the map (likely — it's centered in
the column), the scroll dies.

**Fix:** set `cooperativeGestures` true on the Mapbox `<Map>` element, OR wrap
the inline map div in `style={{ touchAction: "pan-y" }}` so single-finger
vertical drag scrolls the page and the user has to two-finger-drag to pan the
map. Cooperative gestures is the Mapbox-blessed solution and shows a "Use two
fingers to move the map" overlay on touch.

---

### F5. Supabase `redirectTo: window.location.origin` will break under Capacitor

[src/components/auth/AuthScreen.tsx](src/components/auth/AuthScreen.tsx), the
email-reset flow, and `/auth/reset` all build the password-reset / email-confirm
redirect from `window.location.origin`. In a WKWebView wrap, that origin is
`capacitor://localhost` (iOS) or `https://localhost` (Android). Supabase rejects
any redirectTo that isn't in the allowlist, and the email link will resolve
to a URL the device can't navigate to without a deep-link handler.

**Why webview-critical:** doesn't affect mobile Safari today, but the moment we
ship Capacitor, password reset and email magic-link confirm stop working
silently — the email arrives, the user taps it, the link 404s or opens the
external browser to a URL the app doesn't own.

**Fix:** plan for it now. Three working approaches:

1. Configure a universal-link / app-association so `composer.onpalate.com/auth/*`
   opens the native app. Supabase redirects to the production URL; the OS
   intercepts and hands off to Capacitor.
2. Replace `window.location.origin` with a runtime-detected base: in Capacitor,
   read `Capacitor.getPlatform()` and substitute the production https origin.
3. Embed a deep-link scheme (`composer://auth/reset`) and add it to Supabase's
   redirect allowlist.

None of these are in the codebase today. Pick one before the Capacitor cut.

---

### F6. Header has no top safe-area padding

[src/components/Header.tsx](src/components/Header.tsx) uses
`px-6 pt-6 max-w-lg w-full mx-auto`. There's no `pt-[max(1.5rem,env(safe-area-inset-top))]`.

**Why mobile-critical:** in mobile Safari the URL bar gives free top padding,
so this looks fine. In a standalone-PWA install, in Capacitor, or in any
notched-device fullscreen context, the Composer lockup will sit underneath the
notch / Dynamic Island. The lockup is positioned at the very top-left — first
pixel of clip.

**Fix:** swap `pt-6` for `pt-[max(1.5rem,env(safe-area-inset-top))]`. Depends
on F1 landing first (otherwise the env() is 0 and the change is a no-op).

---

### F7. `min-h-screen` everywhere should be `min-h-dvh`

Grep across the codebase: ~14 callsites use `min-h-screen` or `h-screen`. iOS
Safari's `100vh` includes the URL bar's height even when the URL bar is hidden,
so layouts using `min-h-screen` overshoot the viewport on scroll-down (when
Safari collapses the URL bar). The cream background bleeds past the bottom
edge; the "footer" CTA sits below the fold.

Notable callsites:

- [src/app/page.tsx](src/app/page.tsx) — root gate
- [src/components/home/HomeScreen.tsx:94](src/components/home/HomeScreen.tsx#L94)
- [src/components/auth/AuthScreen.tsx](src/components/auth/AuthScreen.tsx) — 3 sites
- [src/components/onboarding/OnboardingFlow.tsx](src/components/onboarding/OnboardingFlow.tsx)
- [src/components/auth/ForgotPasswordScreen.tsx](src/components/auth/ForgotPasswordScreen.tsx)
- [src/app/compose/page.tsx](src/app/compose/page.tsx)
- [src/app/itinerary/page.tsx](src/app/itinerary/page.tsx)
- [src/app/profile/page.tsx](src/app/profile/page.tsx)
- and several /admin pages + saved/[id] + share/[id] + reset

**Why mobile-critical:** specifically visible on the AuthScreen and onboarding
— first-touch surfaces. Background-fill bleeds, sticky-bottom CTAs jump on URL
bar collapse.

**Fix:** project-wide search-and-replace `min-h-screen` → `min-h-dvh`, and
`h-screen` → `h-dvh`. Tailwind v4 supports `dvh` natively. Verify on a real
iPhone after change; for the rare callsite that genuinely wants the largest
viewport (eg. a true-fullscreen overlay) use `lvh` explicitly.

---

## P2 — Medium / needs device verification

### F8. FeedbackButton label is hover-only (mystery-icon on touch)

[src/components/ui/FeedbackButton.tsx](src/components/ui/FeedbackButton.tsx) shows
"Feedback" text only on hover. On touch devices there is no hover. The user
sees a floating chat icon with no label and no aria-label that conveys what
will happen on tap. Touchscreen users can't discover this affordance without
tapping it.

**Why mobile-critical:** mystery-meat affordance is a usability anti-pattern
specifically for touch. Pair with F3 (z-index overlap) and the bubble is both
mysterious AND in the way.

**Fix:** either show the label permanently (small static "Feedback" pill), or
on touch devices via `@media (pointer: coarse)`. Also add a real
`aria-label="Send feedback"` to the button.

---

### F9. Touch targets below 44pt (iOS HIG)

Apple HIG calls for 44×44pt minimum tap targets. Material says 48dp. Multiple
controls in the app are smaller:

- [src/components/ui/DatePicker.tsx](src/components/ui/DatePicker.tsx) — date cells `h-10 w-10` (40px). Used in the When step of the questionnaire on desktop calendar fallback. The mobile path uses native date picker, so this only hits the desktop-calendar surface — verify on tablet / large-screen mobile.
- [src/components/itinerary/ItineraryMapInner.tsx](src/components/itinerary/ItineraryMapInner.tsx) — `PIN_DIAMETER = 30` (30px map pins). Pins are tappable for venue card open; 30px is a small target especially when two pins are close.
- [src/components/home/HomeScreen.tsx:106](src/components/home/HomeScreen.tsx#L106) — profile Link is `h-8 w-8` (32px). Header right-slot icon.
- [src/components/home/LuckyDieButton.tsx:94](src/components/home/LuckyDieButton.tsx#L94) — die button is `h-8 w-8` (32px).
- Stop-card swap-pill (`StopCard`): looks ~36px high. Sized via py-2 + content; verify on device.

**Why mobile-critical:** mid-range thumb is ~9–12mm; sub-44pt targets get
mis-taps. Header icons specifically: two 32px targets side-by-side at the
top-right is a recipe for tapping profile when you meant die.

**Fix:** bump tappable icon-buttons to `h-11 w-11` (44px), use
`p-3` (12px padding) on icon-button shells. For map pins, increase to 36–40px
or add a transparent hit-area expander (`::before` with a larger box).

---

### F10. Modal body-scroll-lock leaks rubber-band

[ConfirmModal](src/components/itinerary/ConfirmModal.tsx),
[SwapReasonModal](src/components/itinerary/SwapReasonModal.tsx),
[VenueDetailModal](src/components/venue/VenueDetailModal.tsx), and
[ItineraryMap fullscreen](src/components/itinerary/ItineraryMap.tsx) all lock
body scroll via `document.body.style.overflow = "hidden"` in a useEffect. None
of them set `overscroll-behavior: contain` on the modal's scroll container.
iOS rubber-bands the modal's overflow up to the background body, revealing the
underlying page during a fast flick — and on the back-half of the rubber-band,
the body has lost its scroll position because overflow:hidden reset it.

**Why mobile-critical:** the modal feels janky on every fast flick. Specifically
visible on the long VenueDetailModal (lots of content) and the AddVenuePanel.

**Fix:** add `overscroll-behavior: contain` to the modal scroll container
(`overscroll-contain` Tailwind utility). Bonus: capture body scrollTop before
lock and restore after unlock so the page doesn't jump.

---

### F11. CitySwitcher doesn't lock body scroll at all

[src/components/questionnaire/CitySwitcher.tsx](src/components/questionnaire/CitySwitcher.tsx)
opens as a bottom sheet but doesn't lock the underlying page scroll. Other
modals in the app all do (ConfirmModal, SwapReasonModal, VenueDetailModal,
ItineraryMap fullscreen). Inconsistent treatment; the questionnaire body
scrolls behind the open sheet on touch flick.

**Why mobile-critical:** the questionnaire page is short on mobile but not zero
— the active step and the progress bar are both behind the sheet. Touch flick
inside the sheet's safe area triggers the page scroll.

**Fix:** mirror the body-lock pattern from ConfirmModal. Also see F10 — apply
`overscroll-behavior: contain` once added.

---

### F12. Inline map taps escalate to fullscreen — easy to trigger by accident

[src/components/itinerary/ItineraryMap.tsx](src/components/itinerary/ItineraryMap.tsx)
— the inline `h-[220px]` map's `onMapClick` opens a fullscreen overlay. Combined
with F4 (no cooperativeGestures / no touch-action), a user scrolling past the
map drags it AND releases on it, triggering the click handler. They wanted to
scroll down; they got a fullscreen takeover with a body-scroll lock.

**Why mobile-critical:** the discoverability of fullscreen map is low and the
escape (back button) isn't always obvious in WKWebView.

**Fix:** combined with F4 (cooperativeGestures). The dedicated "expand" button
already exists in the corner of the inline map — that's the canonical path.
Remove `onMapClick={openFullscreen}` and rely on the explicit button.

---

### F13. Modal heights use vh, not dvh

[VenueDetailModal](src/components/venue/VenueDetailModal.tsx),
[SwapReasonModal](src/components/itinerary/SwapReasonModal.tsx), and
[CitySwitcher](src/components/questionnaire/CitySwitcher.tsx) cap their panel
height with `max-h-[90vh]`. Same iOS URL bar problem as F7 — modal can overflow
under the bottom URL bar.

**Why mobile-critical:** the modal's "Submit" / close button can sit under the
URL bar and be unreachable until the user scrolls (but the modal is scroll-locked,
so they can't).

**Fix:** `max-h-[90dvh]` everywhere.

---

### F14. Resy / Maps / Sheet external links default-open in WKWebView

Search `target="_blank"`: every reservation link and Google Maps deep-link uses
`target="_blank" rel="noreferrer"`. In mobile Safari this opens a new tab,
which is fine. In Capacitor WKWebView, `target="_blank"` opens in the SAME
webview by default with no in-app back button — the user is stuck on the Resy
page with no way to return to Composer except by killing the app.

**Why webview-critical:** mobile Safari users are unaffected. Capacitor users
hit a black hole on every booking click.

**Fix:** add a small `openExternalLink(url)` helper that uses
`Capacitor.Browser.open()` when in Capacitor and standard `window.open` otherwise.
Wire it into [src/lib/availability/booking-url.ts](src/lib/availability/booking-url.ts)
and the Google Maps href construction in geo.ts.

---

### F15. iOS native date input may not fire change on first-tap-no-change

The When step routes to native `<input type="date">` on touch via a pointer-
modality check (see notes in QuestionnaireShell). iOS native date picker has a
known quirk: opening the picker and tapping "Done" without changing the
selection sometimes does NOT fire onChange. Result: user thinks they picked a
day, taps Next, gets blocked.

Have not seen the source confirm this is handled (a "Set" path or a
fallback-to-today). Flagging for device verification.

**Why mobile-critical:** the first step of the When question is "day". A failed
day-pick means the user can't proceed — a real conversion killer.

**Fix:** verify on device; if the bug reproduces, fall back to "if the input is
focused AND the user clicks Next AND value is empty, treat as 'today'" OR force
a value=today default so the user has to actively change to break the form.

---

## P3 — Polish / license / accessibility

### F16. Mapbox `attributionControl={false}` — license violation

[src/components/itinerary/ItineraryMapInner.tsx](src/components/itinerary/ItineraryMapInner.tsx)
passes `attributionControl={false}` to the Mapbox `<Map>`. Mapbox's TOS requires
the © Mapbox / © OpenStreetMap attribution to be visible wherever Mapbox
imagery is shown.

**Why it matters:** not a UX issue — a TOS/legal one. Mapbox can pull the API
key and break every map in the app if flagged in an audit.

**Fix:** leave attribution on, OR render a custom attribution badge that satisfies
the TOS but matches the brand (small text bottom-left, linked to mapbox.com).

---

### F17. `prefers-reduced-motion` partial coverage

[src/app/globals.css](src/app/globals.css) handles `prefers-reduced-motion` for
the lucky-die tumble animation. But the staggered Opener → Main → Closer reveal
on the itinerary page (Motion library) and the LuckyOverlay's burgundy-curtain
sweep don't appear to gate on it.

**Why mobile-critical:** reduced-motion users on iOS get the full animations.
For vestibular-disorder users this is genuinely uncomfortable.

**Fix:** wrap Motion animations in a `useReducedMotion()` check (Motion ships
this hook) and short-circuit to `initial={false}` or `transition={{ duration: 0 }}`.

---

### F18. PostHog session recording on mobile

The PostHog wrapper inits in production. Default session recording captures
DOM, network, and console. On the AuthScreen with phone OTP, the rendered OTP
code briefly appears in the DOM after autofill — PostHog has a `mask all
inputs` mode, but the default is not all-fields-masked.

Not a mobile-specific issue, but the mobile flow is OTP-only-default, so this
hits every signup. Verify the PostHog recording config blocks OTP input
masking.

**Fix:** confirm `session_recording.maskAllInputs` is true OR add `data-ph-no-capture`
to OTP input + the phone input.

---

### F19. AuthScreen icon-only language switcher / phone-country picker

Did not see one — flagging the absence. International users will eventually
sign up; the default `+1` US prefix is fine for the CBS-NYC MVP but is a known
near-term constraint. Country-picker should be a deliberate Phase-2 add, not a
forgotten omission.

---

### F20. No `pointer-events-none` on decorative Motion containers

Generic Motion `<motion.div>` wrappers can intercept taps if the animated child
has `pointer-events: auto` (default). Not seen in source, but worth a manual
sweep — a decorative entrance wrapper with even a 1px transform offset can eat
taps on the underlying card during entrance.

**Fix:** add `pointer-events-none` to outer-decoration wrappers; or just hold
this for a device-test pass on the Opener → Main → Closer entrance.

---

## Reconciliation with Pass 1

Pass 1 doc: [docs/design/mobile-audit-2026-06-22.md](docs/design/mobile-audit-2026-06-22.md).

### Per-item reconciliation (item-by-item walk of Pass 1)

> Note: this section was written after Pass 1 was read. My severities below are
> independent of Pass 1's labels — I re-judged each item against the same P0–P3
> scale used above.

**A1 — Missing viewport config disables every safe-area inset.** **Agree.**
Same finding as my F1. Pass 1 P0; I also rate P0. The six callsites Pass 1
enumerates are the same set I caught (LooksGoodCTA, ConfirmModal,
SwapReasonModal, VenueDetailModal, CitySwitcher, FeedbackButton). One change,
unblocks everything else.

**A2 — No top safe-area inset anywhere.** **Agree, refine.** My F6 caught
this only on Header.tsx; Pass 1 correctly broadens to "every min-h-screen
container and any top header." The right fix is a shared safe-area wrapper at
the layout level, not per-screen sprinkles. P1.

**A3 — `min-h-screen` is 100vh, used on ~10 screens.** **Agree.** Matches my F7
exactly. Pass 1's enumeration of callsites is slightly tighter than mine —
adopt its list as the source of truth for the change. P1.

**A4 — Input zoom on focus.** **Disagree on severity, refine.** Pass 1 marks
P2 "needs device confirmation." I confirmed this statically (my F2) — 14px
inputs trigger iOS zoom deterministically per the WebKit rule, no device test
needed to know it'll happen. Five callsites: SwapReasonModal "Other" text input,
AddEmailSection email, AddVenuePanel maps-link, VenueLookup (text-xs / 12px),
ThresholdOverrideDialog. Rate **P1** for the user-reachable two (SwapReason +
AddEmail) — the rest can ride along.

**A5 — FeedbackButton is hover-driven and bottom-fixed.** **Agree, refine and
split.** Pass 1 bundles hover-mystery and CTA-overlap into one P2. I split:
- The hover-only label is mystery-meat on touch (my F8) — P2, fix with
  `pointer: coarse` media query or always-on label.
- The z-index collision is worse than Pass 1 noted: FeedbackButton z-50 ties
  modal panels (ConfirmModal, SwapReasonModal, VenueDetailModal, ItineraryMap
  fullscreen, LuckyOverlay) at z-50, and DOM-order paint puts the bubble on
  top of the modal's Submit/Confirm button area. That's my F3, **P1** (taps to
  modal CTAs can be intercepted). Pass 1's collision was bubble-vs-LooksGoodCTA
  (z-50 over z-30), which is the smaller version — same fix path resolves both.

**A6 — Tap-target density and tap highlight.** **Agree.** Pass 1 P3; I rate P3
for the tap-highlight-color piece (`-webkit-tap-highlight-color`) and P2 for
the touch-target sizing (my F9 — date cells 40px, map pins 30px, header icons
32px). The `text-xs ~160 occurrences` figure is correct; most are display
text, not tap targets — worth a once-over.

**B1 — Auth in a webview (Google OAuth).** **Disagree, refine.** Pass 1 calls
out Supabase + Google sign-in as a P0 Capacitor risk. **The Google OAuth path
does not exist in the current codebase.** CLAUDE.md is explicit: "Auth: Supabase
phone OTP (SMS via Twilio), with email/password as alternative. No OAuth
providers." So Pass 1's specific Google-blocks-WKWebView concern is N/A.

But the underlying instinct — auth-redirect URLs in a webview — is right.
The actual Capacitor auth fragility lives in `redirectTo: window.location.origin`
on Supabase email/password reset and email-confirm flows (my F5). In a
Capacitor webview, origin is `capacitor://localhost`, which won't match
Supabase's allowlist and the password-reset email link will land somewhere
nobody owns. **P1** — and de-risk before the wrap, not after.

**B2 — External links must leave the webview.** **Agree, severity refine.**
Matches my F14. Pass 1 P1. I rate **P2**: in mobile Safari (one of the two
target surfaces) `target="_blank"` works fine — the bug is Capacitor-only and
unblockable until the wrap is built. Same fix path: a `openExternalLink()`
helper that branches on `Capacitor.getPlatform()`.

**B3 — Mapbox GL fullscreen overlay on mobile.** **Agree, refine and split.**
Pass 1 bundles three concerns into one. I split:
- Inline map captures single-finger touch (my F4, **P1**) — primarily about
  the INLINE 220px map blocking scroll, not the fullscreen overlay. Pass 1
  focused on the fullscreen path; the inline path is the bigger UX hit because
  the user encounters it on every itinerary view, not just when they tap
  expand.
- Fullscreen close button in safe area — covered transitively by A1 + A2.
- Mapbox perf on mobile webview — needs device test, no source signal.
- Attribution control disabled (my F16) — Pass 1 missed this. **P3** but
  worth a TOS-compliance note.

**B4 — Status bar style and Android back button.** **Agree, pass-1-only.** I
did not audit this; requires Capacitor scaffolding to exist. P1 for the wrap.

**B5 — No PWA manifest.** **Agree, pass-1-only.** Out of scope for Capacitor;
P3 for PWA install path if that's ever wanted.

### Items Pass 1 missed

These are flagged in the per-finding section above but worth restating as a
gap-list:

- **F4 inline-map gesture trap** — Pass 1's map writeup (B3) is fullscreen-only.
  The inline map at `h-[220px]` is the higher-impact case: it sits in the user's
  scroll path on every itinerary view and has no cooperativeGestures /
  touch-action set. **P1.**
- **F5 `window.location.origin` redirectTo** — replaces Pass 1's B1 OAuth
  concern as the real Capacitor auth fragility. **P1.**
- **F10 modal body-scroll-lock lacks `overscroll-behavior: contain`** — iOS
  rubber-band leaks the modal scroll up to the body. Visible on every fast
  flick inside VenueDetailModal / AddVenuePanel. **P2.**
- **F11 CitySwitcher missing body-scroll-lock entirely** — inconsistent with
  every other modal in the app; underlying page scrolls behind the open sheet
  on touch. **P2.**
- **F12 inline-map `onMapClick → fullscreen`** — combined with F4, makes
  scroll-past-map flow trigger an accidental fullscreen takeover. **P2.**
- **F13 modal heights use `max-h-[90vh]` not `dvh`** — extends A3 into the
  modal layer. Pass 1's `min-h-screen` sweep doesn't catch these. **P2.**
- **F16 Mapbox `attributionControl={false}`** — TOS violation, not UX. **P3.**
- **F17 reduced-motion only partially honored** — globals.css handles the
  lucky-die tumble, but Motion-driven Opener/Main/Closer reveal does not. **P3.**
- **F18 PostHog session recording on the OTP screen** — masking-config
  verification needed; phone OTP is the default signup so this hits every user
  on the mobile flow. **P3.**

### Net delta vs Pass 1

- Pass 1 catches 11 items (A1–A6 + B1–B5). I agree with 10 of them, disagree
  with 1 (B1 — wrong specific cause, right family of risk).
- I add 8 items Pass 1 didn't catch (F4 distinct from B3, F5, F10, F11, F12,
  F13, F16, F17, F18 = 9 — F18 counts in scope as a touch-flow concern).
- Where Pass 1 is too conservative on severity (A4 input zoom), I'd promote
  to P1 — the bug is deterministic, no device test needed to fix it.
- Where Pass 1 is too aggressive on severity (B1 OAuth), the specific concern
  is N/A but the family of redirectTo risk is still P1 under a different
  callsite.
