"use client";

// Onboarding: splash → profile collection. The user is already
// authenticated (session exists, no profile row yet). Collects
// name, context, preferences, neighborhoods, then upserts the
// profile and routes home.
//
// Steps: 0 splash, 1 name, 2 context (multi), 3 preferences,
//        4 neighborhoods → save → home

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { upsertProfile } from "@/lib/auth";
import { useAuth } from "@/components/providers/AuthProvider";
import { UserPrefs, DrinksPref } from "@/types";
import { pillClass } from "@/lib/styles";
import {
  CONTEXT_OPTIONS,
  DRINK_OPTIONS,
  DIETARY_OPTIONS,
} from "@/config/onboarding";
import { NeighborhoodPicker } from "@/components/shared/NeighborhoodPicker";
import { Header } from "@/components/Header";
import { ProgressBar } from "@/components/ui/ProgressBar";

const TOTAL_STEPS = 5; // 0–4

export function OnboardingFlow() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const [step, setStep] = useState(0);

  // Profile state
  const [name, setName] = useState("");
  const [contexts, setContexts] = useState<string[]>([]);
  const [drinks, setDrinks] = useState<DrinksPref | "">("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [favoriteHoods, setFavoriteHoods] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const handleNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const toggleContext = (id: string) => {
    setContexts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleDietary = (id: string) => {
    if (id === "none") {
      setDietary((prev) => (prev.includes("none") ? [] : ["none"]));
    } else {
      setDietary((prev) => {
        const without = prev.filter((d) => d !== "none");
        return without.includes(id)
          ? without.filter((d) => d !== id)
          : [...without, id];
      });
    }
  };

  const handleFinish = async () => {
    if (!user || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    const prefs: UserPrefs = {
      name: name.trim() || "Friend",
      context: contexts[0] ?? "",
      drinks: (drinks || undefined) as DrinksPref | undefined,
      dietary,
      favoriteHoods,
    };

    const saved = await upsertProfile(user.id, prefs);
    if (saved) {
      await refreshProfile();
      router.replace("/");
    } else {
      setSaving(false);
      savingRef.current = false;
    }
  };

  // Progress dots: show for steps 1–4 (profile collection). Hidden on splash (0).
  const showProgress = step >= 1 && step <= 4;
  const progressSteps = 4; // steps 1–4

  if (saving) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-sans text-sm text-muted">
            Setting up your account...
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      {showProgress && (
        <div className="px-6">
          <div className="w-full max-w-lg mx-auto relative">
            <Header />
            <button
              type="button"
              onClick={handleBack}
              className="absolute right-0 top-1/2 -translate-y-1/2 font-sans text-sm text-warm-gray hover:text-charcoal transition-colors"
            >
              &larr; Back
            </button>
          </div>
          <div className="w-full max-w-lg mx-auto mt-1">
            <ProgressBar
              currentStep={step - 1}
              totalSteps={progressSteps}
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col px-6 max-w-lg w-full mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col"
          >
            {/* ── Step 0: Splash ──────────────────────────── */}
            {step === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <h1 className="font-serif text-6xl md:text-7xl text-charcoal mb-8">
                  Composer
                </h1>
                <div
                  className="flex items-center justify-center gap-3 font-serif text-3xl md:text-4xl text-charcoal leading-tight mb-12"
                >
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
                <p className="font-sans text-base text-warm-gray max-w-xs mb-2">
                  A time and a place. Plans in NYC made by people who live
                  here.
                </p>
              </div>
            )}

            {/* ── Step 1: Name ────────────────────────────── */}
            {step === 1 && (
              <div className="flex-1 flex flex-col justify-center">
                <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
                  What should we call you?
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-8">
                  Shows up on every plan we make you.
                </p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your first name"
                  className="w-full px-0 py-3 text-xl font-sans bg-transparent border-b border-border focus:border-charcoal focus:outline-none transition-colors text-charcoal placeholder:text-muted"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) handleNext();
                  }}
                />
              </div>
            )}

            {/* ── Step 2: Context (multi-select) ──────────── */}
            {step === 2 && (
              <div className="flex-1 flex flex-col justify-center">
                <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
                  What brings you here?
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-8">
                  Select all that apply.
                </p>
                <div className="flex flex-col gap-2">
                  {CONTEXT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => toggleContext(opt.id)}
                      className={`px-4 py-3 rounded-md border text-left transition-all ${
                        contexts.includes(opt.id)
                          ? "border-border bg-burgundy-tint shadow-[inset_3px_0_0_var(--color-burgundy)]"
                          : "border-border bg-cream hover:border-charcoal/30"
                      }`}
                    >
                      <div className="font-sans text-sm font-medium text-charcoal">
                        {opt.label}
                      </div>
                      <div className="font-sans text-xs text-muted mt-0.5">
                        {opt.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 3: Preferences ─────────────────────── */}
            {step === 3 && (
              <div className="flex-1 flex flex-col pt-8">
                <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
                  A couple quick things
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-8">
                  So we don&apos;t recommend anything that&apos;s not your
                  style.
                </p>
                <div className="mb-8">
                  <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3">
                    Do you drink?
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {DRINK_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setDrinks(opt.id)}
                        className={pillClass(drinks === opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3">
                    Any dietary restrictions?
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {DIETARY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => toggleDietary(opt.id)}
                        className={pillClass(
                          dietary.includes(opt.id),
                          opt.id === "none" ? "charcoal" : "burgundy"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 4: Neighborhoods ───────────────────── */}
            {step === 4 && (
              <div className="flex-1 flex flex-col pt-8">
                <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
                  Favorite neighborhoods?
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-6">
                  Optional — helps us make a better plan for you.
                </p>
                <NeighborhoodPicker
                  selected={favoriteHoods}
                  onChange={setFavoriteHoods}
                  groupByBorough={false}
                  animated={false}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom action area ──────────────────────────── */}
      <div className="relative z-10 px-6 pb-10 pt-4 max-w-lg w-full mx-auto">
        {step === 0 && (
          <Button variant="primary" onClick={handleNext} className="w-full">
            Start Composing
          </Button>
        )}
        {step >= 1 && step <= 3 && (
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={
              (step === 1 && !name.trim()) ||
              (step === 2 && contexts.length === 0)
            }
            className="w-full"
          >
            Next →
          </Button>
        )}
        {step === 4 && (
          <Button
            variant="primary"
            onClick={() => void handleFinish()}
            className="w-full"
          >
            Let&apos;s go →
          </Button>
        )}
      </div>
    </div>
  );
}
