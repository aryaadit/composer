"use client";

// Inline "forgot password" view swapped in by AuthScreen. Sends the
// reset email and surfaces the confirmation state without navigating
// — the user stays on the same URL and can click Back to return to
// the sign-in form.

import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { sendPasswordResetEmail } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  onBack: () => void;
}

export function ForgotPasswordScreen({ onBack }: Props) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await sendPasswordResetEmail(email.trim());
    if (!result.ok) {
      setError(result.error ?? "Couldn't send the reset link.");
      setSubmitting(false);
      return;
    }
    setSent(true);
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
        <h1 className="font-serif text-2xl font-normal text-charcoal text-center mb-3">
          Reset your password
        </h1>
        <p className="font-sans text-sm text-muted text-center mb-8">
          We&apos;ll email you a link to set a new one.
        </p>

        {sent ? (
          <div className="text-center">
            <p className="font-sans text-sm text-charcoal mb-2">
              Check your email for a reset link.
            </p>
            <p className="font-sans text-xs text-muted">
              It goes to {email.trim()}.
            </p>
          </div>
        ) : (
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

            {error && (
              <p className="font-sans text-xs text-charcoal">{error}</p>
            )}

            <Button
              variant="primary"
              type="submit"
              disabled={submitting || !emailValid}
              className="w-full"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={onBack}
          className="block mx-auto mt-6 font-sans text-xs text-muted hover:text-charcoal transition-colors"
        >
          &larr; Back to sign in
        </button>
      </motion.div>
    </main>
  );
}
