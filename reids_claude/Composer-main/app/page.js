'use client';

import { useState, useEffect } from 'react';
import OnboardingFlow from '@/components/OnboardingFlow';
import HomeScreen from '@/components/HomeScreen';

export default function Home() {
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [userName, setUserName] = useState('');
  const [userContext, setUserContext] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user has completed onboarding (stored in state for now)
    // In production, this comes from Firebase auth + Firestore
    const savedName = typeof window !== 'undefined'
      ? sessionStorage.getItem('composer_name')
      : null;
    if (savedName) {
      setUserName(savedName);
      setHasOnboarded(true);
    }
    setLoading(false);
  }, []);

  const handleOnboardingComplete = (data) => {
    setUserName(data.name);
    setUserContext(data.context);
    setHasOnboarded(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('composer_name', data.name);
      sessionStorage.setItem('composer_context', data.context);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-3 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasOnboarded) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  return <HomeScreen userName={userName} userContext={userContext} />;
}
