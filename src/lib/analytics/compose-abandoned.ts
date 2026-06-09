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
  const time_in_flow_ms = Math.min(rawElapsed, ABANDONMENT_CAP_MS);
  emit("compose_abandoned", {
    time_in_flow_ms,
    last_step_completed: flag.last_step_completed,
  });
  deleteFlag(storage);
}
