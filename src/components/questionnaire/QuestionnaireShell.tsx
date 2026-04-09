"use client";

import { useReducer, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { questionSteps } from "@/config/options";
import { QuestionnaireAnswers } from "@/types";
import OptionCard from "@/components/ui/OptionCard";
import ProgressBar from "@/components/ui/ProgressBar";
import Button from "@/components/ui/Button";
import StepLoading from "./StepLoading";

type Status = "answering" | "loading";

interface State {
  currentStep: number;
  direction: 1 | -1;
  answers: Partial<QuestionnaireAnswers>;
  status: Status;
}

type Action =
  | { type: "SELECT"; key: string; value: string }
  | { type: "DESELECT"; key: string }
  | { type: "ADVANCE" }
  | { type: "BACK" }
  | { type: "SET_LOADING" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SELECT":
      return {
        ...state,
        answers: { ...state.answers, [action.key]: action.value },
        direction: 1,
        currentStep: state.currentStep + 1,
      };
    case "DESELECT": {
      const next = { ...state.answers };
      delete next[action.key as keyof QuestionnaireAnswers];
      return { ...state, answers: next };
    }
    case "ADVANCE":
      return {
        ...state,
        direction: 1,
        currentStep: state.currentStep + 1,
      };
    case "BACK":
      return {
        ...state,
        direction: -1,
        currentStep: Math.max(0, state.currentStep - 1),
      };
    case "SET_LOADING":
      return { ...state, status: "loading" };
    default:
      return state;
  }
}

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

// Neighborhood step uses pill multi-select
const NEIGHBORHOOD_STEP_INDEX = 1;

export default function QuestionnaireShell() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, {
    currentStep: 0,
    direction: 1,
    answers: {},
    status: "answering",
  });
  const [selectedHoods, setSelectedHoods] = useState<Set<string>>(new Set());

  const isNeighborhoodStep = state.currentStep === NEIGHBORHOOD_STEP_INDEX;

  const handleSelect = useCallback(
    (key: string, value: string) => {
      // Deselect if tapping the already-selected option
      const currentValue = state.answers[key as keyof QuestionnaireAnswers];
      if (currentValue === value) {
        dispatch({ type: "DESELECT", key });
        return;
      }

      if (state.currentStep === questionSteps.length - 1) {
        // Last step — submit
        const finalAnswers = {
          ...state.answers,
          [key]: value,
        } as QuestionnaireAnswers;
        dispatch({ type: "SELECT", key, value });
        dispatch({ type: "SET_LOADING" });

        sessionStorage.setItem(
          "composer_inputs",
          JSON.stringify(finalAnswers)
        );

        fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalAnswers),
        })
          .then((res) => res.json())
          .then((data) => {
            sessionStorage.setItem(
              "composer_itinerary",
              JSON.stringify(data)
            );
            router.push("/itinerary");
          })
          .catch(() => {
            router.push("/itinerary");
          });
      } else {
        // Auto-advance after brief delay so selected state is visible
        setTimeout(() => {
          dispatch({ type: "SELECT", key, value });
        }, 150);
      }
    },
    [state.currentStep, state.answers, router]
  );

  const handleHoodToggle = useCallback((value: string) => {
    setSelectedHoods((prev) => {
      const next = new Set(prev);
      if (value === "surprise-me") {
        // "Anywhere" toggles all on/off
        if (next.has("surprise-me")) {
          next.clear();
        } else {
          next.clear();
          next.add("surprise-me");
        }
        return next;
      }
      // Deselect "Anywhere" when picking specific neighborhoods
      next.delete("surprise-me");
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }, []);

  const handleHoodContinue = useCallback(() => {
    if (selectedHoods.size === 0) return;

    // Single neighborhood → pass directly; multiple or "Anywhere" → surprise-me
    let resolved: string;
    if (selectedHoods.has("surprise-me")) {
      resolved = "surprise-me";
    } else if (selectedHoods.size === 1) {
      resolved = Array.from(selectedHoods)[0];
    } else {
      resolved = "surprise-me";
    }

    dispatch({
      type: "SELECT",
      key: "neighborhood",
      value: resolved,
    });
  }, [selectedHoods]);

  if (state.status === "loading") {
    return <StepLoading />;
  }

  const step = questionSteps[state.currentStep];
  if (!step) return <StepLoading />;

  return (
    <div className="flex flex-col min-h-screen px-6 pt-5 pb-8">
      {/* Header */}
      <div className="w-full max-w-lg mx-auto flex items-center justify-between mb-4">
        <Link
          href="/"
          className="font-serif text-sm text-warm-gray hover:text-charcoal transition-colors"
        >
          Composer
        </Link>
        {state.currentStep > 0 ? (
          <button
            onClick={() => {
              if (isNeighborhoodStep) setSelectedHoods(new Set());
              dispatch({ type: "BACK" });
            }}
            className="font-sans text-sm text-warm-gray hover:text-charcoal transition-colors"
          >
            &larr; Back
          </button>
        ) : (
          <span />
        )}
      </div>

      {/* Progress */}
      <div className="w-full max-w-lg mx-auto mb-6">
        <ProgressBar
          currentStep={state.currentStep}
          totalSteps={questionSteps.length}
        />
      </div>

      {/* Content — vertically centered */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait" custom={state.direction}>
            <motion.div
              key={state.currentStep}
              custom={state.direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="w-full"
            >
              <h2 className="font-serif text-2xl sm:text-3xl text-charcoal mb-6 text-center">
                {step.question}
              </h2>

              {isNeighborhoodStep ? (
                /* Neighborhood pill grid */
                <div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {step.options.map((option, i) => {
                      const isSelected = selectedHoods.has(option.value);
                      return (
                        <motion.button
                          key={option.value}
                          onClick={() => handleHoodToggle(option.value)}
                          className={`rounded-full px-4 py-2 text-sm font-sans font-medium transition-all ${
                            isSelected
                              ? "bg-burgundy text-cream"
                              : "bg-white border border-border text-charcoal hover:border-burgundy/30"
                          }`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            duration: 0.2,
                            delay: i * 0.03,
                          }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {option.label}
                        </motion.button>
                      );
                    })}
                  </div>
                  <div className="flex justify-center mt-6">
                    <Button
                      variant="primary"
                      onClick={handleHoodContinue}
                      disabled={selectedHoods.size === 0}
                      className="px-10 py-3 text-sm"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              ) : (
                /* Standard card list */
                <div className="flex flex-col gap-2">
                  {step.options.map((option, i) => (
                    <OptionCard
                      key={option.value}
                      label={option.label}
                      description={option.description}
                      selected={
                        state.answers[step.id] === option.value
                      }
                      onClick={() =>
                        handleSelect(step.id, option.value)
                      }
                      index={i}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
