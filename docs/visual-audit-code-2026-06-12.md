# Visual Consistency Audit — 2026-06-12

Read-only audit of all user-facing UI against the design tokens, BRAND_VOICE rules, and the component primitives in `src/components/ui/`. **No code was changed in this pass.** Severity-tiered punch list below.

## Method

- 6 parallel dimension reviewers (color, type, copy, component drift, states, a11y) scanned `src/components/**`, `src/app/**` (excluding `/api`, the admin section, `/profile/_components` admin subtree only where flagged), and `src/app/globals.css`.
- Every raw finding was adversarially re-verified against the actual source. **23 false positives were refuted** and excluded from this doc — see the bottom for the refuted list, kept for traceability.
- **42 confirmed findings** below. Each carries a `file:line` citation, the evidence excerpt, and a one-line recommendation. No fixes proposed beyond that scope.

## Headline numbers

| Severity            | Count |
| ------------------- | ----: |
| **fix-before-launch** |  13 |
| **fix-soon**          |  25 |
| **cosmetic**          |   4 |

By dimension (confirmed):

| Dimension         | Count |
| ----------------- | ----: |
| a11y              |   20 |
| states            |    7 |
| component drift   |    5 |
| copy              |    5 |
| color             |    3 |
| type              |    2 |

## What pattern jumps out

- **A11y is the dominant gap.** 11 of the 13 launch-blockers and 9 of the 25 fix-soons are accessibility. Most are mechanical (`htmlFor`, `aria-label`, `role="status"`, touch-target sizing) — no architectural rework, just a sweep.
- **Three near-identical modal shells and five distinct card recipes** are the biggest structural drift items. A `Modal` and `Card` primitive in `src/components/ui/` would absorb roughly 200 lines of duplicated chrome.
- **Five high-traffic primary CTAs bypass the `Button` primitive** — the most-tapped buttons in the app reinvent the burgundy-fill recipe each time.
- **One banned word ships to the browser tab title** (`Composer — Curated NYC Nights Out` in [src/app/layout.tsx:24](src/app/layout.tsx#L24)). Most other copy is clean.
- **One floating button ships Tailwind zinc palette greys** ([src/components/ui/FeedbackButton.tsx:17](src/components/ui/FeedbackButton.tsx#L17)) — the only second-accent leak in the audit.

---

## 🚨 fix-before-launch (13)

### A11y — form fields with no accessible name (5)

#### Phone-number input has no associated label
**[src/components/auth/AuthScreen.tsx:266](src/components/auth/AuthScreen.tsx#L266)** — the visible `<label>Phone number</label>` at line 259 has no `htmlFor`; the `<input type="tel">` has no `id` / `aria-label`. Screen readers announce the input as "edit, blank."
Fix: `id="phone"` on input, `htmlFor="phone"` on label (or wrap the input inside the label).

#### Email + password inputs in email sign-in have no associated label
**[src/components/auth/AuthScreen.tsx:398-407, :415-422](src/components/auth/AuthScreen.tsx#L398-L422)** (labels at :395 and :411) — same shape as the phone bug above on the only alternative auth flow.
Fix: `id` / `htmlFor` pairs (or `aria-label` on each input).

#### Forgot-password email input has no associated label
**[src/components/auth/ForgotPasswordScreen.tsx:119-128](src/components/auth/ForgotPasswordScreen.tsx#L119-L128)** (label at :116).
Fix: `id="reset-email"` + `htmlFor="reset-email"`.

#### Password-reset page inputs have no associated label (and Show/Hide toggle is anonymous)
**[src/app/auth/reset/page.tsx:145-156, :168-176](src/app/auth/reset/page.tsx#L145-L176)** (labels at :141, :165) — both visual-sibling labels; the Show/Hide toggle button at :154 has no aria-label.
Fix: `id` / `htmlFor` pairs, plus `aria-label="Show password"` + `aria-pressed` on the toggle.

#### Onboarding name input has no associated label
**[src/components/onboarding/OnboardingFlow.tsx:180-203](src/components/onboarding/OnboardingFlow.tsx#L180-L203)** — visible `<h1>What should we call you?</h1>` at :174 isn't associated; the input has no `aria-label`.
Fix: `aria-label="Your first name"` (or `aria-labelledby` pointing at an `id` on the h1).

### A11y — focus suppression on inputs (1)

#### Rename inputs in saved-plan rows suppress the focus outline with no replacement indicator
**[src/components/shared/SavedPlanRow.tsx:117](src/components/shared/SavedPlanRow.tsx#L117), [SavedPlanRowExpanded.tsx:224](src/components/shared/SavedPlanRowExpanded.tsx#L224)** — `border-b border-burgundy focus:outline-none` with no `focus-visible:*` replacement. Border is burgundy at rest AND on focus, so keyboard users see zero focus indication when the inputRef programmatically moves focus.
Fix: `focus-visible:ring-2 focus-visible:ring-burgundy/40` (or a focus-only border-color change distinct from the resting burgundy border).

### Copy — banned words in title / OG metadata (2)

#### "Curated" in the browser tab + Open Graph title
**[src/app/layout.tsx:24, :28](src/app/layout.tsx#L24)** — `title: "Composer — Curated NYC Nights Out"` ships to every tab title and OG share preview.
Fix: drop "Curated" per BRAND_VOICE. Suggested: `"Composer - nights out in NYC"`.

#### "Curated" in the meta description / OG description
**[src/app/layout.tsx:26, :30](src/app/layout.tsx#L26)** — `"A curated night out in New York City, built for you in under a minute."`
Fix: `"A night out in New York City, planned for you in under a minute."`

### Copy — Title Case on primary CTAs (2)

#### "Send Code" primary CTA uses Title Case
**[src/components/auth/AuthScreen.tsx:305](src/components/auth/AuthScreen.tsx#L305)** — `{submitting ? "Sending..." : "Send Code"}`. The consent line at :284 ("By tapping Send Code,") needs to match.
Fix: `"Send code"` in both places.

#### "Get Started" splash hero CTA uses Title Case
**[src/app/page.tsx:208](src/app/page.tsx#L208)** — `<Button variant="primary" onClick={onGetStarted} className="w-full">Get Started</Button>`.
Fix: `"Get started"`.

### Color — second accent palette leak (1)

#### `FeedbackButton` ships Tailwind zinc greys instead of design tokens
**[src/components/ui/FeedbackButton.tsx:17](src/components/ui/FeedbackButton.tsx#L17)** — `bg-zinc-800` (#27272a) and `hover:bg-zinc-700` (#3f3f46) on a fixed, always-visible floating button on **every user-facing page** (mounted in [src/app/layout.tsx:48](src/app/layout.tsx#L48)).
Fix: switch to tokens. Either `bg-charcoal text-cream hover:bg-charcoal/90` for near-black, or `bg-burgundy text-cream hover:bg-burgundy-light` if the founders want the affordance on-brand.

### Component drift — primary CTAs and modal shells (2)

#### Five high-traffic primary CTAs bypass the `Button` primitive
**[src/components/home/HomeScreen.tsx:107](src/components/home/HomeScreen.tsx#L107)** (New plan →), **[itinerary/LooksGoodCTA.tsx:179-187](src/components/itinerary/LooksGoodCTA.tsx#L179)** (Looks Good / Saved ✓), **[venue/VenueDetailModal.tsx:257](src/components/venue/VenueDetailModal.tsx#L257)** (Reserve), **[itinerary/StopAvailability.tsx:358](src/components/itinerary/StopAvailability.tsx#L358)** (Reserve), **[itinerary/SwapReasonModal.tsx:199](src/components/itinerary/SwapReasonModal.tsx#L199)** (Submit). Each hand-rolls the canonical `rounded-full bg-burgundy text-cream font-sans font-medium hover:bg-burgundy-light transition-colors` recipe and skips `Button`'s focus ring + motion props.
Fix: route all five through `<Button variant="primary" />`. If LooksGoodCTA wants a chunkier block CTA and the inline ones want a compact variant, add a `size` prop to `Button` once.

#### Three near-identical modal shells with no shared primitive
**[venue/VenueDetailModal.tsx:53-88](src/components/venue/VenueDetailModal.tsx#L53)**, **[itinerary/SwapReasonModal.tsx:77-115](src/components/itinerary/SwapReasonModal.tsx#L77)**, **[itinerary/ConfirmModal.tsx:82-119](src/components/itinerary/ConfirmModal.tsx#L82)** — all three copy the same shell verbatim: `AnimatePresence` + backdrop (`fixed inset-0 z-40 bg-charcoal/40`) + sheet (`fixed inset-x-0 bottom-0 ... rounded-t-2xl ... md:rounded-2xl`) + spring damping/stiffness + Esc handler + body scroll lock + sticky header with grabber + close ✕.
Fix: extract `src/components/ui/Modal.tsx` (or `Sheet.tsx`) owning the shell + a11y; have the three consume it.

---

## ⚙️ fix-soon (25)

### A11y — async surfaces missing `role="status"` (7)

| Location | What's missing |
| --- | --- |
| **[components/questionnaire/StepLoading.tsx:69-90](src/components/questionnaire/StepLoading.tsx#L69)** | Compose loading rotates messages every 2.5s with no `aria-live`. AT users hear silence during a 5-15s compose call. Mirror `LuckyOverlay.tsx:142`'s pattern. |
| **[components/onboarding/OnboardingFlow.tsx:125-136](src/components/onboarding/OnboardingFlow.tsx#L125)** | "Setting up your account…" spinner has no `role`/`aria-live`. |
| **[components/home/HomeScreen.tsx:132-140](src/components/home/HomeScreen.tsx#L132)** + **[app/profile/_components/SavedPlansList.tsx:25-34](src/app/profile/_components/SavedPlansList.tsx#L25)** | "Loading…" paragraphs for the saved-plans fetch. |
| **[app/auth/reset/page.tsx:100-106, :196-209](src/app/auth/reset/page.tsx#L100)** | OTP-exchange + Suspense fallback spinners are bare `<div className="animate-spin" />`. |
| **[components/auth/ForgotPasswordScreen.tsx:103-105](src/components/auth/ForgotPasswordScreen.tsx#L103)** | Auto-fire reset-email spinner with no announcement. |
| **[app/profile/_components/FieldPrimitives.tsx:92-108](src/app/profile/_components/FieldPrimitives.tsx#L92)** | "Saved" fade-in after a profile field saves is silent. |

Canonical pattern to reuse: `[components/ui/Toast.tsx:72-75](src/components/ui/Toast.tsx#L72)` (`aria-live="polite" aria-atomic="true"`) or `[components/home/LuckyOverlay.tsx:142](src/components/home/LuckyOverlay.tsx#L142)`.

### A11y — focus suppression across every text input (1)

#### Auth / profile / onboarding text inputs all use `focus:outline-none` with only a border-color change
**[components/auth/AuthScreen.tsx:196, :273, :405, :421](src/components/auth/AuthScreen.tsx#L196)**, **[ForgotPasswordScreen.tsx:126](src/components/auth/ForgotPasswordScreen.tsx#L126)**, **[app/auth/reset/page.tsx:151, :174](src/app/auth/reset/page.tsx#L151)**, **[OnboardingFlow.tsx:189](src/components/onboarding/OnboardingFlow.tsx#L189)**, **[AddEmailSection.tsx:68](src/app/profile/_components/AddEmailSection.tsx#L68)** — input chrome relies on a single underline border-color change as the only focus indicator after removing the browser outline. The Button component already does it right at **[Button.tsx:25](src/components/ui/Button.tsx#L25)** — mirror the `focus-visible:ring-2 focus-visible:ring-burgundy/40` pattern there.

### A11y — accessible names + secondary controls (4)

#### Rename inputs in saved-plan rows have no accessible name
**[SavedPlanRow.tsx:109-118](src/components/shared/SavedPlanRow.tsx#L109)**, **[SavedPlanRowExpanded.tsx:215-225](src/components/shared/SavedPlanRowExpanded.tsx#L215)** — pencil triggers say "Rename" but the resulting input is anonymous.
Fix: `aria-label="Rename plan"` on each input.

#### Add-email and SwapReason "other" inputs lack accessible names
**[AddEmailSection.tsx:62-69](src/app/profile/_components/AddEmailSection.tsx#L62)** + **[SwapReasonModal.tsx:177-184](src/components/itinerary/SwapReasonModal.tsx#L177)** — placeholder text isn't an accessible name.
Fix: `aria-label="Email"` and `aria-label="Tell us more about why you swapped"`.

#### `SwapReason` "Other" text input suppresses outline with only a border-color delta
**[SwapReasonModal.tsx:183](src/components/itinerary/SwapReasonModal.tsx#L183)** — `focus:outline-none focus:border-charcoal` on a border-border → charcoal transition; conditionally shown in a modal where the field is easy to lose visually.
Fix: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/30` (matches `Button.tsx:25`).

### A11y — touch-target sizing (3)

#### Rename + remove buttons in `SavedPlanRowExpanded` are 32×32px
**[SavedPlanRowExpanded.tsx:323-334, :364-375](src/components/shared/SavedPlanRowExpanded.tsx#L323)** — `w-8 h-8` (32px). Primary affordances on a touch surface.
Fix: `w-11 h-11` (44px) or `w-10 h-10` (40px).

#### Yes / No confirmation buttons in `SavedPlanRow` are tiny text taps
**[SavedPlanRow.tsx:155-174](src/components/shared/SavedPlanRow.tsx#L155)** — `font-sans text-xs` with no padding; touch height collapses to ~16-18px. The destructive "Yes" confirms a delete — easy mis-tap.
Fix: wrap each in `min-w-[44px] min-h-[44px] flex items-center justify-center`, or add `px-3 py-2`.

#### Modal close ✕ buttons compute to ~30-36px hit zone
**[VenueDetailModal.tsx:110-116](src/components/venue/VenueDetailModal.tsx#L110)**, **[ConfirmModal.tsx:221-228](src/components/itinerary/ConfirmModal.tsx#L221)**, **[SwapReasonModal.tsx:140-147](src/components/itinerary/SwapReasonModal.tsx#L140)**, **[CitySwitcher.tsx:73-79](src/components/questionnaire/CitySwitcher.tsx#L73)** — all four use `p-3 -m-2` on a text-sm ✕ glyph. Hit zone ~38px, borderline.
Fix: explicit `w-11 h-11 flex items-center justify-center` to guarantee 44px.

### States — error treatment + saved-data semantics (3)

#### Auth/forgot-password error messages render in `text-charcoal` not `text-burgundy`
**[AuthScreen.tsx:200-204, :279-281, :433-435](src/components/auth/AuthScreen.tsx#L200)**, **[ForgotPasswordScreen.tsx:131-133](src/components/auth/ForgotPasswordScreen.tsx#L131)** — all errors render as ordinary body copy. `OnboardingFlow.tsx:204-207` correctly uses `text-burgundy` for name-validation errors; mirror that.
Fix: switch the error paragraphs to `text-burgundy` + `role="alert"`.

#### Auth reset page error has no `role="alert"` and renders in body color
**[app/auth/reset/page.tsx:178-180](src/app/auth/reset/page.tsx#L178)** — `text-charcoal` body color, visually indistinguishable from supporting copy.
Fix: `text-burgundy` + `role="alert"`.

#### `SwapReasonModal` "Other" field silently truncates at 200 chars
**[SwapReasonModal.tsx:176-185](src/components/itinerary/SwapReasonModal.tsx#L176)** — `maxLength={200}` with no character counter, no helper text, no `aria-describedby`. The `reason_text` rides into the Supabase mirror; silent truncation is bad data and bad UX.
Fix: small char-count indicator (`{otherText.length}/200`) that turns burgundy near the cap.

### Color — token bypass on body copy (2)

#### Hardcoded grey `#444444` for body copy bypasses the token system
**[ui/StopCard.tsx:213](src/components/ui/StopCard.tsx#L213)** + **[venue/VenueDetailModal.tsx:161](src/components/venue/VenueDetailModal.tsx#L161)** — `text-[#444444]` on the curation note + curation blockquote. Not equivalent to `text-charcoal` (#111), `text-warm-gray` (#6B6B6B), or `text-muted` (#9B9B9B).
Fix: pick one of the existing tokens (`text-warm-gray` matches the secondary-text role) and apply at both call sites.

#### Hardcoded `#D8D8D8` border + divider on the itinerary stop list
**[ItineraryView.tsx:176](src/components/itinerary/ItineraryView.tsx#L176)** — `border-y border-[#D8D8D8] divide-y divide-[#D8D8D8]` on the primary divider rendered to every user. Token `--color-border` is `#E8E8E8`.
Fix: `border-y border-border divide-y divide-border`. If a darker rule is intentional, promote it to a new `--color-border-strong` token instead.

### Type — arbitrary size pair with the `#444444` color (1)

#### Arbitrary `text-[15px]` body size used only on these two curation surfaces
**[StopCard.tsx:213](src/components/ui/StopCard.tsx#L213)** + **[VenueDetailModal.tsx:161](src/components/venue/VenueDetailModal.tsx#L161)** — `text-[15px]` doesn't appear anywhere else in `src/`; surrounding body copy is `text-sm` (14px) or `text-base` (16px).
Fix: pick `text-sm` or `text-base` for both. If 15px is genuinely right, promote to a Tailwind token (`text-body`).

### Component drift — cards, chips, ghost CTAs (3)

#### Five distinct card recipes across home + itinerary — no `Card` primitive
**[SavedPlanRowExpanded.tsx:187](src/components/shared/SavedPlanRowExpanded.tsx#L187)**, **[TonightsPickCard.tsx:88](src/components/home/TonightsPickCard.tsx#L88)**, **[OrderingConflictBanner.tsx:74](src/components/itinerary/OrderingConflictBanner.tsx#L74)**, **[PastItineraryBanner.tsx:19](src/components/itinerary/PastItineraryBanner.tsx#L19)**, **[ComposeFailureBlock.tsx:32](src/components/itinerary/ComposeFailureBlock.tsx#L32)** — each picks its own (radius, border, background).
Fix: add `src/components/ui/Card.tsx` with `tone: 'neutral' | 'accent' | 'warning'` and `radius: 'md' | 'lg'` (lock the classes inside). Standardize on `rounded-xl` for content cards; reserve `rounded-2xl` for modal sheets.

#### Award / vibe / meta chips hand-rolled across modal + picker — no `Chip` primitive
**[VenueDetailModal.tsx:155, :182, :336](src/components/venue/VenueDetailModal.tsx#L155)**, **[CitySwitcher.tsx:110](src/components/questionnaire/CitySwitcher.tsx#L110)**, **[SavedPlanRowExpanded.tsx:336](src/components/shared/SavedPlanRowExpanded.tsx#L336)** — three distinct read-only chip recipes coexist. The burgundy-tint badge is duplicated three ways; the bordered muted meta chip is a separate fork.
Fix: add `src/components/ui/Chip.tsx` with `tone: 'accent' | 'meta' | 'neutral'` and `size: 'sm' | 'md'`. CLAUDE.md note: `pillClass` = selectable, `Chip` = read-only.

### Copy — Title Case on a profile heading (1)

#### "Your Profile" page heading uses Title Case
**[app/profile/_components/ProfileHeader.tsx:31](src/app/profile/_components/ProfileHeader.tsx#L31)** — functional-surface heading.
Fix: `"Your profile"`.

---

## 🧹 cosmetic (4)

#### Stop-card "Swap" link and `StopAvailability` "Show more" are text-xs taps
**[StopCard.tsx:248-253](src/components/ui/StopCard.tsx#L248)**, **[StopAvailability.tsx:318-326, :330-336](src/components/itinerary/StopAvailability.tsx#L318)** — `font-sans text-xs` with no padding (~16-18px touch height). Inline secondary affordances.
Fix: `py-2 px-1` (or `min-h-[36px]`) to hit ~36px.

#### AuthScreen resend / change number / use phone buttons are text-xs
**[AuthScreen.tsx:213-222, :223-233, :309-315, :448-462](src/components/auth/AuthScreen.tsx#L213)** — all four secondary actions are `font-sans text-xs` with no padding (~16px touch height). Primary recovery affordances on a phone-first flow.
Fix: `py-2` on each.

#### `Button`'s focus ring uses `:focus` not `:focus-visible`
**[ui/Button.tsx:25](src/components/ui/Button.tsx#L25)** — `focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-burgundy/50`. Fires on mouse click too, can look like a stuck ring after click.
Fix: switch `focus:*` to `focus-visible:*` so the ring only shows for keyboard focus.

#### Dashed-outline ghost CTAs duplicated in `ItineraryView` with no primitive
**[ItineraryView.tsx:244, :272](src/components/itinerary/ItineraryView.tsx#L244)** — "Plan another →" and "+ Add another stop" repeat the same `rounded-full border border-dashed border-burgundy/50 px-5 py-2.5 ... hover:bg-burgundy/5` recipe once as a Link, once as a button.
Fix: add `variant="ghost"` (dashed outline) to `Button` (already handles `href`), or factor a tiny local helper.

---

## What the audit didn't find

These were checked and came up clean — flagged here so the next pass doesn't redo the work:

- **No stale `#FAF8F5`** (the legacy cream) anywhere in user-facing source. The 2026-06-12 token migration to `#FFFFFF` is fully propagated.
- **No second accent color** (green, blue, orange) beyond the `FeedbackButton` zinc issue called out above. Burgundy is the only accent rendered.
- **No emojis in UI chrome** (BRAND_VOICE rule § 2.b).
- **No font-bold / extrabold / light / semibold** in user-facing UI. The weight scale is honored.
- **No banned words in the questionnaire / itinerary / saved-plans body** — only the `<title>` / OG meta strings need scrubbing.

## Refuted findings (kept for traceability)

23 raw findings were refuted on adversarial verify. The most instructive false-positive pattern: **em-dash sweeps that flagged em dashes inside aria-labels and metadata titles**. The audit's "em dashes banned in user-facing strings" rule applies to copy the user READS as content. An em dash inside a tab title or alt-text is invisible-to-the-reader chrome — flagging it would generate edits with no user impact. The other recurring refutation was **Title Case on questionnaire occasion labels** (`"Date Night"`, `"Friends Night Out"`) — those are option labels in a card grid where BRAND_VOICE explicitly carves out proper-noun and brand-style use; they read as named occasions, not as utility copy.

| Dimension | Refuted finding |
| --- | --- |
| type | `SlotChip` subtitle uses `text-[10px]` without an explicit font-sans family |
| copy | Em dash in metadata title (browser tab + share preview) |
| copy | Em dash in aria-label on Composer logo link |
| copy | Em dash in `StopStatusBadge` tooltips |
| copy | Em dash in primary save-error toast |
| copy | Em dash in `ConfirmModal` subhead after save |
| copy | Em dash in `OrderingConflictBanner` copy |
| copy | Em dashes in `StopAvailability` error/unconfirmed copy (four strings) |
| copy | Em dash in onboarding dietary helper text |
| copy | Em dash before "Composer" attribution in `VenueDetailModal` blockquote |
| copy | "Looks Good" primary CTA uses Title Case |
| copy | Questionnaire occasion card labels use Title Case ("Date Night", "Friends Night Out") |
| copy | Onboarding context labels use Title Case |
| copy | "All Out" budget label override uses Title Case |
| copy | Generated budget labels ("Casual ($)", "Nice Out ($$)", "All Out ($$$$)", "No Preference") render Title Case when the override doesn't apply |
| states | `StopCard` hero image lacks `onError` fallback |
| states | `VenueDetailModal` photo carousel lacks `onError` per image |
| states | `SavedPlanRowExpanded` venue thumbnails lack `onError` |
| states | `ItineraryMap` dynamic-import placeholder lacks loading semantics |
| states | `TonightsPickCard` map onError is correct but venue rows have no fallback for missing image data |
| states | `AddEmailSection` Add button has disabled state but no cursor-not-allowed on its disabled hover |
| a11y | `LooksGoodCTA` save acknowledgement is silent |
| a11y | `AuthScreen` show/hide password button has no aria-label |

---

*Audit run via 6 parallel dimension reviewers + adversarial verify per finding. Total: 71 agents, 65 raw findings, 42 confirmed, 23 refuted. Read-only — no source files were modified.*
