// Shared date/time formatting helpers. Extracted because both
// `config/prompts.ts` (Gemini prompt builder) and
// `components/itinerary/TextMessageShare.tsx` (iMessage preview) need
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
