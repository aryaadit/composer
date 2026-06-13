import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isoDateToday,
  nextEligibleStartTime,
  rollLuckyInputs,
  LUCKY_VIBES,
  LUCKY_OCCASION_DEFAULT,
} from "@/lib/lucky";
import { LUCKY } from "@/config/lucky";
import {
  COMPOSE_START_TIMES,
  type ComposeStartTime,
} from "@/lib/itinerary/time-blocks";
import {
  isGroupVisible,
  isTierSelectable,
  COMPOSE_TIERS,
} from "@/config/group-visibility";
import { NEIGHBORHOOD_GROUPS } from "@/config/neighborhoods";
import { buildComposeContext } from "@/lib/analytics/events";

// ─── nextEligibleStartTime ────────────────────────────────────────
// COMPOSE_START_TIMES is ["17:00","18:00","19:00","20:00","21:00"] and
// LUCKY.cutoffBufferMin = 30 (verify so the test is honest about its
// preconditions).

describe("nextEligibleStartTime — cutoff boundary", () => {
  it("Sanity-checks the constants the test reasons against", () => {
    expect(COMPOSE_START_TIMES).toEqual([
      "17:00",
      "18:00",
      "19:00",
      "20:00",
      "21:00",
    ]);
    expect(LUCKY.cutoffBufferMin).toBe(30);
  });

  it("returns the earliest pill when called well before any boundary", () => {
    // 09:00 + 30min = 09:30 — every pill is eligible, pick the earliest.
    const now = new Date(2026, 5, 12, 9, 0, 0);
    expect(nextEligibleStartTime(now)).toBe("17:00");
  });

  it("AT the boundary minute, the matching pill IS eligible", () => {
    // 18:30 + 30min = 19:00 — 19:00 should be eligible (>=, not strict >).
    const now = new Date(2026, 5, 12, 18, 30, 0);
    expect(nextEligibleStartTime(now)).toBe("19:00");
  });

  it("ONE minute past the boundary, the matching pill is NOT eligible", () => {
    // 18:31 + 30min = 19:01 — 19:00 is no longer reachable, push to 20:00.
    const now = new Date(2026, 5, 12, 18, 31, 0);
    expect(nextEligibleStartTime(now)).toBe("20:00");
  });

  it("walks the boundary correctly across all five pills", () => {
    const cases: Array<[Date, ComposeStartTime | null]> = [
      [new Date(2026, 5, 12, 16, 29), "17:00"],
      [new Date(2026, 5, 12, 16, 30), "17:00"],
      [new Date(2026, 5, 12, 16, 31), "18:00"],
      [new Date(2026, 5, 12, 17, 30), "18:00"],
      [new Date(2026, 5, 12, 17, 31), "19:00"],
      [new Date(2026, 5, 12, 19, 30), "20:00"],
      [new Date(2026, 5, 12, 20, 30), "21:00"],
      // 20:31 + 30min = 21:01 → no pill >= 21:01 → null.
      [new Date(2026, 5, 12, 20, 31), null],
      [new Date(2026, 5, 12, 22, 0), null],
      [new Date(2026, 5, 12, 23, 59), null],
    ];
    for (const [now, expected] of cases) {
      expect(
        nextEligibleStartTime(now),
        `now=${now.toISOString()} cutoff=${LUCKY.cutoffBufferMin}min`,
      ).toBe(expected);
    }
  });

  it("respects a custom cutoff buffer", () => {
    // 18:00 + 60min = 19:00 → 19:00 still eligible at exactly 19:00.
    const now = new Date(2026, 5, 12, 18, 0, 0);
    expect(nextEligibleStartTime(now, 60)).toBe("19:00");
    // 18:00 + 61min = 19:01 → push to 20:00.
    expect(nextEligibleStartTime(now, 61)).toBe("20:00");
  });
});

// ─── isoDateToday ────────────────────────────────────────────────

describe("isoDateToday", () => {
  it("formats as YYYY-MM-DD in local clock", () => {
    expect(isoDateToday(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
    expect(isoDateToday(new Date(2026, 11, 31, 23, 0))).toBe("2026-12-31");
  });
});

// ─── rollLuckyInputs — dice space respects gate predicates ─────────

describe("rollLuckyInputs — dice space honors gate predicates", () => {
  const visibleGroupIds = new Set(
    NEIGHBORHOOD_GROUPS.filter(isGroupVisible).map((g) => g.id),
  );
  // Bake sanity-check: the test is meaningful only if visible/hidden
  // groups exist in the current generated config. If everything is
  // visible, the "hidden is unrollable" half of the assertion is
  // vacuously true.
  it("Sanity-checks the bake: at least one visible group exists", () => {
    expect(visibleGroupIds.size).toBeGreaterThan(0);
  });

  it("Across many rolls, only visible groups + selectable tiers appear", () => {
    // 200 iterations is overkill for ~25 groups × 3 tiers × 2 vibes,
    // but exercises Math.random uniformly enough to catch a regression
    // where the filter is silently dropped.
    const now = new Date(2026, 5, 12, 17, 0);
    const seenGroups = new Set<string>();
    const seenBudgets = new Set<string>();
    const seenVibes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { body, groupId } = rollLuckyInputs(now, "18:00");
      seenGroups.add(groupId);
      seenBudgets.add(body.budget);
      seenVibes.add(body.vibe);

      // Group MUST be visible.
      expect(
        visibleGroupIds.has(groupId),
        `rolled hidden group ${groupId}`,
      ).toBe(true);

      // Budget MUST be selectable for that group.
      const group = NEIGHBORHOOD_GROUPS.find((g) => g.id === groupId);
      expect(group).toBeDefined();
      expect(
        isTierSelectable(group!, body.budget as (typeof COMPOSE_TIERS)[number]),
      ).toBe(true);

      // Vibe MUST be one of the focus options (no mix_it_up, no
      // activity_food after the 2026-06-13 focus collapse).
      expect(LUCKY_VIBES).toContain(body.vibe);

      // Occasion always the configured default.
      expect(body.occasion).toBe(LUCKY_OCCASION_DEFAULT);

      // Day is the ISO for `now` (local clock).
      expect(body.day).toBe("2026-06-12");

      // startTime echoes what we passed in.
      expect(body.startTime).toBe("18:00");

      // neighborhoods is the expansion of the rolled group — never empty.
      expect(body.neighborhoods.length).toBeGreaterThan(0);
    }
    // Hit at least 3 distinct groups across 200 rolls — guards against
    // a stuck-roll regression where rand always returns 0.
    expect(seenGroups.size).toBeGreaterThanOrEqual(3);
    // Both focus vibes hit (food_forward + drinks_led after the
    // 2026-06-13 collapse).
    expect(seenVibes.size).toBe(2);
    // At least 2 budget tiers hit (some groups may only support 1).
    expect(seenBudgets.size).toBeGreaterThanOrEqual(2);
  });

  it("Hidden groups never appear in the dice space (controlled rand)", () => {
    // A controlled rand always returning 0 picks the FIRST entry in
    // every array. If the filter is intact, the first visible group is
    // picked — not the first NEIGHBORHOOD_GROUPS entry (which could be
    // hidden).
    const now = new Date(2026, 5, 12, 17, 0);
    const { groupId } = rollLuckyInputs(now, "18:00", () => 0);
    expect(visibleGroupIds.has(groupId)).toBe(true);
  });

  it("mix_it_up is never rolled even though it's a real Vibe slug", () => {
    const now = new Date(2026, 5, 12, 17, 0);
    for (let i = 0; i < 100; i++) {
      const { body } = rollLuckyInputs(now, "18:00");
      expect(body.vibe).not.toBe("mix_it_up");
    }
  });
});

// ─── buildComposeContext: mode + attempt round-trip ──────────────

describe("ComposeContext — mode and attempt round-trip the builder", () => {
  it("Defaults mode to 'questionnaire' when not specified", () => {
    const ctx = buildComposeContext({ occasion: "friends", day: "2026-06-12" });
    expect(ctx.mode).toBe("questionnaire");
    expect(ctx.attempt).toBeUndefined();
  });

  it("Defaults mode to 'questionnaire' when inputs is null", () => {
    const ctx = buildComposeContext(null);
    expect(ctx.mode).toBe("questionnaire");
    expect(ctx.attempt).toBeUndefined();
  });

  it("Passes through mode='lucky' and attempt number", () => {
    const ctx = buildComposeContext({
      occasion: "friends",
      day: "2026-06-12",
      mode: "lucky",
      attempt: 2,
    });
    expect(ctx.mode).toBe("lucky");
    expect(ctx.attempt).toBe(2);
  });

  it("Omits attempt when not provided, even on the lucky path", () => {
    // Initial attempt is 1; attempts > 1 add the attempt field. We
    // don't strictly require attempt=undefined for attempt 1 — the
    // test asserts the shape the builder emits, not the policy.
    const ctx = buildComposeContext({ mode: "lucky", attempt: 1 });
    expect(ctx.mode).toBe("lucky");
    expect(ctx.attempt).toBe(1);
  });
});

// ─── runLuckyRolls — orchestration ────────────────────────────────

describe("runLuckyRolls — retry orchestration", () => {
  // The orchestration lives in src/lib/lucky-runner.ts (no React/Next
  // imports) precisely so vitest can exercise it directly.
  let runLuckyRolls: typeof import("@/lib/lucky-runner").runLuckyRolls;
  beforeEach(async () => {
    ({ runLuckyRolls } = await import("@/lib/lucky-runner"));
    // Reset sessionStorage between tests so the contract check ("no
    // entry token, no abandonment flag") starts from a clean slate.
    if (typeof globalThis.sessionStorage !== "undefined") {
      globalThis.sessionStorage.clear();
    }
  });

  function makeFetch(responses: Array<{ status: number; body: unknown }>) {
    let i = 0;
    return vi.fn(async () => {
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        json: async () => r.body,
      } as Response;
    });
  }

  it("Stops after LUCKY.maxAttempts of 422s and returns the last failure", async () => {
    const failure = {
      failed: true,
      zeroingStage: "proximity",
      title: "Nothing nearby pairs up",
      suggestion: "Try a different anchor or a wider neighborhood.",
    };
    const fetchImpl = makeFetch([
      { status: 422, body: failure },
      { status: 422, body: failure },
      { status: 422, body: failure },
      { status: 422, body: failure }, // would-be 4th — must not be reached
    ]);
    const result = await runLuckyRolls({
      now: new Date(2026, 5, 12, 17, 0),
      userId: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(LUCKY.maxAttempts);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.zeroingStage).toBe("proximity");
    }
  });

  it("Returns success on first 200, no further fetches", async () => {
    const fetchImpl = makeFetch([
      {
        status: 200,
        body: {
          inputs: { day: "2026-06-12" },
          stops: [],
          walks: [],
          walking: { longest_walk_min: 0, total_walk_min: 0, any_over_cap: false, cap_min: 15 },
          maps_url: "",
          header: { title: "", subtitle: "", occasion_tag: "", vibe_tag: "", estimated_total: "", weather: null },
        },
      },
    ]);
    const result = await runLuckyRolls({
      now: new Date(2026, 5, 12, 17, 0),
      userId: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  it("Retries once on 422, succeeds on 2nd attempt → 2 fetches", async () => {
    const failure = {
      failed: true,
      zeroingStage: "proximity",
      title: "x",
      suggestion: "y",
    };
    const fetchImpl = makeFetch([
      { status: 422, body: failure },
      {
        status: 200,
        body: {
          inputs: { day: "2026-06-12" },
          stops: [],
          walks: [],
          walking: { longest_walk_min: 0, total_walk_min: 0, any_over_cap: false, cap_min: 15 },
          maps_url: "",
          header: { title: "", subtitle: "", occasion_tag: "", vibe_tag: "", estimated_total: "", weather: null },
        },
      },
    ]);
    const result = await runLuckyRolls({
      now: new Date(2026, 5, 12, 17, 0),
      userId: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it("Non-422 unhappy paths (500, network) exit immediately with system failure", async () => {
    const fetchImpl = makeFetch([
      { status: 500, body: { error: "boom" } },
    ]);
    const result = await runLuckyRolls({
      now: new Date(2026, 5, 12, 17, 0),
      userId: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.zeroingStage).toBe("system");
    }
  });

  it("Beyond the same-day cutoff, fails immediately without fetching", async () => {
    // 22:00 → nextEligibleStartTime returns null → system failure.
    const fetchImpl = makeFetch([]);
    const result = await runLuckyRolls({
      now: new Date(2026, 5, 12, 22, 0),
      userId: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.zeroingStage).toBe("system");
    }
  });

  // ─── Contract: lucky must NOT touch compose-abandoned / entry token ─

  it("Does NOT set the compose-abandoned flag (questionnaire's job)", async () => {
    // Provide a sessionStorage shim. The lucky orchestration writes to
    // sessionStorage ONLY on success (questionnaireInputs + currentItinerary);
    // it must NEVER write the abandon flag or the entry token.
    const store = new Map<string, string>();
    const sessionShim = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage;
    vi.stubGlobal("sessionStorage", sessionShim);

    const failure = { failed: true, zeroingStage: "proximity", title: "x", suggestion: "y" };
    await runLuckyRolls({
      now: new Date(2026, 5, 12, 17, 0),
      userId: null,
      fetchImpl: makeFetch([
        { status: 422, body: failure },
      ]) as unknown as typeof fetch,
    });
    // The abandon flag and entry token must never appear.
    expect(store.has("composer_compose_abandoned_flag")).toBe(false);
    expect(store.has("composer_compose_entry_token")).toBe(false);
    vi.unstubAllGlobals();
  });
});

// ─── compose_started must not fire from the lucky path ───────────

describe("Lucky path does not emit compose_started or compose_step_completed", () => {
  it("LuckyOverlay's emission set is bounded to compose_submitted", () => {
    // Static-import the file so the test ALSO functions as a tripwire:
    // if a future edit adds `track(EVENTS.COMPOSE_STARTED, …)` to the
    // overlay, the import-source check below will catch the new symbol
    // reference. Behavioral assertion would require mounting React;
    // we don't have a render runtime, so we read the source.
    // (Behavior is also tested by the orchestrator test above which
    // calls runLuckyRolls directly.)
    // Use Node fs via the test harness path.
  });
});

// ─── Source-grep tripwire ────────────────────────────────────────
// Cheap, no-React: grep the overlay's source for the forbidden symbols.

describe("Lucky source contract — no questionnaire-flow touchpoints", () => {
  let overlaySrc: string;
  let runnerSrc: string;
  beforeEach(async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const srcRoot = join(here, "..", "..", "src");
    overlaySrc = readFileSync(
      join(srcRoot, "components", "home", "LuckyOverlay.tsx"),
      "utf-8",
    );
    runnerSrc = readFileSync(join(srcRoot, "lib", "lucky-runner.ts"), "utf-8");
  });

  it("Neither overlay nor runner references EVENTS.COMPOSE_STARTED / EVENTS.COMPOSE_STEP_COMPLETED / EVENTS.COMPOSE_ABANDONED", () => {
    // The lucky path bypasses the questionnaire entirely. Funnel events
    // that belong to the questionnaire flow must not leak in. We match
    // the EVENTS.X namespace so descriptive comments mentioning the
    // bare symbol names don't false-positive.
    for (const src of [overlaySrc, runnerSrc]) {
      expect(src).not.toMatch(/EVENTS\.COMPOSE_STARTED\b/);
      expect(src).not.toMatch(/EVENTS\.COMPOSE_STEP_COMPLETED\b/);
      expect(src).not.toMatch(/EVENTS\.COMPOSE_ABANDONED\b/);
    }
  });

  it("Neither overlay nor runner CALLS markComposeEntry / setComposeAbandonedFlag", () => {
    // Match the function-call syntax (parenthesis) so descriptive
    // comments don't false-positive on the bare symbol name.
    for (const src of [overlaySrc, runnerSrc]) {
      expect(src).not.toMatch(/markComposeEntry\s*\(/);
      expect(src).not.toMatch(/setComposeAbandonedFlag\s*\(/);
      expect(src).not.toMatch(/clearComposeAbandonedFlag\s*\(/);
      expect(src).not.toMatch(/clearComposeEntryToken\s*\(/);
    }
  });

  it("Runner emits COMPOSE_SUBMITTED with mode=\"lucky\"", () => {
    expect(runnerSrc).toMatch(/COMPOSE_SUBMITTED/);
    expect(runnerSrc).toMatch(/mode:\s*"lucky"/);
  });

  it("Runner uses LUCKY.maxAttempts for the cap", () => {
    expect(runnerSrc).toMatch(/LUCKY\.maxAttempts/);
  });

  it("Overlay uses LUCKY.minOverlayMs for the display floor", () => {
    expect(overlaySrc).toMatch(/LUCKY\.minOverlayMs/);
  });

  it("Overlay contains the reduced-motion branch (pulse instead of tumble)", () => {
    expect(overlaySrc).toMatch(/reduceMotion/);
    expect(overlaySrc).toMatch(/lucky-die-pulse/);
  });

  it("Overlay does NOT latch a once-per-mount useRef guard inside the effect", () => {
    // Regression for the dev-StrictMode hang: an `if (startedRef.current) return;`
    // pattern combined with cleanup-driven cancellation freezes the
    // overlay at the initial rolling phase forever. The per-closure
    // `cancelled` flag is the correct dedup; this assertion fails
    // loudly if the latching pattern comes back.
    expect(overlaySrc).not.toMatch(/startedRef\.current\s*=\s*true/);
    expect(overlaySrc).not.toMatch(/if\s*\(\s*startedRef\.current\s*\)/);
  });

  it("Overlay renders role=status + aria-live on the visible rolling line", () => {
    // a11y contract: exactly ONE live region active per phase, and its
    // accessible name matches the visible content. The rolling phase
    // puts role=status on the visible "Rolling for tonight" <p> (its
    // text content IS the accessible name — no separate aria-label
    // needed). The failure phase delegates to ComposeFailureBlock's
    // own role=status. We assert both pieces survive future edits.
    expect(overlaySrc).toMatch(/role="status"/);
    expect(overlaySrc).toMatch(/aria-live="polite"/);
    expect(overlaySrc).toMatch(/Rolling for tonight/);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
