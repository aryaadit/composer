// Time block presets for the questionnaire's day + time step.
//
// Each block maps to a concrete startTime/endTime window. Downstream
// scoring logic (planStopMix, etc.) reasons in minutes via these
// resolved times — it never sees the block slug directly.

export const TIME_BLOCKS = [
  { id: "morning", label: "Morning", pillLabel: "Morning \u00b7 8a\u201312p", startHour: 8, endHour: 12 },
  { id: "afternoon", label: "Afternoon", pillLabel: "Afternoon \u00b7 12p\u20135p", startHour: 12, endHour: 17 },
  { id: "evening", label: "Evening", pillLabel: "Evening \u00b7 5p\u201310p", startHour: 17, endHour: 22 },
  { id: "late_night", label: "Late Night", pillLabel: "Late Night \u00b7 10p\u20132a", startHour: 22, endHour: 26 },
] as const;

export type TimeBlock = (typeof TIME_BLOCKS)[number]["id"];

export const DEFAULT_TIME_BLOCK: TimeBlock = "evening";

/**
 * Resolve a time block into start + end HH:MM strings.
 * Handles midnight wrap (late_night: 22:00 → 02:00).
 */
export function resolveTimeWindow(timeBlock: TimeBlock): {
  startTime: string;
  endTime: string;
} {
  const block = TIME_BLOCKS.find((b) => b.id === timeBlock);
  if (!block) {
    // Fallback to evening if somehow invalid
    return { startTime: "17:00", endTime: "22:00" };
  }
  const format = (h: number) =>
    `${String(h % 24).padStart(2, "0")}:00`;
  return {
    startTime: format(block.startHour),
    endTime: format(block.endHour),
  };
}
