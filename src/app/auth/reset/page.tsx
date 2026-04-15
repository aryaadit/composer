"use client";

// Landing page for the password-reset email link. Supabase redirects
// here with `?code=<one-time>` (PKCE) or a `type=recovery` hash token
// (implicit). We exchange the code for a temporary session, render the
// new-password form, and call updateUser to persist the change.
//
// Once the password is set we redirect to `/` — from there the normal
// routing gate (HomeScreen vs /onboarding) takes over based on whether
// the user has a profile row.

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { updatePassword, MIN_PASSWORD_LENGTH } from "@/lib/auth";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [ready, setReady] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exchange the one-time code for a session on mount. Supabase newer
  // flows send `?code=...`; if a session is already present (e.g. the
  // user opened the link in the same browser they started the reset
  // in) we skip the exchange and go straight to the form.
  useEffect(() => {
    let cancelled = false;
    const code = searchParams.get("code");

    const run = async () => {
      const supabase = getBrowserSupabase();
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        if (!cancelled) setReady(true);
        return;
      }

      if (!code) {
        if (!cancelled) {
          setExchangeError(
            "This reset link is invalid or has expired. Request a new one."
          );
          setReady(true);
        }
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;
      if (error) {
        setExchangeError(error.message);
      }
      setReady(true);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH &&
    confirm === password &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const result = await updatePassword(password);
    if (!result.ok) {
      setError(result.error ?? "Couldn't update password.");
      setSubmitting(false);
      return;
    }
    router.replace("/");
  };

  if (!ready) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (exchangeError) {
    return (
      <main className="min-h-screen flex flex-col justify-center items-center bg-cream px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-serif text-2xl font-normal text-charcoal mb-3">
            Reset link expired
          </h1>
          <p className="font-sans text-sm text-muted mb-8">{exchangeError}</p>
          <Button variant="primary" href="/" className="w-full">
            Back to sign in
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col justify-center items-center bg-cream px-6">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="font-serif text-2xl font-normal text-charcoal text-center mb-3">
          Set a new password
        </h1>
        <p className="font-sans text-sm text-muted text-center mb-8">
          Pick something you&apos;ll remember.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="font-sans text-xs tracking-widest uppercase text-muted mb-2 block">
              New password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-0 py-3 pr-16 text-base font-sans bg-transparent border-b border-border focus:border-charcoal focus:outline-none transition-colors text-charcoal placeholder:text-muted"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-0 top-1/2 -translate-y-1/2 font-sans text-xs text-muted hover:text-charcoal transition-colors"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div>
            <label className="font-sans text-xs tracking-widest uppercase text-muted mb-2 block">
              Confirm password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
              className="w-full px-0 py-3 text-base font-sans bg-transparent border-b border-border focus:border-charcoal focus:outline-none transition-colors text-charcoal placeholder:text-muted"
            />
          </div>

          {error && (
            <p className="font-sans text-xs text-charcoal">{error}</p>
          )}

          <Button
            variant="primary"
            type="submit"
            disabled={!canSubmit}
            className="w-full"
          >
            {submitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      </motion.div>
    </main>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams requires a Suspense boundary in app-router pages;
  // wrap the content so Next can stream the static shell first.
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
          <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
