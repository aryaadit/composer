# Onboarding Login Investigation

## Root Cause: FOUND

The bug is a **state destruction race condition** between the root page gate and the onboarding flow.

### The sequence that breaks:

1. User is on `/` (root page). No session → root gate renders `<OnboardingFlow />` inline.
2. User goes through steps 0–4 (splash, name, context, preferences, neighborhoods). All state is in OnboardingFlow's `useState` hooks.
3. Step 5: OnboardingFlow renders `<AuthScreen />`. User enters phone, gets OTP, enters code.
4. `verifyPhoneOtp()` succeeds → Supabase session is created.
5. AuthProvider's `onAuthStateChange` fires → `applySession(newSession)` runs.
6. AuthProvider sets `session` + `user` in state, fetches profile → `profile = null` (new user, no profile row yet).
7. **Root page gate re-renders.** It now sees `session && !profile` → triggers `router.replace("/onboarding")`.
8. Browser navigates from `/` to `/onboarding`. This **unmounts** the current `<OnboardingFlow />` component.
9. `/onboarding/page.tsx` renders a **NEW** `<OnboardingFlow />` instance.
10. New instance starts at **step 0** with all useState hooks reset to defaults. The user's name, contexts, drinks, dietary, neighborhoods are **lost**.
11. The useEffect that saves the profile (line 74) has guard `step !== TOTAL_STEPS - 1` → `0 !== 5` → **does not fire**.
12. User sees the splash screen again. Stuck in a loop.

### Why it worked before Reid's changes

Before Reid's merge, the root gate rendered `<AuthScreen />` for unauthenticated users, NOT `<OnboardingFlow />`. Auth happened first, then the user was routed to `/onboarding` which rendered OnboardingFlow with a session already in place. The profile collection happened AFTER auth, not before.

Reid reversed the order: **collect profile first (steps 0–4), auth last (step 5)**. This means the OnboardingFlow holds profile state in memory while auth happens. When the root gate unmounts it on session creation, that state is destroyed.

---

## File Map

| File | Purpose |
|---|---|
| `src/app/page.tsx` | Root gate: no session → OnboardingFlow, session+profile → HomeScreen, session+!profile → redirect /onboarding |
| `src/app/onboarding/page.tsx` | Guarded onboarding page: requires session, no profile |
| `src/components/onboarding/OnboardingFlow.tsx` | 6-step flow: splash → name → context → prefs → hoods → auth |
| `src/components/auth/AuthScreen.tsx` | Phone OTP + email/password auth |
| `src/components/providers/AuthProvider.tsx` | Session/profile state, onAuthStateChange subscription |
| `src/lib/auth.ts` | Supabase auth wrappers |

## Guards & Redirects Inventory

| Location | Condition | Redirects to | Problem? |
|---|---|---|---|
| `page.tsx:29` | `session && !profile` | `/onboarding` | **YES — fires mid-flow, unmounts OnboardingFlow** |
| `onboarding/page.tsx:20` | `!user` | `/` | No |
| `onboarding/page.tsx:24` | `profile` exists | `/` | No |
| `OnboardingFlow.tsx:90` | `user` + step 5 + profile saved | `/` | Works correctly IF it fires |

## Fix Direction

**Option A (minimal):** Prevent the root gate from redirecting while OnboardingFlow is active at step 5. Add a flag or check that OnboardingFlow is handling the auth-to-profile transition.

**Option B (recommended):** Don't render OnboardingFlow on the root page at all for unauthenticated users. Instead:
- Root page: no session → `<AuthScreen />` (phone OTP only, no profile collection)
- After auth → AuthProvider detects session + no profile → redirect to `/onboarding`
- `/onboarding` renders OnboardingFlow starting at step 1 (skip splash, user already authed)
- This matches the pre-merge flow and avoids the state destruction issue

**Option C (quick hack):** In OnboardingFlow's useEffect (line 74), don't guard on `step === TOTAL_STEPS - 1`. Instead, detect that `user` exists and profile data is available regardless of step, and save immediately. This is fragile — the step guard exists for a reason.

## Recommended Diagnostic Test

Open Chrome DevTools → Application → Cookies. Go through the onboarding flow to step 5 (auth screen). Enter phone + OTP. Watch:

1. **Network tab:** Look for the `POST` to Supabase's `/auth/v1/verify` — it should return 200 with a session.
2. **Console:** After OTP verification, look for `[auth] applySession` logs. If you see the session landing, the auth worked.
3. **URL bar:** After OTP success, does the URL change from `/` to `/onboarding`? If yes, that confirms the root gate redirect is the culprit.
4. **Screen:** Do you see the splash screen ("Start Composing") again? If yes, OnboardingFlow was re-mounted at step 0.
