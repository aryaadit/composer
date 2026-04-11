'use client';

import { useState, useEffect } from 'react';
import OnboardingFlow from '@/components/OnboardingFlow';
import HomeScreen from '@/components/HomeScreen';

const STORAGE_KEY = 'composer_prefs_v2';

export default function Home() {
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [userPrefs, setUserPrefs] = useState(null);
  const [justOnboarded, setJustOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setUserPrefs(parsed);
        setHasOnboarded(true);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  const handleOnboardingComplete = (prefs) => {
    setUserPrefs(prefs);
    setHasOnboarded(true);
    setJustOnboarded(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh]">
        <div className="w-8 h-8 border-3 border-[var(--mango)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasOnboarded) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  return (
    <HomeScreen
      userName={userPrefs?.name || 'friend'}
      userPrefs={userPrefs}
      justOnboarded={justOnboarded}
    />
  );
}
