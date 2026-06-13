// src/lib/format/hours.ts
//
// Presentation-only formatting for the venue `hours` column. As of the
// JSON migration, `hours` stores an open/close schedule generated from the
// sheet's open_*/close_* grid:
//
//   { "mon": [[11.0, 23.0]], "tue": [[8.0, 10.5], [12.0, 15.0], [17.0, 22.0]], ... }
//
// Hours are decimal 24h floats (18.75 = 6:45 PM). Closes past midnight use
// the >24 convention (25.0 = 1 AM next day). An empty array = closed that
// day. Render-time only; the data layer keeps the JSON untouched. Legacy
// rows holding the old readable string, or any value that doesn't parse to
// the expected shape, fall through to a raw passthrough.

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

const DAY_LABEL: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

export interface HoursRow {
  /** A day or grouped day range: "Mon" or "Mon – Thu". */
  days: string;
  /** Formatted intervals: "11 AM – 11 PM", a comma list, or "Closed". */
  hours: string;
}

export type HoursDisplay =
  | { kind: "rows"; rows: HoursRow[] }
  | { kind: "raw"; text: string };

type Interval = [number, number];
type Schedule = Partial<Record<DayKey, Interval[]>>;

/** 11.0 -> "11 AM", 18.75 -> "6:45 PM", 25.0 -> "1 AM", 24.0 -> "12 AM". */
function formatHour(value: number): string {
  const wall = value >= 24 ? value - 24 : value; // fold past-midnight closes
  let h = Math.floor(wall);
  let minutes = Math.round((wall - h) * 60);
  if (minutes === 60) {
    h += 1;
    minutes = 0;
  }
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return minutes === 0
    ? `${hour12} ${ampm}`
    : `${hour12}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

function formatIntervals(intervals: Interval[]): string {
  if (intervals.length === 0) return "Closed";
  return intervals
    .map(([open, close]) => `${formatHour(open)} – ${formatHour(close)}`)
    .join(", ");
}

function isInterval(v: unknown): v is Interval {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number"
  );
}

function parseSchedule(raw: string): Schedule | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const rec = parsed as Record<string, unknown>;
  if (!DAY_KEYS.some((d) => d in rec)) return null;

  const schedule: Schedule = {};
  for (const day of DAY_KEYS) {
    const val = rec[day];
    if (val === undefined) continue;
    if (!Array.isArray(val)) return null;
    const intervals: Interval[] = [];
    for (const item of val) {
      if (!isInterval(item)) return null;
      intervals.push([item[0], item[1]]);
    }
    schedule[day] = intervals;
  }
  return schedule;
}

/**
 * Format the venue `hours` JSON into display rows, collapsing consecutive
 * days with identical hours into a single range (Google-style). Returns a
 * raw passthrough for legacy strings or unparseable input.
 */
export function formatVenueHours(
  raw: string | null | undefined,
): HoursDisplay | null {
  if (!raw || raw.trim() === "") return null;
  const schedule = parseSchedule(raw);
  if (!schedule) return { kind: "raw", text: raw };

  const perDay = DAY_KEYS.map((day) => ({
    label: DAY_LABEL[day],
    value: formatIntervals(schedule[day] ?? []),
  }));

  const rows: HoursRow[] = [];
  let start = 0;
  for (let i = 1; i <= perDay.length; i++) {
    if (i === perDay.length || perDay[i].value !== perDay[start].value) {
      const first = perDay[start].label;
      const last = perDay[i - 1].label;
      rows.push({
        days: start === i - 1 ? first : `${first} – ${last}`,
        hours: perDay[start].value,
      });
      start = i;
    }
  }
  return { kind: "rows", rows };
}
