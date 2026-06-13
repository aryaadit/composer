import { beforeEach, describe, expect, it } from "vitest";
import {
  rollLuckyInputsSeeded,
  LUCKY_VIBES,
  LUCKY_OCCASION_DEFAULT,
} from "@/lib/lucky";
import {
  isGroupVisible,
  isTierSelectable,
} from "@/config/group-visibility";
import { NEIGHBORHOOD_GROUPS } from "@/config/neighborhoods";
import { buildComposeContext } from "@/lib/analytics/events";
import { LUCKY } from "@/config/lucky";

// ─── Seed determinism ─────────────────────────────────────────────

describe("rollLuckyInputsSeeded — determinism", () => {
  // Use a fixed "now" so day stays constant; the seed source carries
  // the (user, date) tuple in callers.
  const now = new Date(2026, 5, 12, 17, 0, 0);

  it("Same seedSource + attempt produces byte-identical body", () => {
    const a = rollLuckyInputsSeeded(now, "18:00", "user_A|2026-06-12", 1);
    const b = rollLuckyInputsSeeded(now, "18:00", "user_A|2026-06-12", 1);
    expect(b).toEqual(a);
  });

  it("Different date produces (with high probability) different inputs", () => {
    // Three separate dates against the same user. Across the 3
    // distinct seeds, at least two should disagree somewhere. Allows
    // for the rare case where two dates land on the same (group,
    // budget, vibe) tuple by coincidence — we just need to prove the
    // seed actually varies the dice.
    const r1 = rollLuckyInputsSeeded(now, "18:00", "user_X|2026-06-12", 1);
    const r2 = rollLuckyInputsSeeded(now, "18:00", "user_X|2026-06-13", 1);
    const r3 = rollLuckyInputsSeeded(now, "18:00", "user_X|2026-06-14", 1);
    const bodies = [r1.body, r2.body, r3.body];
    const distinctGroups = new Set(bodies.map((b) => b.neighborhoods[0]));
    const distinctVibes = new Set(bodies.map((b) => b.vibe));
    expect(distinctGroups.size + distinctVibes.size).toBeGreaterThan(2);
  });

  it("Different user produces (with high probability) different inputs", () => {
    const r1 = rollLuckyInputsSeeded(now, "18:00", "alice|2026-06-12", 1);
    const r2 = rollLuckyInputsSeeded(now, "18:00", "bob|2026-06-12", 1);
    const r3 = rollLuckyInputsSeeded(now, "18:00", "carol|2026-06-12", 1);
    const bodies = [r1.body, r2.body, r3.body];
    const distinct = new Set(
      bodies.map((b) => `${b.neighborhoods[0]}/${b.budget}/${b.vibe}`),
    );
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("Different attempt produces different inputs from the same (user, date)", () => {
    // This is the contract that lets the server retry on 422 without
    // burning the same losing combination. attempts 1 and 2 MUST
    // differ in at least one dimension.
    const seedSource = "alice|2026-06-12";
    const a1 = rollLuckyInputsSeeded(now, "18:00", seedSource, 1);
    const a2 = rollLuckyInputsSeeded(now, "18:00", seedSource, 2);
    const a3 = rollLuckyInputsSeeded(now, "18:00", seedSource, 3);
    const sig = (b: { neighborhoods: readonly string[]; budget: string; vibe: string }) =>
      `${b.neighborhoods[0]}/${b.budget}/${b.vibe}`;
    const signatures = new Set([sig(a1.body), sig(a2.body), sig(a3.body)]);
    expect(signatures.size).toBeGreaterThan(1);
  });
});

// ─── Dice space respects gate predicates (inherited from rollLuckyInputs) ─

describe("rollLuckyInputsSeeded — dice space respects gates", () => {
  const visibleGroupIds = new Set(
    NEIGHBORHOOD_GROUPS.filter(isGroupVisible).map((g) => g.id),
  );
  const now = new Date(2026, 5, 12, 17, 0, 0);

  it("Across many seeded rolls, only visible groups + selectable tiers + focus vibes appear", () => {
    // Iterate over a hundred (userId, attempt) tuples to exercise the
    // seed space, then assert every result satisfies the gate
    // predicates. This shares the lucky path's invariants — Tonight's
    // Pick reuses the same dice space by construction.
    let seenGroups = 0;
    for (let u = 0; u < 50; u++) {
      for (let attempt = 1; attempt <= LUCKY.maxAttempts; attempt++) {
        const { body, groupId } = rollLuckyInputsSeeded(
          now,
          "18:00",
          `user_${u}|2026-06-12`,
          attempt,
        );
        // Group must be visible.
        expect(visibleGroupIds.has(groupId)).toBe(true);
        seenGroups++;
        // Budget must be selectable for the rolled group.
        const group = NEIGHBORHOOD_GROUPS.find((g) => g.id === groupId);
        expect(group).toBeDefined();
        expect(
          isTierSelectable(group!, body.budget as "casual" | "nice_out" | "splurge"),
        ).toBe(true);
        // Vibe must be one of the three focus options (NOT mix_it_up).
        expect(LUCKY_VIBES).toContain(body.vibe);
        // Occasion is the configured default.
        expect(body.occasion).toBe(LUCKY_OCCASION_DEFAULT);
      }
    }
    expect(seenGroups).toBe(50 * LUCKY.maxAttempts);
  });
});

// ─── ComposeContext.mode union accepts "daily" ───────────────────

describe("ComposeContext.mode — extends to 'daily'", () => {
  it("buildComposeContext passes through mode='daily' on the context", () => {
    const ctx = buildComposeContext({
      occasion: "friends",
      day: "2026-06-12",
      mode: "daily",
      attempt: 1,
    });
    expect(ctx.mode).toBe("daily");
    expect(ctx.attempt).toBe(1);
  });
});

// ─── Source-grep tripwires — same pattern as lucky.test.ts ────────

describe("Daily-pick source contract", () => {
  let routeSrc: string;
  let hookSrc: string;
  let cardSrc: string;
  beforeEach(async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const srcRoot = join(here, "..", "..", "src");
    routeSrc = readFileSync(
      join(srcRoot, "app", "api", "daily-pick", "route.ts"),
      "utf-8",
    );
    hookSrc = readFileSync(
      join(srcRoot, "hooks", "useTonightsPick.ts"),
      "utf-8",
    );
    // 2026-06-13: TonightsPickCard was renamed → TonightsPickHero
    // when the teaser was promoted to the shared three-zone hero.
    // The contract assertions below still apply verbatim to the
    // renamed component — the daily-pick path is the same.
    cardSrc = readFileSync(
      join(srcRoot, "components", "home", "TonightsPickHero.tsx"),
      "utf-8",
    );
  });

  it("Route, hook, and card do not reference questionnaire-flow events", () => {
    // Same contract as the lucky path: daily-pick bypasses the
    // questionnaire entirely. Funnel events from the questionnaire
    // flow must not leak in. Match the EVENTS.X namespace so
    // descriptive comments mentioning the bare symbol names don't
    // false-positive.
    for (const src of [routeSrc, hookSrc, cardSrc]) {
      expect(src).not.toMatch(/EVENTS\.COMPOSE_STARTED\b/);
      expect(src).not.toMatch(/EVENTS\.COMPOSE_STEP_COMPLETED\b/);
      expect(src).not.toMatch(/EVENTS\.COMPOSE_ABANDONED\b/);
    }
  });

  it("Route, hook, and card never CALL markComposeEntry / setComposeAbandonedFlag", () => {
    for (const src of [routeSrc, hookSrc, cardSrc]) {
      expect(src).not.toMatch(/markComposeEntry\s*\(/);
      expect(src).not.toMatch(/setComposeAbandonedFlag\s*\(/);
      expect(src).not.toMatch(/clearComposeAbandonedFlag\s*\(/);
      expect(src).not.toMatch(/clearComposeEntryToken\s*\(/);
    }
  });

  it("Route uses LUCKY.maxAttempts (the named constant) for the cap", () => {
    expect(routeSrc).toMatch(/LUCKY\.maxAttempts/);
  });

  it("Route sends mode: \"daily\" on the internal generate call", () => {
    expect(routeSrc).toMatch(/mode:\s*"daily"/);
  });

  it("Route stamps first_viewed_at server-side (no localStorage API call anywhere)", () => {
    // The was_first_view contract must live on the server so the
    // client-side daily_pick_viewed emit is honest across tabs +
    // sessions. CLAUDE.md forbids localStorage. Match the API-call
    // syntax (`.getItem`, `.setItem`, `.removeItem`) so descriptive
    // comments mentioning the word don't false-positive.
    expect(routeSrc).toMatch(/first_viewed_at/);
    for (const src of [routeSrc, hookSrc, cardSrc]) {
      expect(src).not.toMatch(/localStorage\s*\.\s*(getItem|setItem|removeItem)/);
    }
  });

  it("Hook fires DAILY_PICK_VIEWED only when was_first_view is true", () => {
    expect(hookSrc).toMatch(/was_first_view/);
    expect(hookSrc).toMatch(/EVENTS\.DAILY_PICK_VIEWED/);
  });

  it("Card emits DAILY_PICK_OPENED + writes the SAME sessionStorage keys as the questionnaire", () => {
    expect(cardSrc).toMatch(/EVENTS\.DAILY_PICK_OPENED/);
    expect(cardSrc).toMatch(/STORAGE_KEYS\.session\.currentItinerary/);
    expect(cardSrc).toMatch(/STORAGE_KEYS\.session\.questionnaireInputs/);
  });

  it("Card does NOT auto-save (saving is the user's action via Looks Good)", () => {
    // No /api/share, no /api/itineraries call from the card. Tap goes
    // to the standard /itinerary surface which has its own save flow.
    expect(cardSrc).not.toMatch(/api\/share/);
    expect(cardSrc).not.toMatch(/api\/itineraries/);
  });

  it("Route calls /api/generate UNCHANGED via the imported POST handler — no parallel pipeline", () => {
    // The route must orchestrate, not re-implement. The only way to
    // call /api/generate is via the imported handler.
    expect(routeSrc).toMatch(/from\s+"@\/app\/api\/generate\/route"/);
    // No re-implementations of the scoring/composer pipeline.
    expect(routeSrc).not.toMatch(/composeItinerary\(/);
    expect(routeSrc).not.toMatch(/pickBestForRole\(/);
    expect(routeSrc).not.toMatch(/applyPreFilters\(/);
  });

  it("Failure path tombstones the cache row instead of returning an error to the client", () => {
    // status: "failed" must be inserted into the cache so subsequent
    // views all-day skip the retry cycle. The client treats failed as
    // "render nothing" — per spec: "no error state for unrequested
    // content".
    expect(routeSrc).toMatch(/status:\s*"failed"/);
  });
});
