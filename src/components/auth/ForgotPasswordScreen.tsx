"use client";

// Inline "forgot password" view swapped in by AuthScreen. When
// AuthScreen hands us a valid-looking email (the user already typed it
// to try signing in) we auto-fire the reset request on mount and jump
// straight to the confirmation state — no second form. If the email is
// missing or malformed, or the auto-fire errors out, we fall back to a
// manual form so the user can still get unstuck.

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { sendPasswordResetEmail } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  /** Email carried over from AuthScreen, if any. */
  email?: string;
  onBack: () => void;
}

export function ForgotPasswordScreen({ email = "", onBack }: Props) {
  const trimmedPropEmail = email.trim();
  const propEmailValid = EMAIL_RE.test(trimmedPropEmail);

  // Mode picks between auto-fire (propEmailValid) and manual form.
  // Flips to "manual" if the auto-fire errors so the user can retry.
  const [mode, setMode] = useState<"auto" | "manual">(
    propEmailValid ? "auto" : "manual"
  );
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [formEmail, setFormEmail] = useState(
    propEmailValid ? "" : trimmedPropEmail
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard against re-firing under React strict-mode's double-mount and
  // any mode flips that re-run the effect. One auto-fire per mount.
  const autoFiredRef = useRef(false);

  useEffect(() => {
    if (mode !== "auto" || autoFiredRef.current) return;
    autoFiredRef.current = true;
    let cancelled = false;
    sendPasswordResetEmail(trimmedPropEmail).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setSent(true);
        setSentTo(trimmedPropEmail);
      } else {
        setMode("manual");
        setFormEmail(trimmedPropEmail);
        setError(result.error ?? "Couldn't send the reset link.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, trimmedPropEmail]);

  const formEmailValid = EMAIL_RE.test(formEmail.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmailValid || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await sendPasswordResetEmail(formEmail.trim());
    if (!result.ok) {
      setError(result.error ?? "Couldn't send the reset link.");
      setSubmitting(false);
      return;
    }
    setSent(true);
    setSentTo(formEmail.trim());
    setSubmitting(false);
  };

  return (
    <main className="min-h-screen flex flex-col justify-center items-center bg-cream px-6">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {sent ? (
          <div className="text-center">
            <p className="font-sans text-base text-warm-gray">
              Check your email.
            </p>
            <p className="font-sans text-base text-warm-gray mt-1">
              We sent a password reset link to{" "}
              <span className="font-medium text-charcoal">{sentTo}</span>.
            </p>
          </div>
        ) : mode === "auto" ? (
          // Auto-fire is in flight — brief spinner so the user doesn't
          // see a dead frame while the reset email is being sent.
          <div className="flex items-center justify-center py-6">
            <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <h1 className="font-serif text-2xl font-normal text-charcoal text-center mb-3">
              Reset your password
            </h1>
            <p className="font-sans text-sm text-muted text-center mb-8">
              We&apos;ll email you a link to set a new one.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div>
                <label className="font-sans text-xs tracking-widest uppercase text-muted mb-2 block">
                  Email
                </label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-0 py-3 text-base font-sans bg-transparent border-b border-border focus:border-charcoal focus:outline-none transition-colors text-charcoal placeholder:text-muted"
                  autoFocus
                />
              </div>

              {error && (
                <p className="font-sans text-xs text-charcoal">{error}</p>
              )}

              <Button
                variant="primary"
                type="submit"
                disabled={submitting || !formEmailValid}
                className="w-full"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </>
        )}

        <button
          type="button"
          onClick={onBack}
          className="block mx-auto mt-8 font-sans text-xs text-muted hover:text-charcoal transition-colors"
        >
          &larr; Back to sign in
        </button>
      </motion.div>
    </main>
  );
}
