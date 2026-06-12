"use client";

// Thin wrappers around the Supabase auth surface Composer uses.
//
// Everything here is browser-side; the server reads auth via
// `@/lib/supabase/server`. The goal of this module is to keep every
// auth-touching component talking to "auth" (not to Supabase directly)
// so if the provider ever changes the blast radius stays in one file.
//
// ─── Supabase project settings required ────────────────────────────────
// Authentication → Providers → Phone: Enable with Twilio credentials.
// Authentication → Providers → Email: Keep enabled for "add email later"
//   and password reset flows.
// Authentication → URL Configuration → Site URL: https://composer.onpalate.com
// Authentication → URL Configuration → Redirect URLs: https://composer.onpalate.com/**
//   (plus http://localhost:3000/** and https://*.vercel.app/** for previews)
// ────────────────────────────────────────────────────────────────────────

import { getBrowserSupabase } from "@/lib/supabase/browser";
import { validateProfilePayload } from "@/lib/validation/profile";
import { EVENTS, track } from "@/lib/analytics";
import { deriveSignupSource } from "@/lib/analytics/signup-source";
import { STORAGE_KEYS } from "@/config/storage";
import type {
  Session,
  User,
  AuthChangeEvent,
  Subscription,
} from "@supabase/supabase-js";
import type { ComposerUser, UserPrefs } from "@/types";

/** Auth action sites can't locally know signup vs signin — phone OTP
 *  reuses the same `verifyOtp` call for both, and the password
 *  fallback's `looksNew` heuristic is a substring match on supabase's
 *  error message. The honest source of truth is the same one the root
 *  router consults: does a Composer profile row exist? Action sites
 *  stash the verified method + source here and the routing branch
 *  drains it after AuthProvider resolves the profile. */
export type AuthPendingMethod = "phone" | "password";
export interface AuthPendingEmit {
  method: AuthPendingMethod;
  signup_source: string;
}

function setAuthPendingEmit(method: AuthPendingMethod): void {
  if (typeof window === "undefined") return;
  try {
    const payload: AuthPendingEmit = {
      method,
      signup_source: deriveSignupSource(),
    };
    window.sessionStorage.setItem(
      STORAGE_KEYS.session.authPendingEmit,
      JSON.stringify(payload),
    );
  } catch {
    // Quota / private-mode failures are swallowed — the emit is
    // best-effort; the routing itself doesn't depend on it.
  }
}

/**
 * Minimum password length enforced by both the UI and this module.
 * Matches Supabase's default lower bound; bump both sides together if
 * the project raises this requirement.
 */
export const MIN_PASSWORD_LENGTH = 8;

export async function getSession(): Promise<Session | null> {
  const { data } = await getBrowserSupabase().auth.getSession();
  return data.session;
}

export async function getAuthUser(): Promise<User | null> {
  const { data } = await getBrowserSupabase().auth.getUser();
  return data.user;
}

/** Tagged result so callers can distinguish "row genuinely absent" from
 *  "fetch failed" — collapsing them previously caused returning users
 *  whose composer_users SELECT failed transiently to be re-onboarded
 *  over their existing row AND mis-fire user_signed_up. The routing
 *  branch keys off this discriminant. */
export type ProfileFetchResult =
  | { kind: "found"; profile: ComposerUser }
  | { kind: "absent" }
  | { kind: "errored"; reason: string };

/** Read the joined Composer profile row for the current session.
 *
 *  Retries twice (with 200ms then 400ms backoff) before surrendering to
 *  `errored`. The retry absorbs JWT-vs-RLS propagation lag in the
 *  seconds after verifyOtp returns + the usual flake on mobile
 *  networks, while still keeping the "absent" path snappy for new
 *  signups (success on the first attempt → ~0ms extra). */
export async function getProfile(userId: string): Promise<ProfileFetchResult> {
  const ATTEMPTS = 2;
  const BACKOFF_MS = [200, 400];
  let lastErr: string | null = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[i - 1] ?? 400));
    }
    const { data, error } = await getBrowserSupabase()
      .from("composer_users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (!error) {
      return data
        ? { kind: "found", profile: data as ComposerUser }
        : { kind: "absent" };
    }
    lastErr = error.message;
    console.error(
      `[auth] getProfile attempt ${i + 1}/${ATTEMPTS} failed:`,
      error.message,
    );
  }
  return { kind: "errored", reason: lastErr ?? "unknown" };
}

/**
 * Insert or update the current user's profile. Called from the
 * onboarding completion path — the session already exists at that
 * point (signUp or signIn happened before onboarding), so RLS's
 * `auth.uid() = id` check passes and the upsert succeeds with just
 * the profile fields.
 */
export async function upsertProfile(
  userId: string,
  prefs: UserPrefs
): Promise<ComposerUser | null> {
  // Validate against current taxonomy before write. Bad payload =
  // throw so the caller surfaces the message inline. Client-side
  // validation should catch this first; this is defense-in-depth.
  const errors = validateProfilePayload({
    name: prefs.name,
    context: prefs.context,
    dietary: prefs.dietary,
    drinks: prefs.drinks ?? undefined,
  });
  if (errors.length > 0) {
    throw new Error(errors[0].message);
  }

  const row = {
    id: userId,
    name: prefs.name,
    context: prefs.context ?? [],
    drinks: prefs.drinks ?? null,
    dietary: prefs.dietary ?? [],
    favorite_hoods: prefs.favoriteHoods ?? [],
  };
  const { data, error } = await getBrowserSupabase()
    .from("composer_users")
    .upsert(row)
    .select()
    .single();
  if (error) {
    console.error("[auth] upsertProfile failed:", error.message);
    return null;
  }
  return data as ComposerUser;
}

export async function signOut(): Promise<void> {
  await getBrowserSupabase().auth.signOut();
}

// ─── Phone OTP ──────────────────────────────────────────────────────────

interface AuthActionResult {
  ok: boolean;
  user?: User;
  error?: string;
}

/**
 * Send an SMS OTP to the given phone number. Phone must be E.164
 * format (e.g. "+12125551234"). Supabase + Twilio handle delivery.
 *
 * Fires `otp_requested` with `is_resend` so the auth funnel head is:
 *   otp_requested (is_resend=false) → user_signed_up | user_signed_in
 *   otp_requested (is_resend=true)  → (retry attempt)
 * The emit happens BEFORE the network call so failed sends (Twilio
 * outage, rate-limit) still count as user intent.
 */
export async function sendPhoneOtp(
  phone: string,
  opts: { isResend?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  track(EVENTS.OTP_REQUESTED, { is_resend: opts.isResend ?? false });
  const { error } = await getBrowserSupabase().auth.signInWithOtp({ phone });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Verify the 6-digit SMS code. On success a session is created —
 * new users get an `auth.users` row automatically, returning users
 * get their existing session refreshed.
 */
export async function verifyPhoneOtp(
  phone: string,
  token: string
): Promise<AuthActionResult> {
  const { data, error } = await getBrowserSupabase().auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });
  if (error) return { ok: false, error: error.message };
  if (!data.user) return { ok: false, error: "Verification returned no user." };

  // Defer the user_signed_up / user_signed_in emit to the root routing
  // branch — phone OTP can't locally distinguish the two (verifyOtp is
  // the same call for new and returning). Drained in src/app/page.tsx
  // once AuthProvider resolves profile existence (the same source of
  // truth that decides /onboarding vs /).
  setAuthPendingEmit("phone");
  return { ok: true, user: data.user };
}

/**
 * Attach an email address to the current session. Triggers a
 * verification email from Supabase. Used on the profile page for
 * users who signed up with phone and want to add email later.
 */
export async function addEmailToAccount(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getBrowserSupabase().auth.updateUser({ email });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Email/password (legacy, kept for password reset) ───────────────────

/**
 * Attempt sign-in first, fall back to sign-up if the credentials look
 * like a new user. Single entry point used by `AuthScreen` so the UI
 * doesn't have to toggle between sign-in and sign-up modes — the only
 * branching is whether the user has onboarded, which routing handles
 * downstream.
 *
 * Known limitation: Supabase returns "Invalid login credentials" for
 * both wrong password and non-existent user, so a returning user with
 * a mistyped password falls through to sign-up and gets back "User
 * already registered". Acceptable for MVP; the UI shows a "Forgot
 * password?" link that's the right path out of this state.
 */
export async function signInOrSignUp(
  email: string,
  password: string
): Promise<AuthActionResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const supabase = getBrowserSupabase();

  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (!signInError && signInData.user) {
    // Defer to the routing branch — see verifyPhoneOtp note. Even though
    // the sign-in branch is locally "known" here, the password fallback's
    // looksNew heuristic below is a substring match on supabase's error
    // text, which can mis-classify. Routing on profile existence is the
    // honest single source of truth.
    setAuthPendingEmit("password");
    return { ok: true, user: signInData.user };
  }

  const msg = signInError?.message.toLowerCase() ?? "";
  const looksNew = msg.includes("invalid") || msg.includes("not found");
  if (!looksNew) {
    return { ok: false, error: signInError?.message ?? "Sign in failed." };
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (signUpError) return { ok: false, error: signUpError.message };
  if (!signUpData.user) {
    return { ok: false, error: "Sign up returned no user." };
  }
  // KNOWN LATENT GAP: when the Supabase project has "Confirm email"
  // enabled, signUp returns data.user but data.session = null. The
  // pending-emit token is set in THIS tab's sessionStorage; if the
  // user clicks the confirmation email link in a different tab or
  // browser (the normal flow), that tab finds no token and
  // user_signed_up never fires. Today the project has email
  // confirmation OFF so this doesn't fire in practice — but the
  // header note at the top of this file calls out the email provider
  // staying enabled, which makes a future toggle change foreseeable.
  // When that happens, move the source-of-truth off sessionStorage
  // (user_metadata.signup_method is the idiomatic Supabase move).
  setAuthPendingEmit("password");
  return { ok: true, user: signUpData.user };
}

/**
 * Send a password-reset email. The redirect lands on `/auth/reset`,
 * which exchanges the one-time code for a session and surfaces the
 * new-password form.
 */
export async function sendPasswordResetEmail(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/reset`
      : undefined;

  const { error } = await getBrowserSupabase().auth.resetPasswordForEmail(
    email,
    { redirectTo }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Apply a new password to the currently-authenticated session. Valid
 * only after `/auth/reset` has exchanged the recovery code into a
 * session — callers should verify `getSession()` first.
 */
export async function updatePassword(
  password: string
): Promise<{ ok: boolean; error?: string }> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  const { error } = await getBrowserSupabase().auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

export function onAuthStateChange(cb: AuthListener): Subscription {
  const { data } = getBrowserSupabase().auth.onAuthStateChange((event, session) => {
    cb(event, session);
  });
  return data.subscription;
}
