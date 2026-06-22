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
import {
  sendPhoneOtp,
  verifyPhoneOtp,
  signInOrSignUp,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";

type AuthMode = "phone" | "email";
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
  const [authMode, setAuthMode] = useState<AuthMode>("phone");
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
  // Single input (not 6 split inputs): iOS Safari's "From Messages"
  // one-time-code autofill fires an input event with the full code,
  // which a maxLength=1 input would truncate to the first digit. A
  // single input with autocomplete="one-time-code" gets both native
  // autofill on iOS and Android plus normal paste for free.
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  // Focus input on verify view mount
  useEffect(() => {
    if (view === "verify") {
      inputRef.current?.focus();
    }
  }, [view]);

  const submitCode = useCallback(
    async (token: string) => {
      if (token.length !== CODE_LENGTH) return;
      setVerifying(true);
      setVerifyError(null);

      const result = await verifyPhoneOtp(toE164(phone), token);
      if (!result.ok || !result.user) {
        setVerifyError(result.error ?? "Invalid code. Try again.");
        setVerifying(false);
        setCode("");
        inputRef.current?.focus();
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
      void profileRow;
    },
    [phone]
  );

  const handleCodeChange = useCallback(
    (value: string) => {
      if (verifying) return;
      const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
      setCode(digits);
      if (digits.length === CODE_LENGTH) {
        void submitCode(digits);
      }
    },
    [verifying, submitCode]
  );

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setVerifyError(null);
    const result = await sendPhoneOtp(toE164(phone), { isResend: true });
    if (!result.ok) {
      setVerifyError(result.error ?? "Couldn't resend. Try again.");
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_S);
  };

  // ── Render ──────────────────────────────────────────────────

  if (authMode === "email") {
    return (
      <EmailAuthForm onSwitchToPhone={() => setAuthMode("phone")} />
    );
  }

  if (view === "verify") {
    return (
      <div className="min-h-dvh flex flex-col bg-cream">
        <div className="flex-1 flex flex-col px-6 max-w-lg w-full mx-auto">
          <motion.div
            className="flex-1 flex flex-col justify-center"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
          >
            <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
              Enter your code
            </h1>
            <p className="font-sans text-sm text-warm-gray mb-8">
              Sent to {formatPhone(phone)}
            </p>

            <div className="mb-6">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                disabled={verifying}
                aria-label={`${CODE_LENGTH}-digit verification code`}
                placeholder="••••••"
                className="w-full py-3 text-center text-3xl font-sans font-medium tracking-[0.5em] indent-[0.5em] text-charcoal bg-transparent border-b-2 border-border focus:border-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 transition-colors disabled:opacity-50 placeholder:text-border"
              />
            </div>

            {verifyError && (
              <p role="alert" className="font-sans text-xs text-burgundy mb-4">
                {verifyError}
              </p>
            )}

            {verifying && (
              <p className="font-sans text-sm text-muted mb-4">
                Verifying...
              </p>
            )}

            <div className="flex gap-4 mt-4">
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
                  setCode("");
                  setVerifyError(null);
                }}
                className="font-sans text-xs text-muted hover:text-charcoal transition-colors"
              >
                Change number
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-cream">
      <div className="flex-1 flex flex-col px-6 max-w-lg w-full mx-auto">
        <motion.div
          className="flex-1 flex flex-col justify-center"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
        >
          <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
            Can we have your number?
          </h1>
          <p className="font-sans text-sm text-warm-gray mb-8">
            So you don&apos;t lose all your plans.
          </p>

          <form onSubmit={handleSendCode} className="flex flex-col gap-5">
            <div>
              <label
                htmlFor="auth-phone"
                className="font-sans text-xs tracking-widest uppercase text-muted mb-2 block"
              >
                Phone number
              </label>
              <div className="flex items-center gap-3">
                <span className="font-sans text-base text-muted shrink-0">
                  +1
                </span>
                <input
                  id="auth-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(212) 555-1234"
                  className="w-full px-0 py-3 text-base font-sans bg-transparent border-b border-border focus:border-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 transition-colors text-charcoal placeholder:text-muted"
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="font-sans text-xs text-burgundy">{error}</p>
            )}

            <p className="font-sans text-xs text-muted leading-relaxed mt-2 mb-2">
              By tapping Send code, you agree to receive SMS messages from
              Composer for account verification. Message frequency varies.
              Message and data rates may apply. Reply STOP to opt out, HELP
              for help. See our{" "}
              <a
                href="https://www.onpalate.com/composer/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-charcoal transition-colors"
              >
                Privacy Policy
              </a>
              .
            </p>

            <Button
              variant="primary"
              type="submit"
              disabled={!phoneValid || submitting}
              className="w-full"
            >
              {submitting ? "Sending..." : "Send code"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setAuthMode("email")}
            className="block mt-6 font-sans text-xs text-muted hover:text-charcoal transition-colors"
          >
            Use email instead
          </button>
        </motion.div>
      </div>
    </div>
  );
}

// ── Email/password auth form ────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailAuthForm({
  onSwitchToPhone,
}: {
  onSwitchToPhone: () => void;
}) {
  const [emailView, setEmailView] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (emailView === "forgot") {
    return (
      <ForgotPasswordScreen
        email={email}
        onBack={() => setEmailView("signin")}
      />
    );
  }

  const emailValid = EMAIL_RE.test(email.trim());
  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit = emailValid && passwordValid && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      if (!emailValid) setError("Enter a valid email.");
      else if (!passwordValid)
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await signInOrSignUp(email.trim(), password);
    if (!result.ok || !result.user) {
      const message = result.error ?? "Something went wrong.";
      if (message.toLowerCase().includes("already registered")) {
        setError('Incorrect password. Use "Forgot password?" to reset it.');
      } else {
        setError(message);
      }
      setSubmitting(false);
      return;
    }

    // Session is now live — AuthProvider + root gate handle routing.
  };

  return (
    <div className="min-h-dvh flex flex-col bg-cream">
      <div className="flex-1 flex flex-col px-6 max-w-lg w-full mx-auto">
        <motion.div
          className="flex-1 flex flex-col justify-center"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
        >
          <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
            Sign in with email
          </h1>
          <p className="font-sans text-sm text-warm-gray mb-8">
            So you don&apos;t lose all your plans.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label
              htmlFor="auth-email"
              className="font-sans text-xs tracking-widest uppercase text-muted mb-2 block"
            >
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-0 py-3 text-base font-sans bg-transparent border-b border-border focus:border-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 transition-colors text-charcoal placeholder:text-muted"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="font-sans text-xs tracking-widest uppercase text-muted mb-2 block"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-0 py-3 pr-16 text-base font-sans bg-transparent border-b border-border focus:border-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 transition-colors text-charcoal placeholder:text-muted"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-0 top-1/2 -translate-y-1/2 font-sans text-xs text-muted hover:text-charcoal transition-colors"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="font-sans text-xs text-burgundy">{error}</p>
          )}

          <Button
            variant="primary"
            type="submit"
            disabled={submitting}
            className="w-full"
          >
            {submitting ? "Continuing..." : "Continue"}
          </Button>
        </form>

          <div className="flex gap-4 mt-6">
            <button
              type="button"
              onClick={() => setEmailView("forgot")}
              className="font-sans text-xs text-muted hover:text-charcoal transition-colors"
            >
              Forgot password?
            </button>
            <button
              type="button"
              onClick={onSwitchToPhone}
              className="font-sans text-xs text-muted hover:text-charcoal transition-colors"
            >
              Use phone instead
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
