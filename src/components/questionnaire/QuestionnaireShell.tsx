"use client";

import { useReducer, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { questionSteps } from "@/config/options";
import { QuestionnaireAnswers } from "@/types";
import OptionCard from "@/components/ui/OptionCard";
import ProgressBar from "@/components/ui/ProgressBar";
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

export default function QuestionnaireShell() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, {
    currentStep: 0,
    direction: 1,
    answers: {},
    status: "answering",
  });

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
        const finalAnswers = { ...state.answers, [key]: value } as QuestionnaireAnswers;
        dispatch({ type: "SELECT", key, value });
        dispatch({ type: "SET_LOADING" });

        // Store answers and navigate
        sessionStorage.setItem("composer_inputs", JSON.stringify(finalAnswers));

        // Call API
        fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalAnswers),
        })
          .then((res) => res.json())
          .then((data) => {
            sessionStorage.setItem("composer_itinerary", JSON.stringify(data));
            router.push("/itinerary");
          })
          .catch(() => {
            // On error, still navigate — page will handle error state
            router.push("/itinerary");
          });
      } else {
        // Auto-advance after brief delay
        setTimeout(() => {
          dispatch({ type: "SELECT", key, value });
        }, 200);
      }
    },
    [state.currentStep, state.answers, router]
  );

  if (state.status === "loading") {
    return <StepLoading />;
  }

  const step = questionSteps[state.currentStep];
  if (!step) return <StepLoading />;

  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-6 pb-8 min-h-screen">
      <div className="w-full max-w-md flex items-center justify-between mb-8">
        <Link
          href="/"
          className="font-serif text-sm text-warm-gray hover:text-charcoal transition-colors"
        >
          Composer
        </Link>
        {state.currentStep > 0 ? (
          <button
            onClick={() => dispatch({ type: "BACK" })}
            className="font-sans text-sm text-warm-gray hover:text-charcoal transition-colors"
          >
            &larr; Back
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="w-full max-w-md mb-8">
        <ProgressBar
          currentStep={state.currentStep}
          totalSteps={questionSteps.length}
        />
      </div>

      <div className="w-full max-w-md flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait" custom={state.direction}>
          <motion.div
            key={state.currentStep}
            custom={state.direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="w-full"
          >
            <h2 className="font-serif text-3xl text-charcoal mb-8 text-center">
              {step.question}
            </h2>

            <div className="flex flex-col gap-3">
              {step.options.map((option, i) => (
                <OptionCard
                  key={option.value}
                  label={option.label}
                  description={option.description}
                  selected={state.answers[step.id] === option.value}
                  onClick={() => handleSelect(step.id, option.value)}
                  index={i}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
