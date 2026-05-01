"use client";

// Optional email capture for phone-only users. Shows an inline form
// to attach an email address to their account. Supabase sends a
// verification email automatically.

import { useState } from "react";
import { addEmailToAccount } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AddEmailSectionProps {
  currentEmail: string | null;
}

export function AddEmailSection({ currentEmail }: AddEmailSectionProps) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Already has a confirmed email — nothing to show
  if (currentEmail) return null;

  if (sent) {
    return (
      <section className="mt-8 pt-6 pb-8 border-t border-border">
        <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3">
          Email
        </h3>
        <p className="font-sans text-sm text-charcoal">
          Verification email sent. Check your inbox to confirm.
        </p>
      </section>
    );
  }

  const valid = EMAIL_RE.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);

    const result = await addEmailToAccount(email.trim());
    if (!result.ok) {
      setError(result.error ?? "Couldn't add email. Try again.");
      setSubmitting(false);
      return;
    }
    setSent(true);
    setSubmitting(false);
  };

  return (
    <section className="mt-8 pt-6 pb-8 border-t border-border">
      <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3">
        Add email (optional)
      </h3>
      <form onSubmit={handleSubmit} className="flex gap-3 items-end">
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 px-0 py-2 text-sm font-sans bg-transparent border-b border-border focus:border-charcoal focus:outline-none transition-colors text-charcoal placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!valid || submitting}
          className="font-sans text-xs text-burgundy hover:text-burgundy-light transition-colors disabled:text-muted disabled:cursor-not-allowed shrink-0 pb-2"
        >
          {submitting ? "Sending..." : "Add"}
        </button>
      </form>
      {error && (
        <p className="font-sans text-xs text-charcoal mt-2">{error}</p>
      )}
    </section>
  );
}
