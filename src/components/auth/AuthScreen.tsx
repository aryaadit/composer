"use client";

// AuthScreen — the one place an unauthenticated visitor lands. Handles
// both sign-in and sign-up through a single "Continue" action (see
// `signInOrSignUp` for the try-in-then-up fallback). The "Forgot
// password?" link swaps this component's view to ForgotPasswordScreen
// rather than routing away, keeping the flow tight and bookmarkable
// at a single URL (`/`).

import { useState } from "react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { signInOrSignUp, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthScreen() {
  const router = useRouter();
  const [view, setView] = useState<"signin" | "forgot">("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (view === "forgot") {
    // Hand the typed-in email over — ForgotPasswordScreen will auto-fire
    // the reset email on mount if it looks valid, skipping straight to
    // the confirmation message. Saves the user from re-typing the same
    // address they already entered here.
    return (
      <ForgotPasswordScreen
        email={email}
        onBack={() => setView("signin")}
      />
    );
  }

  const emailValid = EMAIL_RE.test(email.trim());
  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit = emailValid && passwordValid && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      // Surface the first problem client-side rather than letting the
      // button click fail silently.
      if (!emailValid) setError("Enter a valid email.");
      else if (!passwordValid)
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await signInOrSignUp(email.trim(), password);
    if (!result.ok || !result.user) {
      // The try-in-then-up fallback returns "User already registered"
      // when the email exists but the password was wrong (Supabase
      // gives the same "Invalid login credentials" response for both
      // wrong password and new user, so the sign-up attempt is the
      // thing that differentiates them). Rewrite that to a friendlier
      // message that points at the right recovery path.
      const message = result.error ?? "Something went wrong.";
      if (message.toLowerCase().includes("already registered")) {
        setError('Incorrect password. Use "Forgot password?" to reset it.');
      } else {
        setError(message);
      }
      setSubmitting(false);
      return;
    }

    // Post-auth routing: existing users with a profile row land on
    // HomeScreen; new users (and signed-in users who skipped onboarding
    // earlier) get kicked to /onboarding.
    const supabase = getBrowserSupabase();
    const { data: profileRow } = await supabase
      .from("composer_users")
      .select("id")
      .eq("id", result.user.id)
      .maybeSingle();

    if (profileRow) {
      router.replace("/");
    } else {
      router.replace("/onboarding");
    }
  };

  return (
    <main className="min-h-screen flex flex-col justify-center items-center bg-cream px-6">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="font-serif text-3xl font-normal text-charcoal text-center mb-10">
          Compose your night.
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="font-sans text-xs tracking-widest uppercase text-muted mb-2 block">
              Email
            </label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-0 py-3 text-base font-sans bg-transparent border-b border-border focus:border-charcoal focus:outline-none transition-colors text-charcoal placeholder:text-muted"
              autoFocus
            />
          </div>

          <div>
            <label className="font-sans text-xs tracking-widest uppercase text-muted mb-2 block">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-0 py-3 pr-16 text-base font-sans bg-transparent border-b border-border focus:border-charcoal focus:outline-none transition-colors text-charcoal placeholder:text-muted"
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

          {error && (
            <p className="font-sans text-xs text-charcoal">{error}</p>
          )}

          <Button
            variant="primary"
            type="submit"
            disabled={submitting}
            className="w-full"
          >
            {submitting ? "Continuing…" : "Continue →"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setView("forgot")}
          className="block mx-auto mt-6 font-sans text-xs text-muted hover:text-charcoal transition-colors"
        >
          Forgot password?
        </button>
      </motion.div>
    </main>
  );
}
