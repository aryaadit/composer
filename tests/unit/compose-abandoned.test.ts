import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ABANDONMENT_CAP_MS,
  checkAndEmitIfStale,
  clearComposeAbandonedFlag,
  setComposeAbandonedFlag,
  updateLastStepCompleted,
  type FlagStorage,
} from "@/lib/analytics/compose-abandoned";

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

    it("uses 0 as time_in_flow_ms when now < compose_started_at (clock skew defense)", () => {
      setComposeAbandonedFlag(1_000_000, storage);
      checkAndEmitIfStale(emit, 500_000, storage);

      expect(emit).toHaveBeenCalledWith("compose_abandoned", {
        time_in_flow_ms: 0,
        last_step_completed: null,
      });
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
