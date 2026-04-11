'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

/**
 * /sign-in — 6-digit email code flow.
 *
 * Two-step UI:
 *  1. `enter` — user types their email and taps "Send me a code".
 *     We POST /api/auth/send-code which generates the code, stores
 *     a hash in Firestore, and emails the plaintext via Resend.
 *  2. `code`  — user types the 6 digits from their inbox. We POST
 *     /api/auth/verify-code which returns a Firebase custom token,
 *     then we sign in with it. onAuthStateChanged handles the
 *     redirect into onboarding/dashboard.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInInner />
    </Suspense>
  );
}

function SignInFallback() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-[var(--mango)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function SignInInner() {
  const { user, loading, sendEmailCode, verifyEmailCode } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState('enter'); // 'enter' | 'code'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [devCode, setDevCode] = useState(''); // only populated when the server is in dev fallback mode
  const codeInputRef = useRef(null);

  // Already signed in? Bounce to next.
  useEffect(() => {
    if (!loading && user) {
      router.replace(next);
    }
  }, [loading, user, next, router]);

  // Autofocus the code input whenever we land on step 2.
  useEffect(() => {
    if (mode === 'code' && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [mode]);

  // Countdown for the resend link.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const handleSend = async (e) => {
    e?.preventDefault?.();
    setError('');
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      const res = await sendEmailCode(trimmed);
      setMode('code');
      setCode('');
      setResendIn(60);
      // Dev fallback: server returns the code inline when no Resend
      // key is configured. Show it in a banner so you don't have to
      // hunt through the terminal.
      setDevCode(res?.devMode && res?.devCode ? String(res.devCode) : '');
    } catch (err) {
      setError(err?.message || 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  /* `overrideCode` lets the auto-submit paths (on-6th-digit and
     dev-banner click) pass the code directly instead of racing
     against an unflushed setCode() call. */
  const handleVerify = async (eOrCode) => {
    if (eOrCode && typeof eOrCode.preventDefault === 'function') {
      eOrCode.preventDefault();
    }
    const overrideCode = typeof eOrCode === 'string' ? eOrCode : null;
    const source = overrideCode ?? code;
    setError('');
    const digits = source.replace(/\D/g, '');
    if (digits.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    try {
      await verifyEmailCode(email.trim(), digits);
      // onAuthStateChanged → redirect effect takes over.
    } catch (err) {
      setError(err?.message || 'That code didn\'t work. Please try again.');
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await sendEmailCode(email.trim());
      setResendIn(60);
      setCode('');
      setDevCode(res?.devMode && res?.devCode ? String(res.devCode) : '');
    } catch (err) {
      setError(err?.message || 'Could not resend. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white relative">
      {/* Soft mango glow background */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[60%] pointer-events-none"
        style={{
          background:
            'radial-gradient(90% 70% at 50% 0%, rgba(255,122,17,0.12) 0%, rgba(255,122,17,0) 70%)',
        }}
      />

      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        {/* Mango emblem */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #ff8a2b 0%, #ff6b11 100%)',
            boxShadow: '0 12px 28px -10px rgba(255,122,17,0.55)',
          }}
        >
          <Sparkle />
        </div>

        {mode === 'enter' && (
          <>
            <div className="eyebrow mb-2 text-center">WELCOME</div>
            <h1 className="serif text-4xl text-center mb-3 leading-tight">
              Your NYC,
              <br />
              one date at a time.
            </h1>
            <p className="text-[var(--muted)] text-center mb-8 max-w-sm">
              Drop your email and we&apos;ll send you a 6-digit code to sign in.
              No password to remember.
            </p>

            <form
              onSubmit={handleSend}
              className="w-full max-w-sm flex flex-col gap-3"
            >
              <label className="relative">
                <span className="sr-only">Email address</span>
                <Mail
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  type="email"
                  required
                  autoFocus
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-full border border-[#ececec] bg-white pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-[var(--mango)] focus:ring-2 focus:ring-[var(--mango-soft)]"
                />
              </label>

              <button
                type="submit"
                disabled={busy || loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[var(--mango)] text-white px-5 py-3.5 text-sm font-semibold hover:bg-[var(--mango-dark)] disabled:opacity-60 shadow-sm transition-colors"
              >
                {busy ? 'Sending…' : 'Send me a code'}
                {!busy && <ArrowRight size={16} />}
              </button>
            </form>

            {error && (
              <div className="mt-4 text-sm text-red-600 max-w-sm text-center">
                {error}
              </div>
            )}

            <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-sm text-center">
              <Benefit emoji="📍" label="Your NYC map" />
              <Benefit emoji="🔖" label="Saved plans" />
              <Benefit emoji="⏰" label="Date reminders" />
            </div>

            <div className="mt-10 text-xs text-[var(--muted)] max-w-sm text-center">
              By continuing you agree to Composer&apos;s terms. Your plan data is
              stored privately — we never share it with other users.
            </div>
          </>
        )}

        {mode === 'code' && (
          <>
            <div className="eyebrow mb-2 text-center">CHECK YOUR INBOX</div>
            <h1 className="serif text-3xl text-center mb-3 leading-tight">
              Enter your code
            </h1>
            <p className="text-[var(--muted)] text-center mb-6 max-w-sm">
              We sent a 6-digit code to{' '}
              <span className="text-black font-semibold">{email}</span>. It
              expires in 10 minutes.
            </p>

            {devCode && (
              <div className="w-full max-w-sm mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center">
                <div className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold mb-1">
                  Dev mode · no email sent
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCode(devCode);
                    handleVerify(devCode);
                  }}
                  className="text-2xl font-bold tracking-[0.25em] text-amber-900 font-variant-numeric tabular-nums hover:underline"
                  title="Click to auto-fill"
                >
                  {devCode}
                </button>
                <div className="text-[11px] text-amber-700 mt-1">
                  Click to auto-fill. Set RESEND_API_KEY to send real emails.
                </div>
              </div>
            )}

            <form
              onSubmit={handleVerify}
              className="w-full max-w-sm flex flex-col gap-3"
            >
              <input
                ref={codeInputRef}
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(digits);
                  if (digits.length === 6) {
                    // Auto-submit once they've typed all 6.
                    handleVerify(digits);
                  }
                }}
                className="w-full rounded-2xl border border-[#ececec] bg-white px-5 py-4 text-center text-2xl font-bold tracking-[0.5em] focus:outline-none focus:border-[var(--mango)] focus:ring-2 focus:ring-[var(--mango-soft)] font-variant-numeric tabular-nums"
              />

              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[var(--mango)] text-white px-5 py-3.5 text-sm font-semibold hover:bg-[var(--mango-dark)] disabled:opacity-60 shadow-sm transition-colors"
              >
                {busy ? 'Signing in…' : 'Sign in'}
                {!busy && <ArrowRight size={16} />}
              </button>
            </form>

            {error && (
              <div className="mt-4 text-sm text-red-600 max-w-sm text-center">
                {error}
              </div>
            )}

            <div className="mt-6 text-sm text-[var(--muted)]">
              Didn&apos;t get it?{' '}
              <button
                type="button"
                onClick={handleResend}
                disabled={resendIn > 0 || busy}
                className="text-[var(--mango-dark)] font-semibold hover:underline disabled:opacity-60 disabled:no-underline"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMode('enter');
                setCode('');
                setError('');
              }}
              className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-black"
            >
              <ArrowLeft size={14} /> Use a different email
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Sparkle() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2l2.09 6.26L20 9.27l-5 4.87L16.18 21 12 17.77 7.82 21 9 14.14l-5-4.87 5.91-1.01L12 2z"
        fill="#fff"
      />
    </svg>
  );
}

function Benefit({ emoji, label }) {
  return (
    <div className="rounded-xl bg-white border border-[#ececec] py-3 px-2">
      <div className="text-xl mb-1">{emoji}</div>
      <div className="text-[11px] text-[var(--muted)] leading-tight">
        {label}
      </div>
    </div>
  );
}
