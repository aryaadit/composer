"use client";

// Combined day + start-time step. Outputs { day, startTime } via
// onContinue. The API route derives endTime = startTime + 5h from
// startTime; this component never touches the categorical TimeBlock
// type — it's been removed from the user-input layer (Phase 1).

import { useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { pillClass } from "@/lib/styles";
import {
  COMPOSE_START_TIMES,
  formatStartTimeLabel,
  type ComposeStartTime,
} from "@/lib/itinerary/time-blocks";
import { track, EVENTS } from "@/lib/analytics";

interface UpcomingDay {
  date: string;
  label: string;
}

function buildUpcomingDays(): UpcomingDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = toLocalISODate(d);
    if (i === 0) return { date: iso, label: "Today" };
    if (i === 1) return { date: iso, label: "Tomorrow" };
    const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
    return { date: iso, label: `${weekday} ${d.getDate()}` };
  });
}

function formatCustomDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${weekday} ${month} ${d.getDate()}`;
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Pointer-modality detection ─────────────────────────────────
//
// Branches the date affordance: coarse pointer (touch / iPad) gets the
// native OS picker; fine pointer (desktop, including touch laptops
// with a primary fine pointer) gets the themed custom calendar.
//
// useSyncExternalStore is the hydration-safe path here. The server
// snapshot is null, and the client's first render after hydration also
// returns null — both renders agree on the custom-calendar branch so
// there is zero hydration mismatch. After hydration completes, the
// store re-reads and the component re-renders with the real boolean.
// One brief visual replacement on mobile during that handoff is the
// price; in exchange, desktop never sees a native input.
//
// Hard rules enforced here:
//   - No userAgent sniff anywhere.
//   - When matchMedia is unavailable, snapshot returns null, which
//     defaults to the custom calendar — never the native input.

function subscribeCoarsePointer(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const mql = window.matchMedia("(pointer: coarse)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getCoarsePointerSnapshot(): boolean | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia("(pointer: coarse)").matches;
}

function getCoarsePointerServerSnapshot(): boolean | null {
  return null;
}

function useIsCoarsePointer(): boolean | null {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    getCoarsePointerSnapshot,
    getCoarsePointerServerSnapshot,
  );
}

interface WhenStepProps {
  initialDay?: string;
  initialStartTime?: ComposeStartTime;
  onContinue: (day: string, startTime: ComposeStartTime) => void;
}

export function WhenStep({
  initialDay,
  initialStartTime,
  onContinue,
}: WhenStepProps) {
  const days = useMemo(() => buildUpcomingDays(), []);

  const [day, setDay] = useState<string>(() => initialDay ?? days[0].date);
  // No default — user must tap a pill. Build my plan stays disabled
  // until they do.
  const [startTime, setStartTime] = useState<ComposeStartTime | null>(
    initialStartTime ?? null
  );

  const builtInDates = useMemo(() => new Set(days.map((d) => d.date)), [days]);
  const customSelected = !builtInDates.has(day);
  const todayISO = days[0].date;
  const isCoarse = useIsCoarsePointer();

  // Native-input change handler — same channel as a day-pill tap. The
  // empty-value guard catches the rare case where a user clears the
  // input via assistive tech without picking anything.
  const handleDatePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value) return;
    setDay(value);
  };

  const handleStartTimePick = (next: ComposeStartTime) => {
    track(EVENTS.COMPOSE_START_TIME_SELECTED, {
      selected_time: next,
      previous_value: startTime,
    });
    setStartTime(next);
  };

  return (
    <div>
      {/* Audit item 20: the WHEN eyebrow was a duplicate of the
          step's own "When?" heading rendered by QuestionnaireShell.
          One label per question. The day-pill row stands on its own. */}
      <div className="flex flex-wrap justify-center gap-2 mb-10">
        {days.map((d, i) => {
          const isSelected = day === d.date;
          return (
            <motion.button
              key={d.date}
              onClick={() => setDay(d.date)}
              className={pillClass(isSelected)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {d.label}
            </motion.button>
          );
        })}

        {/* Custom-date affordance — branched by pointer modality.
            Coarse pointer (touch / iPad): the chip overlays a real
              native date input at opacity-0. Tap focuses the input,
              the OS opens its picker. No JS intervention.
            Fine pointer (desktop, touch laptops): the themed custom
              calendar. No native input mounted, period.
            isCoarse === null (SSR + first client paint + no
              matchMedia) defaults to the custom calendar so the
              native input never renders on desktop, even briefly. */}
        <motion.span
          key="custom-date"
          className="inline-block"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: days.length * 0.03 }}
          whileTap={{ scale: 0.97 }}
        >
          {isCoarse === true ? (
            <label
              htmlFor="custom-date-input"
              className="relative inline-block cursor-pointer"
            >
              <span className={pillClass(customSelected)} aria-hidden>
                {customSelected ? formatCustomDate(day) : "+ Pick a date"}
              </span>
              <input
                id="custom-date-input"
                type="date"
                min={todayISO}
                value={customSelected ? day : ""}
                onChange={handleDatePicked}
                aria-label="Pick a date"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none bg-transparent"
              />
            </label>
          ) : (
            <DatePicker
              value={customSelected ? day : null}
              onChange={setDay}
              min={todayISO}
              triggerClassName={pillClass(customSelected)}
              triggerLabel={
                customSelected ? formatCustomDate(day) : "+ Pick a date"
              }
              triggerAriaLabel="Pick a date"
            />
          )}
        </motion.span>
      </div>

      {/* ── Start time ─────────────────────────────────────── */}
      <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3 text-center">
        Start time
      </h3>
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {COMPOSE_START_TIMES.map((t, i) => {
          const isSelected = startTime === t;
          return (
            <motion.button
              key={t}
              onClick={() => handleStartTimePick(t)}
              className={pillClass(isSelected)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 + 0.1 }}
              whileTap={{ scale: 0.97 }}
            >
              {formatStartTimeLabel(t)}
            </motion.button>
          );
        })}
      </div>

      <div className="mt-6">
        <Button
          variant="primary"
          onClick={() => startTime && onContinue(day, startTime)}
          disabled={!startTime}
          className="w-full"
        >
          Build my plan
        </Button>
      </div>
    </div>
  );
}
