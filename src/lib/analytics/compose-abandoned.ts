// Tracks compose-flow abandonment via a sessionStorage flag. Set on
// compose_started, updated on each compose_step_completed, cleared on a
// successful /api/generate response. checkAndEmitIfStale runs at app
// boot (AuthProvider) and inside compose_started's effect — if a stale
// flag exists, fire compose_abandoned and clear it.
//
// time_in_flow_ms is capped at one hour: anything longer almost
// certainly means the user closed the tab and came back later, not an
// active abandonment.
//
// All public functions accept optional `now` and `storage` parameters
// for testability. Production calls use Date.now() and sessionStorage.

const FLAG_KEY = "composer_compose_abandoned_flag";
export const ABANDONMENT_CAP_MS = 60 * 60 * 1000;
// Minimum age a flag must reach before it's considered "stale" enough
// to emit compose_abandoned. AuthProvider's boot-check effect fires
// ~microseconds after QuestionnaireShell's mount effect sets a fresh
// flag (children-first effect ordering means the parent runs after
// the child); without this guard, AuthProvider would consume the
// freshly-set flag, fire a spurious compose_abandoned, and delete
// the flag — breaking abandonment tracking for the rest of the
// session. 2 seconds is comfortably larger than any plausible
// effect-ordering gap and far smaller than any plausible real
// abandonment.
export const FLAG_MIN_AGE_MS = 2_000;

export interface AbandonedFlag {
  compose_started_at: number;
  last_step_completed: string | null;
}

export type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type EmitFn = (
  eventName: string,
  properties: Record<string, unknown>,
) => void;

function getDefaultStorage(): FlagStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readFlag(storage: FlagStorage): AbandonedFlag | null {
  try {
    const raw = storage.getItem(FLAG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AbandonedFlag>;
    if (typeof parsed.compose_started_at !== "number") return null;
    return {
      compose_started_at: parsed.compose_started_at,
      last_step_completed:
        typeof parsed.last_step_completed === "string"
          ? parsed.last_step_completed
          : null,
    };
  } catch {
    return null;
  }
}

function writeFlag(storage: FlagStorage, flag: AbandonedFlag): void {
  try {
    storage.setItem(FLAG_KEY, JSON.stringify(flag));
  } catch {
    // quota / private-mode failures are swallowed; abandonment tracking
    // is best-effort, not load-bearing.
  }
}

function deleteFlag(storage: FlagStorage): void {
  try {
    storage.removeItem(FLAG_KEY);
  } catch {
    // best-effort
  }
}

export function setComposeAbandonedFlag(
  now: number = Date.now(),
  storage: FlagStorage | null = getDefaultStorage(),
): void {
  if (!storage) return;
  writeFlag(storage, { compose_started_at: now, last_step_completed: null });
}

export function updateLastStepCompleted(
  stepLabel: string,
  storage: FlagStorage | null = getDefaultStorage(),
): void {
  if (!storage) return;
  const flag = readFlag(storage);
  if (!flag) return;
  writeFlag(storage, { ...flag, last_step_completed: stepLabel });
}

export function clearComposeAbandonedFlag(
  storage: FlagStorage | null = getDefaultStorage(),
): void {
  if (!storage) return;
  deleteFlag(storage);
}

/**
 * If a stale abandonment flag exists in storage, emit compose_abandoned
 * (with time_in_flow_ms capped at one hour) and clear the flag. No-op
 * when no flag is set or storage is unavailable.
 */
export function checkAndEmitIfStale(
  emit: EmitFn,
  now: number = Date.now(),
  storage: FlagStorage | null = getDefaultStorage(),
): void {
  if (!storage) return;
  const flag = readFlag(storage);
  if (!flag) return;
  const rawElapsed = Math.max(0, now - flag.compose_started_at);
  // Don't eat flags that were set within the last FLAG_MIN_AGE_MS —
  // they're almost certainly a flag QuestionnaireShell just set this
  // commit, not a real abandonment. See FLAG_MIN_AGE_MS comment for
  // context. Same guard handles the clock-skew case (now < flag.set_at)
  // because Math.max(0, ...) means rawElapsed = 0 < FLAG_MIN_AGE_MS.
  if (rawElapsed < FLAG_MIN_AGE_MS) return;
  const time_in_flow_ms = Math.min(rawElapsed, ABANDONMENT_CAP_MS);
  emit("compose_abandoned", {
    time_in_flow_ms,
    last_step_completed: flag.last_step_completed,
  });
  deleteFlag(storage);
}
