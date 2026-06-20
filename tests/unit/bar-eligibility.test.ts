import { describe, it, expect } from "vitest";
import { isBarEligible, composeItinerary } from "@/lib/composer";
import {
  DRINKING_CATEGORIES,
  DRINK_VIBE_TAGS,
  GOOGLE_BAR_TYPES,
} from "@/config/vibes";
import type { Venue, QuestionnaireAnswers, WeatherInfo } from "@/types";

// Bar-eligibility is the load-bearing Drinks-night gate. The old shape
// — "stop1-pool-eligible AND NOT main-eligible" — was wrong in both
// directions: it admitted dessert shops and cafes (closer-eligible,
// not main) and rejected real bars that serve food (e.g. Zoo Sindang:
// category 'bar' but stop_roles include 'main'). The new predicate:
//
//   isBarEligible(v) = isStop1PoolEligible(v) && (
//     DRINKING_CATEGORIES.has(v.category)
//     || ( google_types ∩ GOOGLE_BAR_TYPES is non-empty
//          && vibe_tags ∩ DRINK_VIBE_TAGS is non-empty ) )
//
// The four named venues below are drawn from real production data
// (composer_venues_v2, 2026-06-15 snapshot via the discovery workflow).
// Each is the canonical example of one branch of the predicate; if any
// of them flips eligibility, the Drinks night either pairs a bar with
// a dinner spot or refuses to find honest bars that exist.

function venue(overrides: Partial<Venue>): Venue {
  return {
    id: overrides.id ?? "v_" + Math.random().toString(36).slice(2, 10),
    venue_id: "v",
    name: "Test",
    neighborhood: "koreatown",
    category: "bar",
    price_tier: 2,
    vibe_tags: [],
    occasion_tags: [],
    stop_roles: ["opener"],
    time_blocks: ["evening"],
    mon_blocks: ["evening"],
    tue_blocks: ["evening"],
    wed_blocks: ["evening"],
    thu_blocks: ["evening"],
    fri_blocks: ["evening"],
    sat_blocks: ["evening"],
    sun_blocks: ["evening"],
    duration_hours: 2,
    outdoor_seating: "no",
    reservation_difficulty: null,
    reservation_url: null,
    maps_url: null,
    curation_note: "",
    awards: null,
    quality_score: 7,
    curation_boost: 0,
    curated_by: null,
    address: "",
    latitude: 40.7475,
    longitude: -73.985,
    active: true,
    notes: null,
    hours: null,
    last_verified: null,
    happy_hour: null,
    dog_friendly: null,
    kid_friendly: null,
    wheelchair_accessible: null,
    signature_order: null,
    google_place_id: null,
    google_rating: null,
    google_review_count: null,
    google_types: [],
    google_phone: null,
    enriched: false,
    business_status: "OPERATIONAL",
    image_keys: [],
    reservation_platform: null,
    resy_venue_id: null,
    resy_slug: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  } as unknown as Venue;
}

// Snapshot fixtures of the four production venues used in the spec.
// Field values verified via the discovery workflow's named-venue lookup
// against composer_venues_v2 on 2026-06-15.
const ZOO_SINDANG = venue({
  id: "zoo_sindang",
  name: "Zoo Sindang",
  category: "bar",
  google_types: ["cocktail_bar", "bar", "point_of_interest", "establishment"],
  vibe_tags: ["cocktail_forward", "dinner", "food_forward", "romantic"],
  stop_roles: ["main", "opener"],
});

const POCHA_32 = venue({
  id: "pocha_32",
  name: "Pocha 32",
  category: "korean",
  google_types: [
    "korean_restaurant",
    "pub",
    "bar",
    "restaurant",
    "food",
    "point_of_interest",
    "establishment",
  ],
  vibe_tags: ["drinks", "late_night", "iykyk", "casual"],
  stop_roles: ["closer", "opener"],
});

const SWEET_GRAFFITI = venue({
  id: "sweet_graffiti",
  name: "Sweet Graffiti",
  category: "dessert",
  google_types: [
    "confectionery",
    "food_store",
    "point_of_interest",
    "food",
    "store",
    "establishment",
  ],
  vibe_tags: ["food_forward", "casual", "conversation_friendly"],
  stop_roles: ["closer"],
});

const MISS_KOREA_BBQ = venue({
  id: "miss_korea_bbq",
  name: "miss KOREA BBQ",
  category: "korean",
  google_types: [
    "korean_barbecue_restaurant",
    "bar_and_grill",
    "barbecue_restaurant",
    "vegetarian_restaurant",
    "asian_restaurant",
    "korean_restaurant",
    "bar",
    "restaurant",
    "food",
    "point_of_interest",
    "establishment",
  ],
  vibe_tags: ["late_night"],
  stop_roles: ["main"],
});

describe("DRINKING_CATEGORIES / GOOGLE_BAR_TYPES / DRINK_VIBE_TAGS — vocabulary", () => {
  it("DRINKING_CATEGORIES is exactly the four spec-confirmed values", () => {
    expect(Array.from(DRINKING_CATEGORIES).sort()).toEqual(
      ["bar", "rooftop_bar", "speakeasy", "wine_bar"].sort(),
    );
  });

  it("GOOGLE_BAR_TYPES is exactly the four spec-confirmed values", () => {
    expect(Array.from(GOOGLE_BAR_TYPES).sort()).toEqual(
      ["bar", "night_club", "pub", "wine_bar"].sort(),
    );
  });

  it("DRINK_VIBE_TAGS is exactly drinks + cocktail_forward (the recovery gate's vibe arm)", () => {
    expect(Array.from(DRINK_VIBE_TAGS).sort()).toEqual(
      ["cocktail_forward", "drinks"].sort(),
    );
  });
});

describe("isBarEligible — predicate on the four production venue shapes", () => {
  it("Zoo Sindang (category=bar, stop_roles include 'main') IS eligible — old predicate wrongly rejected it", () => {
    // stop_roles=['main','opener'] passes the stop1 gate via 'opener'.
    // category='bar' is a direct DRINKING_CATEGORIES hit. The old
    // predicate's NOT-main-eligible clause is gone; main-tagged real
    // bars are no longer false-rejected.
    expect(isBarEligible(ZOO_SINDANG)).toBe(true);
  });

  it("Pocha 32 (category=korean, google bar signal + drinks vibe) IS eligible via recovery", () => {
    // category 'korean' is not in DRINKING_CATEGORIES — the fast path
    // misses. Recovery rescues: google_types includes 'bar' + 'pub'
    // (∈ GOOGLE_BAR_TYPES), vibe_tags includes 'drinks' (∈ DRINK_VIBE_TAGS).
    // Without this branch, food-categorized real bars (pochas, gastropubs,
    // izakayas) would silently leak out of Drinks-night composition.
    expect(isBarEligible(POCHA_32)).toBe(true);
  });

  it("Sweet Graffiti (dessert, no google bar signal) is NOT eligible — old predicate wrongly admitted it", () => {
    // stop_roles=['closer'] passes the stop1 gate. category='dessert'
    // misses DRINKING_CATEGORIES. Recovery fails on both arms (no
    // GOOGLE_BAR_TYPES intersection — confectionery/food_store, no
    // DRINK_VIBE_TAGS — food_forward/casual). The old role-shape gate
    // would have admitted this venue as a "bar" — the predicate now
    // catches the bug.
    expect(isBarEligible(SWEET_GRAFFITI)).toBe(false);
  });

  it("miss KOREA BBQ (main-only, google has 'bar', no drink vibe) is NOT eligible — stop1 gate catches it", () => {
    // stop_roles=['main'] fails isStop1PoolEligible immediately (main
    // is not in {opener, closer}). Even if it cleared that gate, the
    // recovery arm would fail on vibe (only 'late_night', no drink
    // vibe tag) — which is exactly why both gates exist in series.
    expect(isBarEligible(MISS_KOREA_BBQ)).toBe(false);
  });
});

describe("isBarEligible — edge cases on the recovery path", () => {
  it("requires BOTH google bar signal AND drink vibe — neither alone is enough", () => {
    // Google says bar, but founders haven't tagged it drinks → reject.
    // (This is the miss KOREA BBQ shape minus the main-only stop_roles.)
    const googleBarOnly = venue({
      stop_roles: ["closer"],
      category: "korean",
      google_types: ["bar", "restaurant"],
      vibe_tags: ["late_night"],
    });
    expect(isBarEligible(googleBarOnly)).toBe(false);

    // Drink vibe but no google bar signal → reject.
    const drinkVibeOnly = venue({
      stop_roles: ["closer"],
      category: "korean",
      google_types: ["restaurant", "food"],
      vibe_tags: ["drinks", "casual"],
    });
    expect(isBarEligible(drinkVibeOnly)).toBe(false);
  });

  it("rooftop_bar and speakeasy categories qualify via the fast path", () => {
    const rooftop = venue({
      stop_roles: ["opener"],
      category: "rooftop_bar",
      google_types: [],
      vibe_tags: [],
    });
    const speakeasy = venue({
      stop_roles: ["opener"],
      category: "speakeasy",
      google_types: [],
      vibe_tags: [],
    });
    expect(isBarEligible(rooftop)).toBe(true);
    expect(isBarEligible(speakeasy)).toBe(true);
  });

  it("stop1 gate is load-bearing — a main-only venue cannot escape via the recovery arm", () => {
    // Even with every recovery arm green-lit, a main-only venue is
    // rejected. This is the contract that keeps the Seoul Salon shape
    // (a restaurant tagged main+closer with a late bar room) out of
    // the Drinks pool. The current predicate keeps it at the stop1
    // gate; the closer-tagged variant would slip through stop1 but be
    // rejected by category (no DRINKING_CATEGORIES match) AND by
    // recovery (no drink vibe tag).
    const mainOnlyBar = venue({
      stop_roles: ["main"],
      category: "bar",
      google_types: ["bar", "pub"],
      vibe_tags: ["drinks", "cocktail_forward"],
    });
    expect(isBarEligible(mainOnlyBar)).toBe(false);
  });
});

describe("composeItinerary — Koreatown Drinks composes two bars (the spec failure case)", () => {
  // The user's reported bug: a Koreatown + Drinks request used to
  // either pair a bar with a dinner spot or refuse honest pairs. With
  // the new predicate, the composer surfaces two actual bars from the
  // mixed-shape Koreatown pool below.
  const NEAR = { latitude: 40.7475, longitude: -73.985 };
  const KOREATOWN_DRINKS: QuestionnaireAnswers = {
    occasion: "date",
    neighborhoods: ["koreatown"],
    budget: "nice_out",
    vibe: "drinks_led",
    day: "2026-06-19",
    startTime: "19:00",
    endTime: "00:00",
  };
  const CLEAR: WeatherInfo = {
    temp_f: 70,
    condition: "clear",
    description: "Clear",
    is_bad_weather: false,
  };

  it("two bar-eligible venues in Koreatown yield two stops, no main, no false bar", () => {
    const venues = [
      // Zoo Sindang shape: bar + main-tagged. Old predicate rejected this; new predicate accepts.
      venue({
        id: "zoo_sindang",
        ...NEAR,
        category: "bar",
        google_types: ["cocktail_bar", "bar"],
        vibe_tags: ["cocktail_forward", "romantic"],
        stop_roles: ["main", "opener"],
      }),
      // Pocha 32 shape: korean + google pub/bar + drinks vibe. Accepted via recovery.
      venue({
        id: "pocha_32",
        ...NEAR,
        category: "korean",
        google_types: ["korean_restaurant", "pub", "bar"],
        vibe_tags: ["drinks", "late_night", "casual"],
        stop_roles: ["closer", "opener"],
      }),
      // Decoys that must NOT be picked.
      venue({
        id: "sweet_graffiti",
        ...NEAR,
        category: "dessert",
        google_types: ["confectionery"],
        vibe_tags: ["food_forward", "casual"],
        stop_roles: ["closer"],
      }),
      venue({
        id: "miss_korea_bbq",
        ...NEAR,
        category: "korean",
        google_types: ["korean_barbecue_restaurant", "bar"],
        vibe_tags: ["late_night"],
        stop_roles: ["main"],
      }),
    ];
    const { stops, zeroingStage } = composeItinerary(
      venues,
      KOREATOWN_DRINKS,
      CLEAR,
      0,
      () => 0.5,
    );
    expect(zeroingStage).toBeUndefined();
    expect(stops).toHaveLength(2);
    // No main role — Drinks composes opener+closer only.
    expect(stops.every((s) => s.role !== "main")).toBe(true);
    // Both picks come from the bar-eligible set.
    const pickedIds = stops.map((s) => s.venue.id).sort();
    expect(pickedIds).toEqual(["pocha_32", "zoo_sindang"].sort());
  });

  it("only Sweet Graffiti + miss KOREA BBQ in pool → empty stops + 'proximity' (no false bar)", () => {
    // Neither decoy passes the predicate; composer fails honestly
    // instead of pairing a dessert shop with a BBQ joint.
    const venues = [
      venue({
        id: "sweet_graffiti",
        ...NEAR,
        category: "dessert",
        google_types: ["confectionery"],
        vibe_tags: ["food_forward"],
        stop_roles: ["closer"],
      }),
      venue({
        id: "miss_korea_bbq",
        ...NEAR,
        category: "korean",
        google_types: ["korean_barbecue_restaurant", "bar"],
        vibe_tags: ["late_night"],
        stop_roles: ["main"],
      }),
    ];
    const { stops, zeroingStage } = composeItinerary(
      venues,
      KOREATOWN_DRINKS,
      CLEAR,
      0,
      () => 0.5,
    );
    expect(stops).toHaveLength(0);
    expect(zeroingStage).toBe("proximity");
  });
});

describe("/api/swap-stop — drinks_led filters candidates by isBarEligible (source-grep contract)", () => {
  // No jsdom; route tested via source-grep contract. The route handler
  // does NOT call composeMeal / composeDrinks — it only runs
  // applyPreFilters → pickBestForRole → itineraryFits — so without an
  // explicit isBarEligible narrow, a swap on a Drinks night can return
  // a non-bar. Pin the wiring so a future refactor can't silently
  // drop the gate.

  async function readSwapStop() {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const srcRoot = join(here, "..", "..", "src");
    return readFileSync(
      join(srcRoot, "app", "api", "swap-stop", "route.ts"),
      "utf-8",
    );
  }

  it("imports isBarEligible from composer", async () => {
    const route = await readSwapStop();
    expect(route).toMatch(/import \{[^}]*isBarEligible[^}]*\} from "@\/lib\/composer"/);
  });

  it("narrows pre.venues by isBarEligible when inputs.vibe === 'drinks_led'", async () => {
    const route = await readSwapStop();
    // The narrow happens AFTER pre-filter succeeds and BEFORE
    // pickBestForRole, and pickBestForRole MUST consume the narrowed
    // pool (not pre.venues directly). Both halves are pinned.
    expect(route).toMatch(
      /const drinksPool =\s*inputs\.vibe === "drinks_led"\s*\?\s*pre\.venues\.filter\(isBarEligible\)\s*:\s*pre\.venues;/,
    );
    expect(route).toMatch(/pickBestForRole\(\s*drinksPool,/);
  });

  it("zero bar-eligible candidates returns a 'proximity' ComposeFailure, not a non-bar fallback", async () => {
    const route = await readSwapStop();
    // Empty pool after the bar filter must NOT fall through to
    // pickBestForRole on the unfiltered set — that would defeat the
    // entire gate. The honest answer is the proximity failure copy,
    // matching composeDrinks' contract.
    expect(route).toMatch(
      /if \(drinksPool\.length === 0\) \{\s*return respondComposeFailure\("proximity", "swap-stop",/,
    );
  });
});
