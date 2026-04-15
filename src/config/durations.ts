// Duration presets for the combined day+duration questionnaire step.
//
// The product asks for three pre-baked options instead of a free-form
// start/end time picker. The preset id is the canonical shape the client
// sends; the API route resolves it into concrete startTime/endTime
// before calling into `planStopMix` so downstream logic (which reasons
// in minutes) stays untouched.
//
// Adding a new preset = adding one entry here. The union type and the
// resolver both update automatically.

export const DURATIONS = [
  { id: "2h", label: "Keep it short", minutes: 120 },
  { id: "3.5h", label: "Enjoy the moment", minutes: 210 },
  { id: "5h", label: "Open-ended", minutes: 300 },
] as const;

export type DurationSlug = (typeof DURATIONS)[number]["id"];

export const DEFAULT_DURATION: DurationSlug = "3.5h";

// Default start hour. 7pm is the product's canonical "evening starts"
// anchor — before we collapsed the time picker the default end was
// "start + 3h", which is what `Enjoy the moment` preserves.
const DEFAULT_START_HOUR = 19;

const DURATION_MINUTES: Record<DurationSlug, number> = Object.fromEntries(
  DURATIONS.map((d) => [d.id, d.minutes])
) as Record<DurationSlug, number>;

/**
 * Resolve a duration preset into a fixed start + end `HH:MM` pair
 * anchored at the default evening start. Wraps past midnight when the
 * window pushes past 24:00 — e.g. 5h from 19:00 → end "00:00".
 */
export function resolveTimeWindow(duration: DurationSlug): {
  startTime: string;
  endTime: string;
} {
  const startMins = DEFAULT_START_HOUR * 60;
  const endMinsRaw = startMins + DURATION_MINUTES[duration];
  const endH = Math.floor(endMinsRaw / 60) % 24;
  const endM = endMinsRaw % 60;
  const format = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return {
    startTime: format(DEFAULT_START_HOUR, 0),
    endTime: format(endH, endM),
  };
}
