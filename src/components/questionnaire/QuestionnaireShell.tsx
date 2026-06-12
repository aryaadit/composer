"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { questionSteps } from "@/config/options";
import type {
  QuestionnaireAnswers,
  GenerateRequestBody,
  Neighborhood,
} from "@/types";
import type { ComposeStartTime } from "@/lib/itinerary/time-blocks";
import {
  expandNeighborhoodGroup,
  deriveGroupIds,
  NEIGHBORHOOD_GROUPS,
} from "@/config/neighborhoods";
import {
  COMPOSE_TIERS,
  TIER_UNAVAILABLE_COPY,
  isTierSelectableForGroups,
} from "@/config/group-visibility";
import {
  questionnaireReducer,
  initialState,
  slideVariants,
} from "@/lib/questionnaireReducer";
import { STORAGE_KEYS } from "@/config/storage";
import { getRecentVenueIds } from "@/lib/exclusions";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  EVENTS,
  buildComposeContext,
  getAnalyticsHeaders,
  track,
} from "@/lib/analytics";
import {
  checkAndEmitIfStale,
  clearComposeAbandonedFlag,
  clearComposeEntryToken,
  markComposeEntry,
  setComposeAbandonedFlag,
  updateLastStepCompleted,
} from "@/lib/analytics/compose-abandoned";
import { Header } from "@/components/Header";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { StepLoading } from "./StepLoading";
import { NeighborhoodStep } from "./NeighborhoodStep";
import { StandardStep } from "./StandardStep";
import { WhenStep } from "./WhenStep";

// Map QuestionStep.id → canonical analytics label (per taxonomy spec).
const STEP_ANALYTICS_LABEL: Record<string, string> = {
  occasion: "occasion",
  neighborhoods: "neighborhood",
  budget: "budget",
  vibe: "focus",
  day: "when",
};

function deriveEntrySource(): string {
  if (typeof window === "undefined") return "direct";
  try {
    const referrer = document.referrer;
    if (!referrer) return "direct";
    const url = new URL(referrer);
    if (url.origin !== window.location.origin) return "direct";
    if (url.pathname.startsWith("/itinerary/share")) return "share_link";
    if (url.pathname.startsWith("/itinerary/saved")) return "saved_itinerary";
    if (url.pathname === "/" || url.pathname === "") return "home_cta";
    return "internal";
  } catch {
    return "direct";
  }
}

function dayOfWeekFromISO(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
}

export function QuestionnaireShell() {
  const router = useRouter();
  const [state, dispatch] = useReducer(questionnaireReducer, initialState);

  // Occasion no longer auto-prefills. The CONTEXT_TO_OCCASION map was
  // removed 2026-05-20 when the onboarding context step was dropped —
  // users now pick the occasion fresh each time.
  const { user } = useAuth();

  // Step timing — wall-clock at the start of the currently-displayed
  // step. Reset on every advance so compose_step_completed reports
  // time_on_step_ms accurately.
  const stepStartMsRef = useRef<number>(0);
  useEffect(() => {
    // First mount per /compose entry: fire compose_started + initialize
    // timer for step 1. `markComposeEntry` is the dedupe gate — it
    // returns false on remounts within the same entry (React StrictMode
    // double-mount in dev, or any in-place rerender), so the
    // compose_started → setComposeAbandonedFlag → stepStartMsRef branch
    // only runs once. A genuine re-entry after submit / abandon-drain
    // finds no token and returns true.
    //
    // Strict order is drain → set → fire so the abandonment flag is
    // already in place by the time compose_started lands in PostHog,
    // and so a stale flag (from a same-tab "abandon → restart" sequence)
    // is reported via compose_abandoned BEFORE the new flow's events.
    // AuthProvider also runs checkAndEmitIfStale at app boot; the
    // FLAG_MIN_AGE_MS guard inside the helper stops it from eating
    // the flag we just set on the same commit (children-first effect
    // ordering means AuthProvider's check fires microseconds later).
    checkAndEmitIfStale(track);
    if (!markComposeEntry()) return;
    setComposeAbandonedFlag();
    stepStartMsRef.current = performance.now();
    track(EVENTS.COMPOSE_STARTED, { entry_source: deriveEntrySource() });
  }, []);

  const trackStepCompleted = useCallback(
    (stepId: string, stepValue: string | string[] | null) => {
      const now = performance.now();
      const label = STEP_ANALYTICS_LABEL[stepId] ?? stepId;
      const index =
        questionSteps.findIndex((s) => s.id === stepId) + 1; // 1-indexed
      track(EVENTS.COMPOSE_STEP_COMPLETED, {
        ...buildComposeContext(state.answers),
        step: label,
        step_value: stepValue,
        step_index: index,
        time_on_step_ms: Math.round(now - stepStartMsRef.current),
      });
      updateLastStepCompleted(label);
      stepStartMsRef.current = now;
    },
    [state.answers]
  );

  const submitAnswers = useCallback(
    async (body: GenerateRequestBody) => {
      dispatch({ type: "SET_LOADING" });
      sessionStorage.setItem(
        STORAGE_KEYS.session.questionnaireInputs,
        JSON.stringify(body)
      );

      const excludeVenueIds = user?.id
        ? await getRecentVenueIds(user.id)
        : [];

      track(EVENTS.COMPOSE_SUBMITTED, {
        // Explicit "questionnaire" mode (matches the builder's default,
        // but call sites that care about the funnel split shouldn't have
        // to look at builder internals to know what mode lands).
        ...buildComposeContext({ ...body, mode: "questionnaire" }),
        day_of_week: dayOfWeekFromISO(body.day),
      });

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAnalyticsHeaders() },
          body: JSON.stringify({ ...body, excludeVenueIds }),
        });
        if (!res.ok) throw new Error("Generation failed");
        const data = await res.json();
        // Compose flow succeeded — clear the abandonment flag AND the
        // entry token before navigating so we don't fire
        // compose_abandoned on next boot, and so the next /compose
        // navigation counts as a fresh entry (fires compose_started).
        // Done on the client because itinerary_composed is server-side.
        clearComposeAbandonedFlag();
        clearComposeEntryToken();
        sessionStorage.setItem(
          STORAGE_KEYS.session.currentItinerary,
          JSON.stringify(data)
        );
        router.push("/itinerary");
      } catch {
        router.push("/itinerary");
      }
    },
    [router, user?.id]
  );

  // Card selection only updates state — no auto-advance. Every step
  // (occasion, budget, vibe) has a manual "Next →" CTA rendered in the
  // shell below. Toggling an already-selected card deselects it.
  const handleCardSelect = useCallback(
    (key: keyof QuestionnaireAnswers, value: string) => {
      const currentValue = state.answers[key];
      if (currentValue === value) {
        dispatch({ type: "DESELECT", field: key });
        return;
      }
      dispatch({ type: "SET_FIELD", field: key, value });
    },
    [state.answers]
  );

  // Generic "Next →" for any cards-kind step. Advances by re-
  // dispatching the already-stored value with `advance: true`.
  const handleCardContinue = useCallback(() => {
    const currentStep = questionSteps[state.currentStep];
    if (!currentStep) return;
    const value = state.answers[currentStep.id];
    if (!value) return;
    // Card steps (occasion / budget / vibe) hold a single slug; coerce
    // to the typed step_value union the schema declares.
    const normalized =
      Array.isArray(value)
        ? (value as string[])
        : typeof value === "string"
          ? value
          : null;
    trackStepCompleted(currentStep.id, normalized);
    dispatch({
      type: "SET_FIELD",
      field: currentStep.id,
      value,
      advance: true,
    });
  }, [state.currentStep, state.answers, trackStepCompleted]);

  const handleNeighborhoodContinue = useCallback(
    (groupIds: string[]) => {
      // The picker hands us NEIGHBORHOOD_GROUPS ids; expand to storage slugs
      // (deduped) before committing to state. Downstream scoring only sees
      // slugs, so this expansion is the one and only translation point.
      const expanded = Array.from(
        new Set(groupIds.flatMap((id) => expandNeighborhoodGroup(id)))
      ) as Neighborhood[];
      trackStepCompleted("neighborhoods", groupIds);
      dispatch({
        type: "SET_FIELD",
        field: "neighborhoods",
        value: expanded,
        advance: true,
      });
    },
    [trackStepCompleted]
  );

  const handleWhenContinue = useCallback(
    (day: string, startTime: ComposeStartTime) => {
      // Combined step — day and startTime land together, then we submit
      // immediately. Reducer gets the update for consistency / back-nav,
      // but the fetch body is built from local values to avoid racing
      // the reducer's next render.
      trackStepCompleted("day", `${day}|${startTime}`);
      dispatch({ type: "SET_FIELDS", values: { day, startTime } });
      submitAnswers({
        ...(state.answers as Omit<GenerateRequestBody, "day" | "startTime">),
        day,
        startTime,
      });
    },
    [state.answers, submitAnswers, trackStepCompleted]
  );

  // Budget step: disable any tier that no selected neighborhood group
  // can serve under the native-composability bar. Computed from the
  // (already expanded) storage slugs in state.answers.neighborhoods →
  // reverse-derive group IDs → look up NeighborhoodGroup objects.
  // Recomputed only when the neighborhoods answer changes. When the
  // user hasn't picked any neighborhoods yet (shouldn't happen on the
  // budget step but defensive), every tier stays enabled.
  //
  // Placement: must run BEFORE every conditional early-return below so
  // the hook order is stable (react-hooks/rules-of-hooks).
  const disabledBudgetTiers = useMemo<ReadonlySet<string>>(() => {
    const slugs = state.answers.neighborhoods ?? [];
    if (slugs.length === 0) return new Set<string>();
    const groupIds = new Set(deriveGroupIds(slugs));
    const groups = NEIGHBORHOOD_GROUPS.filter((g) => groupIds.has(g.id));
    if (groups.length === 0) return new Set<string>();
    const disabled = new Set<string>();
    for (const tier of COMPOSE_TIERS) {
      if (!isTierSelectableForGroups(groups, tier)) disabled.add(tier);
    }
    return disabled;
  }, [state.answers.neighborhoods]);

  if (state.status === "loading") {
    return (
      <StepLoading
        occasion={state.answers.occasion}
        neighborhoods={state.answers.neighborhoods}
        vibe={state.answers.vibe}
      />
    );
  }

  const step = questionSteps[state.currentStep];
  if (!step) return <StepLoading />;

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        rightSlot={
          state.currentStep > 0 && (
            <button
              onClick={() => dispatch({ type: "BACK" })}
              className="font-sans text-sm text-warm-gray hover:text-charcoal transition-colors"
            >
              &larr; Back
            </button>
          )
        }
      />
      <div className="px-6 max-w-lg w-full mx-auto mt-1">
        <ProgressBar
          currentStep={state.currentStep}
          totalSteps={questionSteps.length}
        />
      </div>

      {/* Audit item 10: top-align the question block consistently
          across all five steps so the question heading sits a fixed
          distance below the progress bar and the eye doesn't have to
          chase a vertically-centered target as content grows/shrinks
          from step to step. Was: justify-center items-center. */}
      <div className="flex-1 flex flex-col items-center px-6 pt-8 pb-8">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait" custom={state.direction}>
            <motion.div
              key={state.currentStep}
              custom={state.direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="w-full"
            >
              <h2 className="font-sans text-2xl font-medium text-charcoal mb-2 text-center leading-tight">
                {step.question}
              </h2>
              {step.subtitle && (
                <p className="font-sans text-sm text-warm-gray mb-6 text-center">
                  {step.subtitle}
                </p>
              )}
              {!step.subtitle && <div className="mb-4" />}

              {step.kind === "pills" && (
                <NeighborhoodStep
                  key={`hoods-${state.currentStep}`}
                  // State stores expanded storage slugs; reverse-derive which
                  // picker groups to pre-select on back-nav.
                  initialSelected={deriveGroupIds(state.answers.neighborhoods ?? [])}
                  onContinue={handleNeighborhoodContinue}
                />
              )}

              {step.kind === "cards" && (
                <StandardStep
                  options={step.options}
                  selectedValue={
                    state.answers[step.id] as string | undefined
                  }
                  onSelect={(value) => handleCardSelect(step.id, value)}
                  disabledValues={
                    step.id === "budget" ? disabledBudgetTiers : undefined
                  }
                  disabledNote={
                    step.id === "budget" ? TIER_UNAVAILABLE_COPY : undefined
                  }
                />
              )}

              {/* Every cards step gets a manual Next CTA. */}
              {step.kind === "cards" && (
                <div className="mt-8">
                  <Button
                    variant="primary"
                    onClick={handleCardContinue}
                    disabled={!state.answers[step.id]}
                    className="w-full"
                  >
                    Next →
                  </Button>
                </div>
              )}

              {step.kind === "when" && (
                <WhenStep
                  initialDay={state.answers.day}
                  initialStartTime={state.answers.startTime as ComposeStartTime | undefined}
                  onContinue={handleWhenContinue}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
