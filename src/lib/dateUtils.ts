// Shared date/time formatting helpers. Extracted because both
// `config/prompts.ts` (Gemini prompt builder) and
// `config/prompts.ts` (Gemini prompt) and share views both need
// the same day-description and 12-hour formatting logic. Keeping them
// in one place eliminates the drift risk.

/**
 * Human-friendly label for an ISO day relative to today.
 *   - today    → "tonight"
 *   - tomorrow → "tomorrow"
 *   - else     → weekday name, e.g. "Saturday"
 *
 * Uses `T12:00:00` noon anchor to dodge DST boundary shifts.
 */
export function describeDay(dayISO: string | undefined): string {
  if (!dayISO) return "tonight";
  const target = new Date(`${dayISO}T12:00:00`);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (target.toDateString() === today.toDateString()) return "tonight";
  if (target.toDateString() === tomorrow.toDateString()) return "tomorrow";
  return target.toLocaleDateString("en-US", { weekday: "long" });
}

/**
 * Format a 24-hour "HH:MM" string as "7pm" / "7:30pm".
 * Returns "" for undefined input (safe for optional fields).
 */
export function format12h(time24: string | undefined): string {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const display = h % 12 || 12;
  return `${display}${m > 0 ? `:${String(m).padStart(2, "0")}` : ""}${period}`;
}

/** Local-timezone today as "YYYY-MM-DD" — for comparing against an
 * itinerary's `day` field (also YYYY-MM-DD). Avoids `toISOString()`
 * which would give UTC and flip the day across midnight in NYC for
 * several hours. */
function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * True when `dayISO` is strictly before today's local date. Today and
 * future return false (no time-of-day check — same-day itineraries
 * stay "current" even after their endTime passes).
 *
 *   - "" / undefined / null / malformed → false (don't flag what we
 *     can't verify; safer to show a working reservation widget than to
 *     blank one out incorrectly)
 *   - "2025-12-31" called from 2026-01-01 local → true
 *   - "2026-05-22" called from 2026-05-22 local → false (today)
 *   - "2026-05-23" called from 2026-05-22 local → false (future)
 */
export function isPastDate(dayISO: string | undefined | null): boolean {
  if (!dayISO) return false;
  // Cheap shape check — anything that doesn't look like YYYY-MM-DD is
  // treated as unknown rather than risking a false-positive past flag.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayISO)) return false;
  return dayISO < todayLocalISO();
}

/**
 * Human-friendly absolute label for a past date, e.g. "Sunday, May 11".
 * Used in the past-itinerary banner. Always uses local time; noon-anchored
 * to dodge DST. Returns "" on missing/malformed input.
 */
export function formatPastDateLabel(dayISO: string | undefined | null): string {
  if (!dayISO || !/^\d{4}-\d{2}-\d{2}$/.test(dayISO)) return "";
  const [y, m, d] = dayISO.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
