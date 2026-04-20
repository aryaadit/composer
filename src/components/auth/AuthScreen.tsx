"use client";

// AuthScreen — phone-first SMS OTP authentication. Two views:
//   1. Phone entry: user types their number, taps "Send Code"
//   2. Verification: 6-digit code input, auto-submits on last digit
//
// On successful verification, routing is handled by the root page gate
// (session + profile → home, session + no profile → onboarding).

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { sendPhoneOtp, verifyPhoneOtp } from "@/lib/auth";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type View = "phone" | "verify";

/** Strip non-digits, prepend +1 if needed. */
function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

/** Format for display: (212) 555-1234 */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return raw;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

export function AuthScreen() {
  const [view, setView] = useState<View>("phone");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Phone entry ─────────────────────────────────────────────
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid =
    (phoneDigits.length === 10) ||
    (phoneDigits.startsWith("1") && phoneDigits.length === 11);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneValid || submitting) return;
    setSubmitting(true);
    setError(null);

    const result = await sendPhoneOtp(toE164(phone));
    if (!result.ok) {
      setError(result.error ?? "Couldn't send code. Try again.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setView("verify");
  };

  // ── Verification ────────────────────────────────────────────
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_S);
  const cooldownRef = useRef(RESEND_COOLDOWN_S);

  useEffect(() => {
    if (view !== "verify") return;
    cooldownRef.current = RESEND_COOLDOWN_S;
    const interval = setInterval(() => {
      cooldownRef.current = Math.max(0, cooldownRef.current - 1);
      void Promise.resolve().then(() =>
        setResendCooldown(cooldownRef.current)
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [view]);

  // Focus first input on verify view mount
  useEffect(() => {
    if (view === "verify") {
      inputRefs.current[0]?.focus();
    }
  }, [view]);

  const submitCode = useCallback(
    async (digits: string[]) => {
      const token = digits.join("");
      if (token.length !== CODE_LENGTH) return;
      setVerifying(true);
      setVerifyError(null);

      const result = await verifyPhoneOtp(toE164(phone), token);
      if (!result.ok || !result.user) {
        setVerifyError(result.error ?? "Invalid code. Try again.");
        setVerifying(false);
        setCode(Array(CODE_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
        return;
      }

      // Check if user has a profile (returning vs new)
      const { data: profileRow } = await getBrowserSupabase()
        .from("composer_users")
        .select("id")
        .eq("id", result.user.id)
        .maybeSingle();

      // Auth state change will trigger the root page gate to redirect.
      // The session is now live — AuthProvider picks it up via
      // onAuthStateChange and the root page routes accordingly.
      // We don't need to router.replace here because the root gate
      // handles it, but we set a brief submitting state so the UI
      // doesn't flash back to the form.
      void profileRow;
    },
    [phone]
  );

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      if (verifying) return;
      // Only accept digits
      const digit = value.replace(/\D/g, "").slice(-1);
      const next = [...code];
      next[index] = digit;
      setCode(next);

      if (digit && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      // Auto-submit on last digit
      if (digit && index === CODE_LENGTH - 1 && next.every(Boolean)) {
        void submitCode(next);
      }
    },
    [code, verifying, submitCode]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !code[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [code]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
      if (!pasted) return;
      const next = [...code];
      for (let i = 0; i < CODE_LENGTH && i < pasted.length; i++) {
        next[i] = pasted[i];
      }
      setCode(next);
      if (next.every(Boolean)) {
        void submitCode(next);
      } else {
        const firstEmpty = next.findIndex((d) => !d);
        inputRefs.current[firstEmpty >= 0 ? firstEmpty : CODE_LENGTH - 1]?.focus();
      }
    },
    [code, submitCode]
  );

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setVerifyError(null);
    const result = await sendPhoneOtp(toE164(phone));
    if (!result.ok) {
      setVerifyError(result.error ?? "Couldn't resend. Try again.");
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_S);
  };

  // ── Render ──────────────────────────────────────────────────

  if (view === "verify") {
    return (
      <main className="min-h-screen flex flex-col justify-center items-center bg-cream px-6">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="font-serif text-3xl font-normal text-charcoal text-center mb-3">
            Enter your code
          </h1>
          <p className="font-sans text-sm text-muted text-center mb-8">
            Sent to {formatPhone(phone)}
          </p>

          <div className="flex justify-center gap-3 mb-6">
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                disabled={verifying}
                className="w-12 h-14 text-center text-xl font-sans font-medium text-charcoal bg-transparent border-b-2 border-border focus:border-charcoal focus:outline-none transition-colors disabled:opacity-50"
              />
            ))}
          </div>

          {verifyError && (
            <p className="font-sans text-xs text-charcoal text-center mb-4">
              {verifyError}
            </p>
          )}

          {verifying && (
            <p className="font-sans text-sm text-muted text-center mb-4">
              Verifying...
            </p>
          )}

          <div className="flex justify-center gap-4 mt-6">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="font-sans text-xs text-muted hover:text-charcoal transition-colors disabled:cursor-not-allowed"
            >
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Resend code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setView("phone");
                setCode(Array(CODE_LENGTH).fill(""));
                setVerifyError(null);
              }}
              className="font-sans text-xs text-muted hover:text-charcoal transition-colors"
            >
              Change number
            </button>
          </div>
        </motion.div>
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
        <h1 className="font-serif text-3xl font-normal text-charcoal text-center mb-10">
          Compose your night.
        </h1>

        <form onSubmit={handleSendCode} className="flex flex-col gap-5">
          <div>
            <label className="font-sans text-xs tracking-widest uppercase text-muted mb-2 block">
              Phone number
            </label>
            <div className="flex items-center gap-3">
              <span className="font-sans text-base text-muted shrink-0">
                +1
              </span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(212) 555-1234"
                className="w-full px-0 py-3 text-base font-sans bg-transparent border-b border-border focus:border-charcoal focus:outline-none transition-colors text-charcoal placeholder:text-muted"
                autoFocus
              />
            </div>
          </div>

          {error && (
            <p className="font-sans text-xs text-charcoal">{error}</p>
          )}

          <Button
            variant="primary"
            type="submit"
            disabled={!phoneValid || submitting}
            className="w-full"
          >
            {submitting ? "Sending..." : "Send Code"}
          </Button>
        </form>
      </motion.div>
    </main>
  );
}
