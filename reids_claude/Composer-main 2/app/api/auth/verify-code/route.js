/**
 * POST /api/auth/verify-code
 *
 * Body: { email: string, code: string }
 *
 * Validates the 6-digit code against the SHA-256 hash stored in
 * `authCodes/{emailKey}`. On success, looks up (or creates) the
 * Firebase user for that email and mints a custom token via the
 * Admin SDK. The client then calls `signInWithCustomToken(auth, token)`
 * which triggers the normal `onAuthStateChanged` path — so the
 * existing onboarding flow (ensureUserProfile → users/{uid} →
 * borough check in app/page.js) runs unchanged.
 *
 * Security:
 *   - Max 5 attempts per code. After that the doc is deleted and
 *     the user has to request a new one.
 *   - Codes expire after 10 minutes.
 *   - Hash comparison uses a constant-time check so we don't leak
 *     information via timing.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { emailToKey, hashCode, normalizeEmail } from '@/lib/auth-codes';

const MAX_ATTEMPTS = 5;

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidCode(code) {
  return typeof code === 'string' && /^\d{6}$/.test(code.trim());
}

/* Constant-time hex-string compare. `crypto.timingSafeEqual` throws
   on length mismatch, which we guard against. */
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/* Look up the Firebase user for an email; create one if none exists. */
async function getOrCreateUser(email) {
  try {
    return await adminAuth.getUserByEmail(email);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') {
      return await adminAuth.createUser({
        email,
        emailVerified: true,
      });
    }
    throw err;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = body?.email;
    const rawCode = body?.code;

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 }
      );
    }
    if (!isValidCode(rawCode)) {
      return NextResponse.json(
        { error: 'Enter the 6-digit code from your email.' },
        { status: 400 }
      );
    }

    const code = rawCode.trim();
    const key = emailToKey(email);
    const ref = adminDb.collection('authCodes').doc(key);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: 'That code is no longer valid. Please request a new one.' },
        { status: 400 }
      );
    }

    const data = snap.data() || {};
    const expiresAtMs = data.expiresAt?.toMillis?.() || 0;

    // Expired: clean up and fail.
    if (!expiresAtMs || Date.now() > expiresAtMs) {
      await ref.delete().catch(() => {});
      return NextResponse.json(
        { error: 'That code has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    const attempts = data.attempts || 0;
    if (attempts >= MAX_ATTEMPTS) {
      await ref.delete().catch(() => {});
      return NextResponse.json(
        {
          error:
            'Too many incorrect attempts. Please request a new code.',
        },
        { status: 429 }
      );
    }

    const providedHash = hashCode(code);
    if (!safeEqualHex(providedHash, data.codeHash || '')) {
      // Wrong code — increment attempts, keep the doc around.
      await ref.update({ attempts: attempts + 1 }).catch(() => {});
      const remaining = Math.max(0, MAX_ATTEMPTS - (attempts + 1));
      return NextResponse.json(
        {
          error:
            remaining > 0
              ? `Incorrect code. ${remaining} ${
                  remaining === 1 ? 'attempt' : 'attempts'
                } remaining.`
              : 'Incorrect code. Please request a new one.',
        },
        { status: 400 }
      );
    }

    // Code is valid — burn it immediately so it can't be reused.
    await ref.delete().catch(() => {});

    // Get or create the Firebase user for this email.
    const normalizedEmail = normalizeEmail(email);
    const user = await getOrCreateUser(normalizedEmail);

    // Mint a custom token the client can exchange for a session.
    const customToken = await adminAuth.createCustomToken(user.uid, {
      email: normalizedEmail,
    });

    return NextResponse.json({
      token: customToken,
      uid: user.uid,
      email: normalizedEmail,
    });
  } catch (err) {
    console.error('[verify-code] fatal:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
