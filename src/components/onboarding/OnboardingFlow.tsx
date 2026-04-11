"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/Button";
import { OnboardingMapBg } from "@/components/onboarding/OnboardingMapBg";
import { saveUserPrefs } from "@/lib/userPrefs";
import { UserPrefs, DrinksPref } from "@/types";
import { CONTEXT_OPTIONS, DRINK_OPTIONS, DIETARY_OPTIONS, FAVORITE_HOODS } from "@/config/onboarding";

interface OnboardingFlowProps {
  onComplete: (prefs: UserPrefs) => void;
}

const pillClass = (selected: boolean, extra = "px-4 py-2") =>
  `${extra} rounded-full text-sm font-sans font-medium transition-all ${
    selected
      ? "bg-burgundy text-cream"
      : "bg-white border border-border text-charcoal hover:border-burgundy/30"
  }`;

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0); // 0 = name, 1 = context, 2 = preferences, 3 = neighborhoods
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [drinks, setDrinks] = useState<DrinksPref | "">("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [favoriteHoods, setFavoriteHoods] = useState<string[]>([]);

  const totalSteps = 4;

  const handleNext = () => {
    if (step < totalSteps - 1) setStep(step + 1);
  };

  const handleFinish = () => {
    const prefs: UserPrefs = {
      name: name.trim() || "Friend",
      context,
      drinks: (drinks || undefined) as DrinksPref | undefined,
      dietary,
      favoriteHoods,
    };
    saveUserPrefs(prefs);
    onComplete(prefs);
  };

  const toggleHood = (id: string) => {
    setFavoriteHoods((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  };

  const toggleDietary = (id: string) => {
    if (id === "none") {
      setDietary((prev) => (prev.includes("none") ? [] : ["none"]));
    } else {
      setDietary((prev) => {
        const without = prev.filter((d) => d !== "none");
        return without.includes(id) ? without.filter((d) => d !== id) : [...without, id];
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream relative overflow-hidden">
      <OnboardingMapBg />
      {/* Progress dots */}
      <div className="relative z-10 flex items-center justify-center gap-2 pt-12 pb-6 px-6">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step
                ? "w-8 bg-burgundy"
                : i < step
                ? "w-1.5 bg-burgundy/60"
                : "w-1.5 bg-border"
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col px-6 max-w-lg w-full mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col"
          >
            {/* Step 0: Name */}
            {step === 0 && (
              <div className="flex-1 flex flex-col justify-center">
                <h1 className="font-serif text-3xl text-charcoal mb-2">
                  What should we call you?
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-8">
                  We&apos;ll use this to personalize your nights.
                </p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your first name"
                  className="w-full px-0 py-3 text-2xl font-serif bg-transparent border-b-2 border-border focus:border-burgundy focus:outline-none transition-colors text-charcoal"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) handleNext();
                  }}
                />
              </div>
            )}

            {/* Step 1: Context */}
            {step === 1 && (
              <div className="flex-1 flex flex-col justify-center">
                <h1 className="font-serif text-3xl text-charcoal mb-2">
                  What brings you here?
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-8">
                  Helps us tailor the recommendations.
                </p>
                <div className="flex flex-col gap-3">
                  {CONTEXT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setContext(opt.id)}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                        context === opt.id
                          ? "border-burgundy bg-burgundy/5"
                          : "border-border bg-white hover:border-burgundy/30"
                      }`}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <div>
                        <div className="font-sans font-semibold text-charcoal">{opt.label}</div>
                        <div className="font-sans text-sm text-warm-gray">{opt.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Preferences */}
            {step === 2 && (
              <div className="flex-1 flex flex-col pt-8">
                <h1 className="font-serif text-3xl text-charcoal mb-2">
                  A couple quick things
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-8">
                  So we don&apos;t recommend anything that&apos;s not your style.
                </p>

                <div className="mb-8">
                  <h3 className="font-sans font-semibold text-sm text-charcoal mb-3">
                    Do you drink?
                  </h3>
                  <div className="flex gap-3">
                    {DRINK_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setDrinks(opt.id)}
                        className={pillClass(drinks === opt.id, "flex-1 py-3")}
                      >
                        {opt.emoji} {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-sans font-semibold text-sm text-charcoal mb-3">
                    Any dietary restrictions?
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {DIETARY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => toggleDietary(opt.id)}
                        className={pillClass(dietary.includes(opt.id))}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Favorite neighborhoods */}
            {step === 3 && (
              <div className="flex-1 flex flex-col pt-8">
                <h1 className="font-serif text-3xl text-charcoal mb-2">
                  Favorite neighborhoods?
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-6">
                  Optional — pick a few you love or skip this.
                </p>

                <div className="flex flex-wrap gap-2">
                  {FAVORITE_HOODS.map((hood) => (
                    <button
                      key={hood.id}
                      onClick={() => toggleHood(hood.id)}
                      className={pillClass(favoriteHoods.includes(hood.id))}
                    >
                      {hood.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom action area */}
      <div className="relative z-10 px-6 pb-10 pt-4 max-w-lg w-full mx-auto">
        {step < 3 ? (
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={(step === 0 && !name.trim()) || (step === 1 && !context)}
            className="w-full"
          >
            Next →
          </Button>
        ) : (
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleFinish} className="flex-1">
              Skip
            </Button>
            <Button variant="primary" onClick={handleFinish} className="flex-1">
              Let&apos;s go
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
