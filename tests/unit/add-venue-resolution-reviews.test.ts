import { describe, expect, it } from "vitest";

// Two contracts pinned at the source level:
//
//   FIX C — place_id resolution chain: ChIJ extract -> shortlink ->
//   Text Search with locationBias and a 250m sanity guard. The route
//   must never feed a hex feature ID (the `!1s0x...:0x...` payload)
//   to /places/<id>; it must instead fall through to Text Search
//   using the URL's name + coords. Then refuse a Text Search hit
//   that's >250m from the URL coords because that's the most common
//   "wrong place across town" failure mode.
//
//   FIX D — review snippets as PROMPT context only: the drafter
//   fetches Places with withReviews:true, the prompt builder lists
//   the top snippets with explicit "signal only, do not quote"
//   guidance, and the system prompt carries the same rule. Review
//   text is never persisted (no calls to write reviews to the
//   sheet, the row, or any storage).

async function readSources() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..", "..");
  const srcRoot = join(repoRoot, "src");
  return {
    route: readFileSync(
      join(srcRoot, "app", "api", "admin", "add-venue", "route.ts"),
      "utf-8",
    ),
    placesToRow: readFileSync(
      join(srcRoot, "lib", "venues", "places-to-row.ts"),
      "utf-8",
    ),
    googlePlaces: readFileSync(
      join(srcRoot, "lib", "google-places.ts"),
      "utf-8",
    ),
  };
}

describe("FIX C — route orchestrates ChIJ extract -> shortlink -> Text Search", () => {
  it("imports extractMapsContext and textSearchPlaces", async () => {
    const { route } = await readSources();
    expect(route).toMatch(/extractMapsContext/);
    expect(route).toMatch(
      /import \{\s*fetchPlaceDetails,\s*textSearchPlaces,/,
    );
  });

  it("only falls back to Text Search when extractPlaceIdFromInput returns null", async () => {
    const { route } = await readSources();
    // The chain runs:
    //   1) extractPlaceIdFromInput on the raw input
    //   2) if shortlink, resolveMapsShortlink then extract again
    //   3) if STILL null, extractMapsContext + textSearchPlaces
    // Step 3 is gated by `if (!placeId)` — Text Search is the
    // fallback, never the primary resolver. Pin the order so a
    // refactor doesn't quietly invert it (which would cost a Text
    // Search call per ChIJ-shaped input).
    expect(route).toMatch(
      /if \(!placeId\) \{\s*const ctx = extractMapsContext\(resolvedUrl\);/,
    );
  });

  it("passes a 150m locationBias circle to Text Search around the URL pin", async () => {
    const { route } = await readSources();
    expect(route).toMatch(
      /textSearchPlaces\(\{\s*textQuery: ctx\.name,\s*locationBias: \{\s*latitude: ctx\.lat,\s*longitude: ctx\.lng,\s*radiusMeters: 150,\s*\},\s*\}\)/,
    );
  });

  it("rejects the top Text Search candidate when it's >250m from the URL coords", async () => {
    const { route } = await readSources();
    // 250 meters chosen so a neighbor-block venue with the same name
    // (common in West Village / Williamsburg / etc.) is still
    // acceptable, but a same-name venue across the borough is not.
    // The failure message names the actual distance + candidate so
    // the operator can verify.
    expect(route).toMatch(/distanceMeters > 250/);
    expect(route).toMatch(
      /\$\{Math\.round\(distanceMeters\)\}m from the URL coordinates/,
    );
  });

  it("returns typed preview_failed (reason: unresolved_place_id) on every failure branch", async () => {
    const { route } = await readSources();
    // Four distinct unresolved cases: missing name/coords, no Text
    // Search candidates, candidate too far. All map to the SAME
    // typed reason (the UI surfaces the route's message verbatim,
    // which differentiates the cases textually).
    const unresolvedHits =
      route.match(/reason: "unresolved_place_id"/g) ?? [];
    expect(unresolvedHits.length).toBeGreaterThanOrEqual(3);
  });
});

describe("FIX C — textSearchPlaces is the only Text Search caller", () => {
  it("exports textSearchPlaces from google-places.ts", async () => {
    const { googlePlaces } = await readSources();
    expect(googlePlaces).toMatch(/export async function textSearchPlaces/);
    expect(googlePlaces).toMatch(
      /"https:\/\/places\.googleapis\.com\/v1\/places:searchText"/,
    );
    // FieldMask must keep the response tiny — id + location +
    // displayName only. No editorial summary, no opening hours.
    expect(googlePlaces).toMatch(
      /"X-Goog-FieldMask": "places\.id,places\.location,places\.displayName"/,
    );
  });

  it("places-to-row.ts no longer extracts the !1s hex feature ID as a place_id", async () => {
    const { placesToRow } = await readSources();
    // The pre-fix-C extractor matched `!1s([0-9a-fx]+:[0-9a-fx]+)`
    // and returned the hex CID as a "place_id", which Places then
    // rejected silently. The code path that did the match-and-
    // return is gone (the capture group was the giveaway). The
    // string "!1s" can still appear in DOC COMMENTS explaining why
    // we don't extract it; we only forbid the active capture form.
    expect(placesToRow).not.toMatch(/match\([^)]*!1s\(/);
    // ChIJ-shape predicate IS present (no colons allowed in the
    // accepted shape, which is what rejects the hex).
    expect(placesToRow).toMatch(/function looksLikeChIJ/);
  });
});

describe("FIX D — review snippets feed the Gemini drafter as prompt context only", () => {
  it("fetches Places with withReviews:true on the preview path", async () => {
    const { route } = await readSources();
    expect(route).toMatch(
      /fetchPlaceDetails\(placeId, \{ withReviews: true \}\)/,
    );
  });

  it("google-places.ts widens the FieldMask AND skips trimming reviews when withReviews:true", async () => {
    const { googlePlaces } = await readSources();
    // Field mask is the same base mask + "reviews" appended only
    // when withReviews is set.
    expect(googlePlaces).toMatch(
      /opts\?\.withReviews \? `\$\{FIELD_MASK\},reviews` : FIELD_MASK/,
    );
    // trimPlaceData skips the reviews strip when keepReviews:true.
    expect(googlePlaces).toMatch(
      /if \(field === "reviews" && opts\.keepReviews\) continue;/,
    );
    // The default base FIELD_MASK does NOT include reviews —
    // existing callers (sync scripts, single-venue lookup) keep
    // the lean payload they had before.
    const fieldMaskBlock = googlePlaces.match(
      /const FIELD_MASK = \[([\s\S]*?)\]\.join/,
    );
    expect(fieldMaskBlock).not.toBeNull();
    expect(fieldMaskBlock![1]).not.toMatch(/"reviews"/);
  });

  it("extractReviewSnippets caps at 5 snippets and truncates each to 300 chars", async () => {
    const { route } = await readSources();
    expect(route).toMatch(/const REVIEW_SNIPPET_COUNT = 5;/);
    expect(route).toMatch(/const REVIEW_SNIPPET_MAX_CHARS = 300;/);
    expect(route).toMatch(/function extractReviewSnippets/);
    // The truncate path appends a single-char ellipsis (…) so the
    // model knows the snippet was cut.
    expect(route).toMatch(/REVIEW_SNIPPET_MAX_CHARS - 1\)\.trimEnd\(\)\}…/);
  });

  it("the drafter prompt names the reviews section with a no-quoting rule", async () => {
    const { route } = await readSources();
    expect(route).toMatch(
      /Top reviews \(signal only — do NOT quote, paraphrase, or repeat phrases\):/,
    );
    // System prompt carries the matching guard so the rule is in
    // BOTH places (model is more likely to honor it).
    expect(route).toMatch(/DO NOT quote or paraphrase review wording/);
  });

  it("review text is never written to the sheet row or response body", async () => {
    const { route } = await readSources();
    // Only the snippets variable touches review text. Pin that no
    // assignment shoves `reviewSnippets` into the row map or the
    // preview response payload.
    expect(route).not.toMatch(/reviewSnippets[^.\n]*?row\[/);
    expect(route).not.toMatch(/row\[[^\]]*?review[^\]]*?\]\s*=/);
    expect(route).not.toMatch(/reviews:\s*reviewSnippets/);
  });
});

describe("FIX A + B carry through to the preview response surface", () => {
  it("place_summary.google_maps_uri also uses the constructed place_id URL", async () => {
    const { route } = await readSources();
    expect(route).toMatch(
      /google_maps_uri: `https:\/\/www\.google\.com\/maps\/place\/\?q=place_id:\$\{placeId\}`/,
    );
  });
});
