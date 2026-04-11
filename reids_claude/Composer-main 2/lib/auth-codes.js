/**
 * Shared helpers for the 6-digit email code auth flow.
 *
 * Used by both /api/auth/send-code and /api/auth/verify-code so the
 * email-to-key mapping and hashing logic stay in lockstep — if these
 * ever drift, stored hashes won't match and no one will be able to
 * sign in.
 */

import crypto from 'crypto';

/* Normalize an email into a safe Firestore document key. Lowercased,
   with all non-alphanumerics replaced with underscores. */
export function emailToKey(email) {
  return String(email).trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/* SHA-256 of the code, hex-encoded. We hash before storing so a
   Firestore dump doesn't reveal active sign-in codes. */
export function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}
