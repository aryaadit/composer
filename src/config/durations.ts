// Time block presets for the combined day + time questionnaire step.
//
// Each block maps to a concrete startTime/endTime window. Downstream
// scoring logic (planStopMix, etc.) reasons in minutes via these
// resolved times — it never sees the block slug directly.

export const TIME_BLOCKS = [
  { id: "morning", label: "Morning", sublabel: "8am\u201312pm", icon: "\uD83C\uDF05", startHour: 8, endHour: 12 },
  { id: "afternoon", label: "Afternoon", sublabel: "12pm\u20135pm", icon: "\u2600\uFE0F", startHour: 12, endHour: 17 },
  { id: "evening", label: "Evening", sublabel: "5pm\u201310pm", icon: "\uD83C\uDF06", startHour: 17, endHour: 22 },
  { id: "late_night", label: "Late Night", sublabel: "10pm\u20132am", icon: "\uD83C\uDF19", startHour: 22, endHour: 26 },
] as const;

export type TimeBlock = (typeof TIME_BLOCKS)[number]["id"];

export const DEFAULT_TIME_BLOCK: TimeBlock = "evening";

// ─── Legacy compat ────────────────────────────────────────────
// Old saved itineraries store DurationSlug ("2h", "3.5h", "5h").
// Keep the old type + resolver so saved/[id]/page.tsx can still
// render them. New itineraries use timeBlock exclusively.

export type DurationSlug = "2h" | "3.5h" | "5h";
export type Duration = DurationSlug;
export const DEFAULT_DURATION: DurationSlug = "3.5h";

/**
 * Resolve a time block into start + end HH:MM strings.
 * Handles midnight wrap (late_night: 22:00 → 02:00).
 */
export function resolveTimeWindow(
  blockOrDuration: TimeBlock | DurationSlug
): {
  startTime: string;
  endTime: string;
} {
  // Check if it's a time block first
  const block = TIME_BLOCKS.find((b) => b.id === blockOrDuration);
  if (block) {
    const format = (h: number) =>
      `${String(h % 24).padStart(2, "0")}:00`;
    return {
      startTime: format(block.startHour),
      endTime: format(block.endHour),
    };
  }

  // Legacy duration resolver (for old saved itineraries)
  const LEGACY_MINUTES: Record<string, number> = {
    "2h": 120,
    "3.5h": 210,
    "5h": 300,
  };
  const minutes = LEGACY_MINUTES[blockOrDuration] ?? 210;
  const startMins = 19 * 60; // 7pm default for legacy
  const endMinsRaw = startMins + minutes;
  const endH = Math.floor(endMinsRaw / 60) % 24;
  const endM = endMinsRaw % 60;
  const format = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return {
    startTime: format(19, 0),
    endTime: format(endH, endM),
  };
}
