import { describe, expect, it } from "vitest";

// Home redesign 2026-06-12 — three contracts pinned at the source
// level since the project doesn't ship a render harness (see
// vitest.config.ts). The label-helper behavior lives in
// stop-eyebrow.test.ts; this file covers the structural changes:
//
//   1. Tonight's Pick is a teaser — no map, no stop rows, ONE
//      subtitle line, right-aligned chevron. The handoff +
//      daily_pick_opened analytics survive.
//   2. The header carries the die. The "Random tonight?" labeled
//      row under New plan is gone. The die fires the lucky flow
//      with no compose_started and no abandon flag.

async function readSources() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, "..", "..", "src");
  return {
    pick: readFileSync(
      join(srcRoot, "components", "home", "TonightsPickCard.tsx"),
      "utf-8",
    ),
    home: readFileSync(
      join(srcRoot, "components", "home", "HomeScreen.tsx"),
      "utf-8",
    ),
    die: readFileSync(
      join(srcRoot, "components", "home", "LuckyDieButton.tsx"),
      "utf-8",
    ),
  };
}

describe("Tonight's Pick teaser shape", () => {
  it("renders without a Mapbox map (no static-map URL, no img onError)", async () => {
    const { pick } = await readSources();
    // The map machinery was the whole point of the redesign — yank
    // it cleanly. No mapbox import, no onError fallback state.
    expect(pick).not.toMatch(/buildItineraryStaticMapUrl/);
    expect(pick).not.toMatch(/mapErrored/);
    expect(pick).not.toMatch(/onError=/);
    // No <img> at all on the card — the chevron is an inline SVG.
    expect(pick).not.toMatch(/<img\b/);
  });

  it("renders no stop rows (no per-stop list inside the teaser)", async () => {
    const { pick } = await readSources();
    // The old card mapped stops.slice(0, 2) into a <ul>. That goes.
    expect(pick).not.toMatch(/stops\.slice/);
    expect(pick).not.toMatch(/stops\.map/);
    // The stop-row marker (numbered badge + venue name) is gone.
    expect(pick).not.toMatch(/<li\b/);
    expect(pick).not.toMatch(/stop\.venue\.name/);
  });

  it("keeps the eyebrow, serif title, ONE subtitle line, and the chevron", async () => {
    const { pick } = await readSources();
    // Eyebrow with burgundy dot + label.
    expect(pick).toMatch(/Tonight&apos;s pick &middot; from us/);
    expect(pick).toMatch(/data-testid="tonights-pick-eyebrow"/);
    // Title is the generated header title in serif, truncated.
    expect(pick).toMatch(
      /<h2 className="truncate font-serif[\s\S]*?\{title\}/,
    );
    // Subtitle is the existing copy, truncated to ONE line.
    expect(pick).toMatch(
      /<p className="mt-1 truncate font-sans[\s\S]*?\{subtitle\}/,
    );
    // Right-aligned chevron icon present.
    expect(pick).toMatch(/ChevronRightIcon\b/);
  });

  it("keeps the burgundy/30 border + tinted background treatment", async () => {
    const { pick } = await readSources();
    expect(pick).toMatch(/border-burgundy\/30/);
    expect(pick).toMatch(/bg-burgundy-tint/);
  });

  it("preserves the sessionStorage handoff and the daily_pick_opened event", async () => {
    const { pick } = await readSources();
    // Tap fires the analytics event with itinerary_id null + pick_date.
    expect(pick).toMatch(/DAILY_PICK_OPENED/);
    // Standard handoff keys, unchanged.
    expect(pick).toMatch(/STORAGE_KEYS\.session\.questionnaireInputs/);
    expect(pick).toMatch(/STORAGE_KEYS\.session\.currentItinerary/);
    expect(pick).toMatch(/router\.push\("\/itinerary"\)/);
  });

  it("HomeScreen still renders the pick teaser unconditionally for authed users with a 'ready' payload (no plan-existence gate)", async () => {
    const { home } = await readSources();
    // The render gate is status === "ready" only. No conditional on
    // savedPlans.length / hasAnyPlans / upcoming.length.
    expect(home).toMatch(
      /tonightsPick\.data\?\.status === "ready"[\s\S]*?<TonightsPickCard/,
    );
    // Defensive: no plan-existence check in the same block as the
    // pick render.
    const block = home.match(
      /\{tonightsPick\.data\?\.status === "ready"[\s\S]*?\)\}/,
    );
    expect(block).not.toBeNull();
    expect(block?.[0]).not.toMatch(/hasAnyPlans/);
    expect(block?.[0]).not.toMatch(/upcoming\./);
  });
});

describe("Header dice — moved out of the body row", () => {
  it("HomeScreen no longer renders the labeled 'Random tonight?' row under the New plan CTA", async () => {
    const { home } = await readSources();
    // The row was a mt-3 flex-justify-center wrapper around the die
    // sitting INSIDE the New-plan body div. Both go.
    expect(home).not.toMatch(/mt-3 flex justify-center/);
    // Body-level LuckyDieButton call: the only callsite is now in
    // Header rightSlot. Confirm there's exactly ONE in the file.
    const hits = home.match(/<LuckyDieButton\b/g) ?? [];
    expect(hits.length).toBe(1);
  });

  it("HomeScreen mounts the die inside the Header rightSlot, beside the profile link", async () => {
    const { home } = await readSources();
    // The rightSlot is now a flex container holding the die +
    // profile glyph. The die mounts BEFORE the profile link so it
    // reads left-to-right in DOM order.
    expect(home).toMatch(
      /rightSlot=\{\s*<div className="flex items-center gap-3">\s*<LuckyDieButton[\s\S]*?<Link\s+href="\/profile"/,
    );
  });

  it("LuckyDieButton is icon-only with aria-label 'Random tonight'", async () => {
    const { die } = await readSources();
    // Exact aria-label per spec.
    expect(die).toMatch(/aria-label="Random tonight"/);
    // No visible label text remains ("Random tonight?" / "Too late
    // tonight" used to render as a sibling <span>). The icon-only
    // render uses <DieGlyph /> alone.
    expect(die).not.toMatch(/<span>Random tonight\?<\/span>/);
    expect(die).not.toMatch(/<span>\{eligible \?/);
  });

  it("after-cutoff state is a dimmed icon with aria-disabled", async () => {
    const { die } = await readSources();
    // aria-disabled mirrors the disabled state for AT.
    expect(die).toMatch(/aria-disabled=\{disabled \|\| undefined\}/);
    // Visual dim is the canonical opacity-40 (matches CLAUDE.md
    // disabled treatment).
    expect(die).toMatch(/disabled:opacity-40/);
    // Eligibility is still polled — after-cutoff users see the dim.
    expect(die).toMatch(/useTodayHasEligibleSlot/);
  });

  it("clicking the die opens LuckyOverlay — does NOT fire compose_started and does NOT set the abandon flag", async () => {
    const { die } = await readSources();
    // Click handler sets overlayOpen = true; LuckyOverlay then owns
    // the seeded roll + analytics. There is no compose flow involved.
    expect(die).toMatch(/setOverlayOpen\(true\)/);
    expect(die).toMatch(/<LuckyOverlay\b/);
    // Sanity: no compose-flow analytics or abandon-flag writes leak
    // into this component. Match invocations specifically so the
    // contract-documenting comment ("No compose_started") doesn't
    // trip the assertion.
    expect(die).not.toMatch(/track\([\s\S]*?COMPOSE_STARTED/);
    expect(die).not.toMatch(/EVENTS\.COMPOSE_STARTED/);
    expect(die).not.toMatch(/sessionStorage\.setItem\([\s\S]*?abandon/i);
    expect(die).not.toMatch(/STORAGE_KEYS[\s\S]*?abandon/i);
  });

  it("debounce still gates spend (Gemini + Mapbox)", async () => {
    const { die } = await readSources();
    // The debounce was the only thing preventing rage-tapping the
    // overlay open. Pin it so a refactor can't quietly drop it.
    expect(die).toMatch(/debouncedUntil/);
    expect(die).toMatch(/LUCKY\.debounceMs/);
  });
});
