/**
 * POST /api/auth/send-code
 *
 * Body: { email: string }
 *
 * Generates a 6-digit code, hashes it with SHA-256, stores the hash in
 * Firestore under `authCodes/{email-as-key}` with a 10-minute expiry
 * and a 5-attempt ceiling, then emails the plaintext code to the user
 * via Resend.
 *
 * We hash the code before storing so a Firestore dump doesn't reveal
 * active sign-in codes. The plaintext only exists in the outbound email
 * body and in memory on this server for the duration of the request.
 *
 * Rate limit: one code per email every 60 seconds, enforced by checking
 * `authCodes/{key}.lastSentAt`.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { Resend } from 'resend';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { emailToKey, hashCode, normalizeEmail } from '@/lib/auth-codes';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute

function generateCode() {
  /* crypto.randomInt gives a uniform distribution from 0..999999. Pad
     to 6 digits so we never send "42". */
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildEmailHtml(code) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #1a1a1a;">
      <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 16px 0;">Your Composer sign-in code</h1>
      <p style="font-size: 15px; line-height: 1.5; color: #555; margin: 0 0 24px 0;">
        Enter this 6-digit code to finish signing in. It expires in 10 minutes.
      </p>
      <div style="background: #fff8ed; border: 1px solid #ffd9a8; border-radius: 12px; padding: 20px; text-align: center; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #c04a00; font-variant-numeric: tabular-nums;">
        ${code}
      </div>
      <p style="font-size: 13px; line-height: 1.5; color: #888; margin: 24px 0 0 0;">
        If you didn't request this, you can safely ignore this email — no one can sign in without the code.
      </p>
    </div>
  `;
}

function buildEmailText(code) {
  return `Your Composer sign-in code: ${code}\n\nEnter this 6-digit code to finish signing in. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = body?.email;

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    const isDev = process.env.NODE_ENV !== 'production';

    /* In production, an unconfigured Resend key is a hard error — we
       don't want to silently fail to deliver codes. In development we
       fall back to logging the code to the server console (and echoing
       it back in the JSON response) so you can test the full flow
       without setting up any email provider. */
    if (!apiKey && !isDev) {
      return NextResponse.json(
        {
          error:
            'Email delivery is not configured. Set RESEND_API_KEY in .env.local.',
        },
        { status: 500 }
      );
    }

    const key = emailToKey(email);
    const ref = adminDb.collection('authCodes').doc(key);

    // Rate limit: one code per minute per email.
    const existing = await ref.get();
    if (existing.exists) {
      const data = existing.data() || {};
      const lastSentAt = data.lastSentAt?.toMillis?.() || 0;
      if (Date.now() - lastSentAt < RESEND_COOLDOWN_MS) {
        const secondsLeft = Math.ceil(
          (RESEND_COOLDOWN_MS - (Date.now() - lastSentAt)) / 1000
        );
        return NextResponse.json(
          {
            error: `Please wait ${secondsLeft} more seconds before requesting another code.`,
          },
          { status: 429 }
        );
      }
    }

    const code = generateCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await ref.set({
      email: normalizeEmail(email),
      codeHash,
      expiresAt,
      attempts: 0,
      lastSentAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });

    // Dev fallback: no Resend key → log the code to the terminal and
    // echo it back in the JSON response so the client can auto-fill it
    // if it wants to. Never do this in production.
    if (!apiKey) {
      const banner = '═'.repeat(46);
      console.log(
        `\n${banner}\n  [dev] Sign-in code for ${email}: ${code}\n  (expires in 10 min — no RESEND_API_KEY set)\n${banner}\n`
      );
      return NextResponse.json({
        ok: true,
        expiresInSeconds: CODE_TTL_MS / 1000,
        devCode: code,
        devMode: true,
      });
    }

    // Real delivery via Resend.
    const resend = new Resend(apiKey);
    const { error: sendError } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: 'Your Composer sign-in code',
      html: buildEmailHtml(code),
      text: buildEmailText(code),
    });

    if (sendError) {
      console.error('[send-code] Resend error:', sendError);
      return NextResponse.json(
        { error: 'Could not send the email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      expiresInSeconds: CODE_TTL_MS / 1000,
    });
  } catch (err) {
    console.error('[send-code] fatal:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
