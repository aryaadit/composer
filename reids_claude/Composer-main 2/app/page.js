'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import OnboardingFlow from '@/components/OnboardingFlow';
import HomeScreen from '@/components/HomeScreen';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';

/**
 * Root app gate.
 *
 * Flow:
 *  1. Wait for Firebase auth state to resolve.
 *  2. If not signed in → bounce to /sign-in.
 *  3. If signed in but no onboarding prefs stored on their Firestore profile,
 *     render OnboardingFlow. On completion, persist prefs to users/{uid}.onboarding.
 *  4. If signed in with prefs → render HomeScreen.
 */
export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [prefsLoading, setPrefsLoading] = useState(true);
  const [userPrefs, setUserPrefs] = useState(null);
  const [justOnboarded, setJustOnboarded] = useState(false);

  // Auth gate: if the auth state has resolved and there's no user, punt them
  // to /sign-in. Mandatory sign-up means no anonymous browsing anymore.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/sign-in?next=/');
    }
  }, [authLoading, user, router]);

  // Once signed in, load their onboarding prefs from Firestore.
  useEffect(() => {
    if (authLoading || !user) return;

    let cancelled = false;
    (async () => {
      setPrefsLoading(true);
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (cancelled) return;
        const data = snap.exists() ? snap.data() : null;
        // Only treat onboarding as "complete" if they actually picked a
        // borough — the default profile doc doesn't have that.
        if (data?.onboarding?.borough) {
          setUserPrefs(data.onboarding);
        } else {
          setUserPrefs(null);
        }
      } catch (e) {
        console.warn('Failed to load prefs', e);
        setUserPrefs(null);
      } finally {
        if (!cancelled) setPrefsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const handleOnboardingComplete = async (prefs) => {
    setUserPrefs(prefs);
    setJustOnboarded(true);

    if (!user) return;
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          onboarding: prefs,
          onboardingCompletedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Failed to save onboarding prefs', e);
    }
  };

  // Full-screen spinner for both auth + prefs resolution.
  if (authLoading || !user || prefsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh]">
        <div className="w-8 h-8 border-3 border-[var(--mango)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!userPrefs) {
    return (
      <OnboardingFlow
        onComplete={handleOnboardingComplete}
        defaultName={user.displayName || ''}
        defaultEmail={user.email || ''}
      />
    );
  }

  return (
    <HomeScreen
      userName={userPrefs?.name || user.displayName || 'friend'}
      userPrefs={userPrefs}
      justOnboarded={justOnboarded}
    />
  );
}
