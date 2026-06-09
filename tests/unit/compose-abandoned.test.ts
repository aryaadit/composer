import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ABANDONMENT_CAP_MS,
  FLAG_MIN_AGE_MS,
  checkAndEmitIfStale,
  clearComposeAbandonedFlag,
  setComposeAbandonedFlag,
  updateLastStepCompleted,
  type FlagStorage,
} from "@/lib/analytics/compose-abandoned";

const FLAG_KEY = "composer_compose_abandoned_flag";

// In-memory Storage stand-in. The helper accepts a FlagStorage param so
// tests don't need to mock sessionStorage globally.
function makeStorage(): FlagStorage & { dump: () => Record<string, string> } {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
    dump: () => Object.fromEntries(store),
  };
}

describe("compose-abandoned helper", () => {
  let storage: ReturnType<typeof makeStorage>;
  let emit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = makeStorage();
    emit = vi.fn();
  });

  describe("set / clear lifecycle", () => {
    it("setComposeAbandonedFlag writes a flag with the given timestamp and null last_step", () => {
      setComposeAbandonedFlag(1000, storage);
      const raw = storage.getItem("composer_compose_abandoned_flag");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed).toEqual({ compose_started_at: 1000, last_step_completed: null });
    });

    it("clearComposeAbandonedFlag removes the flag", () => {
      setComposeAbandonedFlag(1000, storage);
      clearComposeAbandonedFlag(storage);
      expect(storage.getItem("composer_compose_abandoned_flag")).toBeNull();
    });

    it("clear is a no-op when no flag is set", () => {
      clearComposeAbandonedFlag(storage);
      expect(Object.keys(storage.dump())).toHaveLength(0);
    });
  });

  describe("updateLastStepCompleted", () => {
    it("updates last_step_completed but preserves compose_started_at", () => {
      setComposeAbandonedFlag(5_000, storage);
      updateLastStepCompleted("budget", storage);
      const parsed = JSON.parse(storage.getItem("composer_compose_abandoned_flag")!);
      expect(parsed).toEqual({
        compose_started_at: 5_000,
        last_step_completed: "budget",
      });
    });

    it("is a no-op when no flag exists", () => {
      updateLastStepCompleted("budget", storage);
      expect(storage.getItem("composer_compose_abandoned_flag")).toBeNull();
    });
  });

  describe("checkAndEmitIfStale", () => {
    it("does nothing when no flag is set", () => {
      checkAndEmitIfStale(emit, 0, storage);
      expect(emit).not.toHaveBeenCalled();
    });

    it("fires compose_abandoned and clears the flag when one exists (stale-flag-on-app-boot case)", () => {
      // Simulates: user started compose 10 minutes ago, completed
      // through "budget", then closed the tab. On next app boot,
      // AuthProvider mounts and calls checkAndEmitIfStale.
      setComposeAbandonedFlag(1_000_000, storage);
      updateLastStepCompleted("budget", storage);

      const now = 1_000_000 + 10 * 60 * 1000; // 10 min later
      checkAndEmitIfStale(emit, now, storage);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith("compose_abandoned", {
        time_in_flow_ms: 10 * 60 * 1000,
        last_step_completed: "budget",
      });
      // Flag cleared so we don't re-emit on the next check.
      expect(storage.getItem("composer_compose_abandoned_flag")).toBeNull();
    });

    it("caps time_in_flow_ms at one hour (cap-at-1-hour case)", () => {
      // Simulates: user opened compose 6 hours ago, never came back,
      // tab is somehow still alive. The raw elapsed is 6h but we
      // report the cap.
      setComposeAbandonedFlag(0, storage);
      const sixHoursLater = 6 * 60 * 60 * 1000;

      checkAndEmitIfStale(emit, sixHoursLater, storage);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith("compose_abandoned", {
        time_in_flow_ms: ABANDONMENT_CAP_MS, // 60 * 60 * 1000
        last_step_completed: null,
      });
      expect(storage.getItem("composer_compose_abandoned_flag")).toBeNull();
    });

    it("does not fire after a successful clear (flag-cleared-on-success case)", () => {
      // Simulates: user started compose, completed it, /api/generate
      // succeeded → clearComposeAbandonedFlag fired → next app boot
      // should NOT emit compose_abandoned.
      setComposeAbandonedFlag(1000, storage);
      updateLastStepCompleted("vibe", storage);
      clearComposeAbandonedFlag(storage);

      checkAndEmitIfStale(emit, 100_000, storage);

      expect(emit).not.toHaveBeenCalled();
    });

    it("skips emit when now < compose_started_at (clock skew → caught by FLAG_MIN_AGE_MS guard)", () => {
      // Before the Phase 3 fidelity fix this test asserted an emit
      // with time_in_flow_ms: 0. The FLAG_MIN_AGE_MS guard now skips
      // any flag younger than 2s (including the rawElapsed=0 clock-
      // skew case). Losing this signal is the cost of preventing the
      // AuthProvider/QuestionnaireShell race from eating fresh flags.
      setComposeAbandonedFlag(1_000_000, storage);
      checkAndEmitIfStale(emit, 500_000, storage);

      expect(emit).not.toHaveBeenCalled();
      // Flag is NOT deleted — preserved for a later check that's
      // outside the min-age window.
      expect(storage.getItem(FLAG_KEY)).not.toBeNull();
    });

    it("returns last_step_completed as null when never updated", () => {
      setComposeAbandonedFlag(1000, storage);
      checkAndEmitIfStale(emit, 5000, storage);
      expect(emit).toHaveBeenCalledWith(
        "compose_abandoned",
        expect.objectContaining({ last_step_completed: null }),
      );
    });

    it("survives malformed JSON in storage (returns no emit)", () => {
      storage.setItem("composer_compose_abandoned_flag", "{not json");
      checkAndEmitIfStale(emit, 1000, storage);
      expect(emit).not.toHaveBeenCalled();
    });

    it("survives missing compose_started_at field", () => {
      storage.setItem(
        "composer_compose_abandoned_flag",
        JSON.stringify({ last_step_completed: "budget" }),
      );
      checkAndEmitIfStale(emit, 1000, storage);
      expect(emit).not.toHaveBeenCalled();
    });
  });

  // FLAG_MIN_AGE_MS guard — the AuthProvider/QuestionnaireShell race
  // fix. AuthProvider's boot check fires microseconds after
  // QuestionnaireShell's mount effect sets the flag (children-first
  // effect ordering on initial direct page loads); the guard makes
  // the boot check skip flags too young to be real abandonments.
  describe("FLAG_MIN_AGE_MS guard (AuthProvider race fix)", () => {
    it("does NOT emit for a flag younger than FLAG_MIN_AGE_MS", () => {
      setComposeAbandonedFlag(10_000, storage);
      // Simulates AuthProvider's boot check 100ms after the flag was set.
      checkAndEmitIfStale(emit, 10_100, storage);

      expect(emit).not.toHaveBeenCalled();
      // Flag preserved — a later (legitimate) check still sees it.
      expect(storage.getItem(FLAG_KEY)).not.toBeNull();
    });

    it("does NOT emit at exactly FLAG_MIN_AGE_MS - 1", () => {
      setComposeAbandonedFlag(10_000, storage);
      checkAndEmitIfStale(emit, 10_000 + FLAG_MIN_AGE_MS - 1, storage);
      expect(emit).not.toHaveBeenCalled();
      expect(storage.getItem(FLAG_KEY)).not.toBeNull();
    });

    it("emits at exactly FLAG_MIN_AGE_MS", () => {
      setComposeAbandonedFlag(10_000, storage);
      checkAndEmitIfStale(emit, 10_000 + FLAG_MIN_AGE_MS, storage);

      expect(emit).toHaveBeenCalledWith("compose_abandoned", {
        time_in_flow_ms: FLAG_MIN_AGE_MS,
        last_step_completed: null,
      });
      expect(storage.getItem(FLAG_KEY)).toBeNull();
    });

    it("emits well beyond the min-age threshold", () => {
      setComposeAbandonedFlag(0, storage);
      checkAndEmitIfStale(emit, 30_000, storage);

      expect(emit).toHaveBeenCalledWith("compose_abandoned", {
        time_in_flow_ms: 30_000,
        last_step_completed: null,
      });
    });
  });

  // QuestionnaireShell mount-effect orchestration — would have caught
  // the original Phase 3 bug (compose_started never firing because the
  // order was drain → fire → set, but the bug we shipped was actually a
  // race with AuthProvider eating the just-set flag). These tests
  // simulate the helper-call sequence the mount effect uses and assert
  // both ordering and idempotence.
  describe("QuestionnaireShell mount sequence: drain → set → fire", () => {
    it("fires only compose_started when no stale flag (fresh-visit path)", () => {
      const now = 5_000;
      // The exact 4-call sequence the mount effect performs.
      checkAndEmitIfStale(emit, now, storage);
      setComposeAbandonedFlag(now, storage);
      emit("compose_started", { entry_source: "direct" });

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith("compose_started", {
        entry_source: "direct",
      });

      // The fresh flag is in storage with the current timestamp.
      expect(JSON.parse(storage.getItem(FLAG_KEY)!)).toEqual({
        compose_started_at: now,
        last_step_completed: null,
      });
    });

    it("drains stale flag, then fires compose_started — in that order", () => {
      // Pre-seed a stale flag from a previous abandoned compose.
      setComposeAbandonedFlag(0, storage);
      updateLastStepCompleted("budget", storage);

      const now = 10 * 60 * 1000; // 10 minutes later
      checkAndEmitIfStale(emit, now, storage);
      setComposeAbandonedFlag(now, storage);
      emit("compose_started", { entry_source: "direct" });

      expect(emit).toHaveBeenCalledTimes(2);
      // compose_abandoned first — drains the stale flag from the
      // prior compose.
      expect(emit).toHaveBeenNthCalledWith(1, "compose_abandoned", {
        time_in_flow_ms: 10 * 60 * 1000,
        last_step_completed: "budget",
      });
      // compose_started last — the new flow's start event.
      expect(emit).toHaveBeenNthCalledWith(2, "compose_started", {
        entry_source: "direct",
      });

      // The fresh flag REPLACED the stale one (set step came after drain).
      expect(JSON.parse(storage.getItem(FLAG_KEY)!)).toEqual({
        compose_started_at: now,
        last_step_completed: null,
      });
    });

    it("AuthProvider's check immediately after does NOT eat the fresh flag (race fix)", () => {
      // Simulates the children-first effect ordering on initial direct
      // /compose loads: QuestionnaireShell's mount effect runs first
      // (sets flag), then AuthProvider's boot check fires microseconds
      // later. Without FLAG_MIN_AGE_MS the boot check would consume
      // the flag and fire a spurious compose_abandoned.
      const now = 5_000;
      checkAndEmitIfStale(emit, now, storage);
      setComposeAbandonedFlag(now, storage);
      emit("compose_started", { entry_source: "direct" });
      emit.mockClear();

      // AuthProvider's boot-check effect fires ~milliseconds later.
      checkAndEmitIfStale(emit, now + 50, storage);

      expect(emit).not.toHaveBeenCalled();
      // Flag still present — abandonment tracking remains live for the
      // rest of this session.
      expect(JSON.parse(storage.getItem(FLAG_KEY)!)).toEqual({
        compose_started_at: now,
        last_step_completed: null,
      });
    });
  });

  describe("end-to-end normal flow", () => {
    it("set → update → clear → check produces no emit", () => {
      setComposeAbandonedFlag(0, storage);
      updateLastStepCompleted("occasion", storage);
      updateLastStepCompleted("neighborhood", storage);
      updateLastStepCompleted("budget", storage);
      updateLastStepCompleted("focus", storage);
      updateLastStepCompleted("when", storage);
      clearComposeAbandonedFlag(storage);
      checkAndEmitIfStale(emit, 30_000, storage);
      expect(emit).not.toHaveBeenCalled();
    });

    it("set → update → never clear → check emits with last completed step", () => {
      setComposeAbandonedFlag(0, storage);
      updateLastStepCompleted("budget", storage);
      checkAndEmitIfStale(emit, 30_000, storage);
      expect(emit).toHaveBeenCalledWith("compose_abandoned", {
        time_in_flow_ms: 30_000,
        last_step_completed: "budget",
      });
    });
  });
});
