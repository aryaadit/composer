"use client";

// Root gate. Five states:
//
//   - loading              → spinner
//   - no session           → SplashScreen (Get Started / Log In)
//   - no session + auth    → AuthScreen (phone OTP or email)
//   - session, no profile  → redirect to /onboarding
//   - session + profile    → HomeScreen

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { HomeScreen } from "@/components/home/HomeScreen";
import { useAuth } from "@/components/providers/AuthProvider";

export default function Home() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (session && !profile) {
      router.replace("/onboarding");
    }
  }, [isLoading, session, profile, router]);

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (session && profile) {
    return <HomeScreen userName={profile.name} />;
  }

  if (session && !profile) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  // Unauthenticated — show splash or auth
  if (showAuth) {
    return <AuthScreen />;
  }

  return <SplashScreen onGetStarted={() => setShowAuth(true)} onLogIn={() => setShowAuth(true)} />;
}

function SplashScreen({
  onGetStarted,
  onLogIn,
}: {
  onGetStarted: () => void;
  onLogIn: () => void;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-cream px-6">
      <div className="w-full max-w-lg text-center">
        <h1 className="font-serif text-6xl md:text-7xl text-charcoal mb-8">
          Composer
        </h1>
        <div className="flex items-center justify-center gap-3 font-serif text-3xl md:text-4xl text-charcoal leading-tight mb-8">
          <span>For</span>
          <span
            className="inline-block h-[1.6em] w-[5.5em] text-left"
            style={{ clipPath: "inset(0 -100vw 0 0)" }}
          >
            <motion.span
              className="block text-burgundy"
              animate={{
                y: [
                  "0%", "-7.143%", "-14.286%", "-21.429%",
                  "-28.571%", "-35.714%", "-42.857%", "-50%",
                  "-57.143%", "-64.286%", "-71.429%", "-78.571%",
                  "-85.714%", "-92.857%",
                ],
              }}
              transition={{
                duration: 26,
                repeat: Infinity,
                repeatType: "loop",
                ease: "easeInOut",
                times: [
                  0, 0.077, 0.154, 0.231, 0.308, 0.385, 0.462,
                  0.538, 0.615, 0.692, 0.769, 0.846, 0.923, 1,
                ],
              }}
            >
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">a first date</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">solo Sundays</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">group chats</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">date night</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">the girlies</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">the parents</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">family fun</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">NYC weekends</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">random Tuesdays</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">your anniversary</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">the boys</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">a rainy day</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">the birthday</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">a first date</span>
            </motion.span>
          </span>
        </div>
        <p className="font-sans text-base text-warm-gray max-w-xs mx-auto mb-12">
          A time and a place. Plans in NYC made by people who live here.
        </p>

        <div className="space-y-3">
          <Button variant="primary" onClick={onGetStarted} className="w-full">
            Get Started
          </Button>
          <button
            type="button"
            onClick={onLogIn}
            className="w-full py-3 font-sans text-sm text-muted hover:text-charcoal transition-colors text-center"
          >
            Already have an account? Log in
          </button>
        </div>
      </div>
    </main>
  );
}
