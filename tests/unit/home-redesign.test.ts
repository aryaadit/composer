import { describe, expect, it } from "vitest";

// Home contracts pinned at the source level since the project doesn't
// ship a render harness (see vitest.config.ts).
//
//   1. Tonight's Pick is now a RICH HERO (2026-06-13). Same three-zone
//      layout as the saved-plan hero (countdown header + Mapbox map +
//      venue timeline). Routed through the shared ItineraryHeroCard.
//   2. The pick renders only when the user has NO saved plan for
//      tonight — when one exists, the upcoming hero already surfaces
//      it and the pick steps aside.
//   3. The handoff + daily_pick_opened analytics survive the rename
//      from TonightsPickCard → TonightsPickHero.
//   4. The header carries the die. The "Random tonight?" labeled row
//      under New plan is gone. The die fires the lucky flow with no
//      compose_started and no abandon flag.

async function readSources() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, "..", "..", "src");
  return {
    pick: readFileSync(
      join(srcRoot, "components", "home", "TonightsPickHero.tsx"),
      "utf-8",
    ),
    hero: readFileSync(
      join(srcRoot, "components", "shared", "ItineraryHeroCard.tsx"),
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

describe("Tonight's Pick hero shape (2026-06-13)", () => {
  it("renders THROUGH the shared ItineraryHeroCard (map + timeline come from there, not duplicated)", async () => {
    const { pick, hero } = await readSources();
    // The pick must compose the hero, not reimplement the three-zone
    // layout. Pin the import + the JSX use.
    expect(pick).toMatch(
      /import \{ ItineraryHeroCard \} from "@\/components\/shared\/ItineraryHeroCard"/,
    );
    expect(pick).toMatch(/<ItineraryHeroCard\b/);
    // The map machinery and per-stop list belong to the hero — no
    // duplicate buildItineraryStaticMapUrl or stops.map in the pick.
    expect(pick).not.toMatch(/buildItineraryStaticMapUrl/);
    expect(pick).not.toMatch(/stops\.map/);
    expect(pick).not.toMatch(/mapErrored/);
    // The hero IS the source of those primitives.
    expect(hero).toMatch(/buildItineraryStaticMapUrl/);
    expect(hero).toMatch(/stops\.map/);
    expect(hero).toMatch(/mapErrored/);
  });

  it("eyebrow text is 'Tonight's pick · from us' with urgency 'today'", async () => {
    const { pick } = await readSources();
    // The pick passes a plain string to the hero — same copy the
    // teaser shipped, just routed through props instead of inline JSX.
    expect(pick).toMatch(/text:\s*"Tonight['’]s pick · from us"/);
    expect(pick).toMatch(/urgency:\s*"today"/);
  });

  it("title is the generated header title; metaLine joins day · time · neighborhood", async () => {
    const { pick } = await readSources();
    // Title fall-through default preserved from the teaser.
    expect(pick).toMatch(/itinerary\.header\?\.title \?\? "A plan for tonight"/);
    // Meta line: same Day · Time · Neighborhood pattern the saved
    // hero uses, fed from inputs.
    expect(pick).toMatch(/formatShortDateLabel\(inputs\.day\)/);
    expect(pick).toMatch(/formatStartTimeLabel\(inputs\.startTime\)/);
    expect(pick).toMatch(/neighborhoodLabel\(firstNeighborhood\)/);
    expect(pick).toMatch(/\.filter\(\(s\) => s\.length > 0\)/);
    expect(pick).toMatch(/\.join\(" · "\)/);
  });

  it("passes itinerary.stops + walks (with rebuild fallback) to the hero", async () => {
    const { pick } = await readSources();
    expect(pick).toMatch(/stops=\{itinerary\.stops\}/);
    // Walks prefer the response; fall back to rebuildWalks for
    // safety on a (hypothetical) walks-empty pick response.
    expect(pick).toMatch(/rebuildWalks\(itinerary\.stops\)/);
  });

  it("wraps the hero in a button firing the SAME sessionStorage handoff + DAILY_PICK_OPENED event", async () => {
    const { pick } = await readSources();
    // Outer is a <button>, not a Link or wrapper-less hero (per spec).
    expect(pick).toMatch(/<button[\s\S]*?onClick=\{handleOpen\}/);
    // The handoff + analytics survive verbatim from the teaser.
    expect(pick).toMatch(/DAILY_PICK_OPENED/);
    expect(pick).toMatch(/STORAGE_KEYS\.session\.questionnaireInputs/);
    expect(pick).toMatch(/STORAGE_KEYS\.session\.currentItinerary/);
    expect(pick).toMatch(/router\.push\("\/itinerary"\)/);
  });

  it("has NO rename or delete controls (those are SavedPlanRowExpanded's job)", async () => {
    const { pick } = await readSources();
    // The pick is read-only; no inline rename, no trash affordance,
    // no PATCH to /api/itineraries.
    expect(pick).not.toMatch(/PencilIcon/);
    expect(pick).not.toMatch(/TrashIcon/);
    expect(pick).not.toMatch(/aria-label="Rename"/);
    expect(pick).not.toMatch(/aria-label="Remove saved plan"/);
    expect(pick).not.toMatch(/\/api\/itineraries\//);
  });

  it("passes tinted to the hero so the burgundy-tint surface reads as ours", async () => {
    const { pick, hero } = await readSources();
    // The pick is the only consumer that should pass tinted today.
    // Saved-plan hero stays cream + burgundy/15 via its outer wrapper.
    expect(pick).toMatch(/<ItineraryHeroCard[\s\S]*?\btinted\b/);
    // The hero owns the burgundy-tint surface — TonightsPickHero
    // must NOT duplicate it on the outer button.
    const buttonClass = pick.match(/<button[\s\S]*?className="([^"]+)"/)?.[1] ?? "";
    expect(buttonClass).not.toMatch(/bg-burgundy-tint/);
    expect(buttonClass).not.toMatch(/bg-cream/);
    // And the hero source actually applies the tinted surface classes.
    expect(hero).toMatch(/bg-burgundy-tint/);
    expect(hero).toMatch(/border-burgundy\/30/);
  });
});

describe("HomeScreen — Tonight's Pick gate (showPick)", () => {
  it("imports TonightsPickHero (not TonightsPickCard)", async () => {
    const { home } = await readSources();
    expect(home).toMatch(
      /import \{ TonightsPickHero \} from "@\/components\/home\/TonightsPickHero"/,
    );
    expect(home).not.toMatch(/TonightsPickCard/);
  });

  it("computes hasTonightPlan from upcoming + todayLocalISO", async () => {
    const { home } = await readSources();
    expect(home).toMatch(
      /const hasTonightPlan = upcoming\.some\(\(p\) => p\.day === todayLocalISO\(\)\)/,
    );
    expect(home).toMatch(
      /import \{ splitPlansByDate, todayLocalISO \} from "@\/lib\/dateUtils"/,
    );
  });

  it("derives showPick once: ready-narrowed pickData + !hasTonightPlan", async () => {
    const { home } = await readSources();
    // Single source of truth for the gate. The upcoming-section
    // branch and the pick gate both read off the same `showPick`,
    // so the single-hero invariant can't drift.
    expect(home).toMatch(
      /const pickData =\s*tonightsPick\.data\?\.status === "ready" \? tonightsPick\.data : null/,
    );
    expect(home).toMatch(
      /const showPick = pickData !== null && !hasTonightPlan/,
    );
  });

  it("renders the pick only when showPick (and only one mount on the page)", async () => {
    const { home } = await readSources();
    expect(home).toMatch(/\{showPick && pickData &&[\s\S]*?<TonightsPickHero/);
    const hits = home.match(/<TonightsPickHero\b/g) ?? [];
    expect(hits.length).toBe(1);
  });
});

describe("HomeScreen — single-hero rule on the page", () => {
  it("Upcoming section branches on showPick — pick visible ⇒ ALL upcoming render as compact SavedPlanRow (no SavedPlanRowExpanded hero)", async () => {
    const { home } = await readSources();
    // The branch is the load-bearing piece: when showPick is true,
    // the section degrades to compact SavedPlanRow for every entry.
    // Pin both the branch shape and the absence of a hero in the
    // showPick=true window.
    expect(home).toMatch(
      /\{showPick \? \([\s\S]*?upcoming\.map\(\(plan\)[\s\S]*?<SavedPlanRow\b/,
    );
    // The hero in the showPick branch would defeat the whole point.
    const showPickBranch = home.match(
      /\{showPick \? \([\s\S]*?\) : \(/,
    );
    expect(showPickBranch).not.toBeNull();
    expect(showPickBranch?.[0]).not.toMatch(/SavedPlanRowExpanded/);
  });

  it("Upcoming section's !showPick branch keeps the SavedPlanRowExpanded hero for upcoming[0]", async () => {
    const { home } = await readSources();
    // Exactly one SavedPlanRowExpanded mount in HomeScreen, and it
    // sits in the else branch behind the showPick gate.
    const heroHits = home.match(/<SavedPlanRowExpanded\b/g) ?? [];
    expect(heroHits.length).toBe(1);
    expect(home).toMatch(
      /\) : \([\s\S]*?<SavedPlanRowExpanded[\s\S]*?plan=\{upcoming\[0\]\}/,
    );
  });
});

describe("ItineraryHeroCard — shared three-zone presentation", () => {
  it("does NOT own the outer interactive wrapper (no Link or button at top level)", async () => {
    const { hero } = await readSources();
    // The hero is purely presentational. Its consumers wrap it
    // (SavedPlanRowExpanded → Link; TonightsPickHero → button).
    expect(hero).not.toMatch(/^[\s]*import Link from "next\/link"/m);
    expect(hero).not.toMatch(/<Link\b/);
    expect(hero).not.toMatch(/<button\b/);
  });

  it("does NOT own rename or delete affordances (SavedPlanRowExpanded keeps those)", async () => {
    const { hero } = await readSources();
    expect(hero).not.toMatch(/PencilIcon/);
    expect(hero).not.toMatch(/TrashIcon/);
    expect(hero).not.toMatch(/aria-label="Rename"/);
    expect(hero).not.toMatch(/aria-label="Remove saved plan"/);
    expect(hero).not.toMatch(/\/api\/itineraries\//);
  });

  it("renders all three zones (eyebrow / title / meta / map / timeline)", async () => {
    const { hero } = await readSources();
    expect(hero).toMatch(/data-testid="countdown"/);
    expect(hero).toMatch(/<h2 className="font-serif text-2xl text-charcoal/);
    expect(hero).toMatch(/data-testid="venue-thumbnail"/);
    expect(hero).toMatch(/data-testid="walk-separator"/);
  });

  it("exposes the titleSlot escape hatch for SavedPlanRowExpanded's inline rename", async () => {
    const { hero } = await readSources();
    // The default <h2>{title}</h2> is replaced when titleSlot is
    // passed — the only way the rename input can sit in the same
    // DOM position without breaking byte-identity.
    expect(hero).toMatch(/titleSlot\?:\s*ReactNode/);
    expect(hero).toMatch(/\{titleSlot \?\? \(/);
  });

  it("exposes a `tinted?: boolean` prop defaulting to false — fragment unless on", async () => {
    const { hero } = await readSources();
    // The contract: tinted=false stays a fragment so consumer
    // wrappers (SavedPlanRowExpanded) keep providing the surface.
    // tinted=true wraps the zones in the burgundy-tint surface.
    expect(hero).toMatch(/tinted\?:\s*boolean/);
    expect(hero).toMatch(/tinted = false/);
    expect(hero).toMatch(/if \(tinted\)/);
    // The tinted wrapper carries the canonical pick surface classes.
    expect(hero).toMatch(
      /bg-burgundy-tint[\s\S]*?border-burgundy\/30|border-burgundy\/30[\s\S]*?bg-burgundy-tint/,
    );
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
    expect(home).toMatch(
      /rightSlot=\{\s*<div className="flex items-center gap-3">\s*<LuckyDieButton[\s\S]*?<Link\s+href="\/profile"/,
    );
  });

  it("LuckyDieButton is icon-only with aria-label 'Random tonight'", async () => {
    const { die } = await readSources();
    expect(die).toMatch(/aria-label="Random tonight"/);
    expect(die).not.toMatch(/<span>Random tonight\?<\/span>/);
    expect(die).not.toMatch(/<span>\{eligible \?/);
  });

  it("after-cutoff state is a dimmed icon with aria-disabled", async () => {
    const { die } = await readSources();
    expect(die).toMatch(/aria-disabled=\{disabled \|\| undefined\}/);
    expect(die).toMatch(/disabled:opacity-40/);
    expect(die).toMatch(/useTodayHasEligibleSlot/);
  });

  it("clicking the die opens LuckyOverlay — does NOT fire compose_started and does NOT set the abandon flag", async () => {
    const { die } = await readSources();
    expect(die).toMatch(/setOverlayOpen\(true\)/);
    expect(die).toMatch(/<LuckyOverlay\b/);
    // Match invocations specifically so the contract-documenting
    // comment ("No compose_started") doesn't trip the assertion.
    expect(die).not.toMatch(/track\([\s\S]*?COMPOSE_STARTED/);
    expect(die).not.toMatch(/EVENTS\.COMPOSE_STARTED/);
    expect(die).not.toMatch(/sessionStorage\.setItem\([\s\S]*?abandon/i);
    expect(die).not.toMatch(/STORAGE_KEYS[\s\S]*?abandon/i);
  });

  it("debounce still gates spend (Gemini + Mapbox)", async () => {
    const { die } = await readSources();
    expect(die).toMatch(/debouncedUntil/);
    expect(die).toMatch(/LUCKY\.debounceMs/);
  });
});
