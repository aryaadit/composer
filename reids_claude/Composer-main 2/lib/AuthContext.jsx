'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCustomToken,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

const AuthContext = createContext({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  sendEmailCode: async () => {},
  verifyEmailCode: async () => null,
  signOut: async () => {},
});

/**
 * Ensure every signed-in user has a /users/{uid} profile doc so
 * downstream pages (dashboard, saved, settings) can read and write
 * without a pre-check. We only create on first sign-in.
 *
 * IMPORTANT: this does NOT populate the onboarding section, so the
 * existing gate in app/page.js (checks users/{uid}.onboarding.borough)
 * still routes brand-new users into the onboarding flow.
 */
async function ensureUserProfile(user) {
  if (!user) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      preferences: {
        neighborhoods: [],
        cuisines: [],
        dietary: [],
        budget: 'solid',
        maxWalkMinutes: 12,
        notifications: {
          departureAlerts: true,
          weatherAlerts: true,
        },
      },
    });
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Finalize any pending popup-blocked redirect sign-ins.
    getRedirectResult(auth).catch(() => {});

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          await ensureUserProfile(u);
        } catch (e) {
          console.warn('ensureUserProfile failed', e);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ---------- Google (kept as a fallback) ---------------------------------

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      if (
        err?.code === 'auth/popup-blocked' ||
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw err;
    }
  }, []);

  // ---------- Email + 6-digit code (primary flow) -------------------------

  /**
   * Ask the server to generate & email a 6-digit sign-in code to the
   * given address. Throws with a user-facing message on failure.
   */
  const sendEmailCode = useCallback(async (email) => {
    if (!email) throw new Error('Email is required');
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || 'Could not send the code. Please try again.');
    }
    /* In dev mode (no Resend key), the server returns the code inline
       so the sign-in page can show it. Returned verbatim — caller
       decides whether to surface it. */
    return data;
  }, []);

  /**
   * Submit the 6-digit code for verification. On success, the server
   * returns a Firebase custom token which we exchange for a session
   * via signInWithCustomToken. That triggers onAuthStateChanged, which
   * runs ensureUserProfile and hands control back to app/page.js — so
   * new users get routed to onboarding just like before.
   */
  const verifyEmailCode = useCallback(async (email, code) => {
    if (!email || !code) throw new Error('Email and code are required');
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.token) {
      throw new Error(data?.error || 'That code didn\'t work. Please try again.');
    }
    const result = await signInWithCustomToken(auth, data.token);
    return result;
  }, []);

  // ---------- sign out ----------------------------------------------------

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        sendEmailCode,
        verifyEmailCode,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
