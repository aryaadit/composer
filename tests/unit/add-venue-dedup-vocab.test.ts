import { describe, expect, it } from "vitest";

// The add-venue feature's dedup and taxonomy validation both moved
// to the spreadsheet as the single source of truth. Dedup now hits
// the live "NYC Venues" tab AND the "NYC New Venues Review" staging
// tab, never composer_venues_v2. Taxonomy validation reads the
// "Master Reference" tab; the generated TS taxonomy in
// src/config/generated/* is no longer consulted (and a stale-vocab
// fallback would silently drift from the sheet).
//
// No jsdom in this project. Pin both contracts at the source level.

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
    sheetWrite: readFileSync(
      join(srcRoot, "lib", "venues", "sheet-write.ts"),
      "utf-8",
    ),
    panel: readFileSync(
      join(
        srcRoot,
        "app",
        "profile",
        "_components",
        "AddVenuePanel.tsx",
      ),
      "utf-8",
    ),
  };
}

describe("sheet-write — dedup + vocab readers", () => {
  it("exports readNycVenuesPlaceIdMap returning google_place_id -> {venue_id, name}", async () => {
    const { sheetWrite } = await readSources();
    expect(sheetWrite).toMatch(
      /export async function readNycVenuesPlaceIdMap\(\): Promise<\s*Map<string, CatalogVenueMatch>\s*>/,
    );
    expect(sheetWrite).toMatch(
      /interface CatalogVenueMatch \{\s*venue_id: string;\s*name: string;\s*\}/,
    );
    // The reader looks up its columns by HEADER name (not by fixed
    // column index) so a future column reordering in the sheet
    // doesn't silently break dedup.
    expect(sheetWrite).toMatch(
      /headers\.indexOf\("google_place_id"\)[\s\S]*?headers\.indexOf\("venue_id"\)[\s\S]*?headers\.indexOf\("name"\)/,
    );
  });

  it("exports readReviewTabPlaceIdMap with 1-indexed row_number", async () => {
    const { sheetWrite } = await readSources();
    expect(sheetWrite).toMatch(
      /export async function readReviewTabPlaceIdMap\(\): Promise<\s*Map<string, ReviewTabMatch>\s*>/,
    );
    expect(sheetWrite).toMatch(
      /interface ReviewTabMatch \{\s*row_number: number;\s*venue_id: string;\s*name: string;\s*\}/,
    );
    // Data row index `i` maps to sheet row `i + 1` (header row is
    // index 0 in the values array but row 1 in the sheet).
    expect(sheetWrite).toMatch(/row_number: i \+ 1/);
  });

  it("exports readMasterReferenceVocab returning header -> Set<value>", async () => {
    const { sheetWrite } = await readSources();
    expect(sheetWrite).toMatch(
      /export async function readMasterReferenceVocab\(\): Promise<\s*Map<string, Set<string>>\s*>/,
    );
    // Range matches the canonical Master Reference layout (columns
    // A-K, data starts at row 3 -> A2:K covers headers + data).
    expect(sheetWrite).toMatch(/`\$\{MASTER_REFERENCE_TAB\}!A2:K`/);
    // Empty columns are dropped from the returned map so the route's
    // "no constraint" semantics fire cleanly when a column hasn't
    // been populated yet.
    expect(sheetWrite).toMatch(/if \(set\.size > 0\) vocab\.set\(header, set\);/);
  });

  it("throws MasterReferenceUnavailableError instead of silently returning empty vocab", async () => {
    const { sheetWrite } = await readSources();
    expect(sheetWrite).toMatch(/class MasterReferenceUnavailableError extends Error/);
    // Three failure surfaces: missing tab, empty A2:K range, empty
    // headers row. Each throws the typed error so the route can map
    // to a structured vocab_unavailable response.
    expect(sheetWrite).toMatch(
      /throw new MasterReferenceUnavailableError\([\s\S]*?was not found/,
    );
    expect(sheetWrite).toMatch(
      /throw new MasterReferenceUnavailableError\("the range A2:K is empty"\)/,
    );
    expect(sheetWrite).toMatch(
      /throw new MasterReferenceUnavailableError\([\s\S]*?row 2 \(headers\) is empty/,
    );
  });
});

describe("/api/admin/add-venue — sheet-first dedup", () => {
  it("imports the sheet readers, does NOT query composer_venues_v2 for dedup", async () => {
    const { route } = await readSources();
    expect(route).toMatch(
      /import \{[\s\S]*?readNycVenuesPlaceIdMap[\s\S]*?\} from "@\/lib\/venues\/sheet-write"/,
    );
    expect(route).toMatch(/readReviewTabPlaceIdMap/);
    // The old DB dedup is gone — the preview/apply branches must
    // not hit composer_venues_v2 for the dedup check (the centroid
    // sanity hint elsewhere still uses Supabase, see neighborhood_
    // centroids — that's read-only label/distance data, not dedup).
    expect(route).not.toMatch(
      /composer_venues_v2[\s\S]*?eq\("google_place_id"/,
    );
  });

  it("returns duplicate_in_catalog when the place_id is in the live sheet", async () => {
    const { route } = await readSources();
    expect(route).toMatch(
      /kind: "duplicate_in_catalog",\s*venue_id: catalogMatch\.venue_id,\s*name: catalogMatch\.name,/,
    );
    // Type contract: no 'active' field (the sheet has no active flag
    // for new submissions; the DB does, but we're sheet-first now).
    expect(route).toMatch(
      /interface DuplicateInCatalogResponse \{[\s\S]*?kind: "duplicate_in_catalog";[\s\S]*?venue_id: string;[\s\S]*?name: string;[\s\S]*?\}/,
    );
    expect(route).not.toMatch(/kind: "duplicate";/);
  });

  it("returns duplicate_in_review with the staging tab's row_number when staged", async () => {
    const { route } = await readSources();
    expect(route).toMatch(
      /kind: "duplicate_in_review",\s*row_number: reviewMatch\.row_number,\s*venue_id: reviewMatch\.venue_id,\s*name: reviewMatch\.name,/,
    );
  });

  it("re-checks both tabs at apply time, not just at preview", async () => {
    const { route } = await readSources();
    // The apply branch reads catalog first, then review tab. Two
    // distinct catches because a missing review tab at apply time
    // is recoverable (the tab existence check below surfaces the
    // structured remediation).
    const handleApplyBlock = route.split("async function handleApply")[1] ?? "";
    expect(handleApplyBlock).toMatch(/readNycVenuesPlaceIdMap/);
    expect(handleApplyBlock).toMatch(/readReviewTabPlaceIdMap/);
    expect(handleApplyBlock).toMatch(/kind: "duplicate_in_catalog"/);
    expect(handleApplyBlock).toMatch(/kind: "duplicate_in_review"/);
  });
});

describe("/api/admin/add-venue — Master Reference as the only taxonomy source", () => {
  it("imports readMasterReferenceVocab and does NOT import the generated TS taxonomy", async () => {
    const { route } = await readSources();
    expect(route).toMatch(/readMasterReferenceVocab/);
    // The generated TS taxonomy was the previous validation source.
    // Importing it would let the validator silently drift from the
    // sheet — the user explicitly said "no fallback".
    expect(route).not.toMatch(/from "@\/config\/generated\/categories"/);
    expect(route).not.toMatch(/from "@\/config\/generated\/occasions"/);
    expect(route).not.toMatch(/from "@\/config\/generated\/stop-roles"/);
    expect(route).not.toMatch(/from "@\/config\/generated\/vibes"/);
    // The neighborhoods file is imported for label rendering only
    // (NEIGHBORHOOD_GROUPS, the slug -> display name map used by
    // the centroid-distance sanity hint). ALL_NEIGHBORHOODS, which
    // was the old validation set, must NOT be imported.
    expect(route).not.toMatch(/ALL_NEIGHBORHOODS/);
  });

  it("fails the preview with vocab_unavailable when the Master Reference read throws", async () => {
    const { route } = await readSources();
    expect(route).toMatch(
      /catch \(err\) \{[\s\S]*?MasterReferenceUnavailableError[\s\S]*?kind: "vocab_unavailable",/,
    );
  });

  it("threads vocab through both the Gemini prompt AND the post-Gemini validator", async () => {
    const { route } = await readSources();
    // The prompt builder takes vocab as an argument and queries it
    // per-field via vocabLine, so every field's allowed list in the
    // prompt comes from Master Reference verbatim.
    expect(route).toMatch(
      /function buildDrafterPrompt\(\s*place: PlaceData,\s*deterministic: DeterministicRow,\s*vocab: Map<string, Set<string>>,/,
    );
    expect(route).toMatch(
      /function vocabLine\(\s*label: string,\s*vocab: Map<string, Set<string>>,\s*key: string,\s*\)/,
    );
    // filterDraftedTaxonomy receives the same vocab and validates
    // every slug field through it; misses land in dropped[].
    expect(route).toMatch(
      /function filterDraftedTaxonomy\(\s*drafted: DraftedFields,\s*dropped: Array<\{ field: string; value: string; reason: string \}>,\s*vocab: Map<string, Set<string>>,/,
    );
    expect(route).toMatch(
      /reason: `not in master reference \$\{field\}`/,
    );
  });
});

describe("AddVenuePanel — banner UI for both duplicate states, no Apply", () => {
  it("declares state-machine variants for both duplicate kinds + vocab_unavailable", async () => {
    const { panel } = await readSources();
    expect(panel).toMatch(/\{ kind: "duplicate_in_catalog"; data: DuplicateInCatalogResponse \}/);
    expect(panel).toMatch(/\{ kind: "duplicate_in_review"; data: DuplicateInReviewResponse \}/);
    expect(panel).toMatch(/\{ kind: "vocab_unavailable"; data: VocabUnavailableResponse \}/);
    // The old undifferentiated "duplicate" state is gone.
    expect(panel).not.toMatch(/\{ kind: "duplicate"; data: DuplicateResponse \}/);
  });

  it("renders distinct banners for catalog vs review duplicates", async () => {
    const { panel } = await readSources();
    expect(panel).toMatch(/function DuplicateInCatalogBanner\(/);
    expect(panel).toMatch(/function DuplicateInReviewBanner\(/);
    expect(panel).toMatch(/Already in the sheet/);
    expect(panel).toMatch(/Already staged for review/);
    // The review banner surfaces the row number so the operator
    // can jump straight to it in the spreadsheet.
    expect(panel).toMatch(/row <span className="font-mono text-burgundy">\{data\.row_number\}/);
  });

  it("does NOT render the Apply button label inside either duplicate branch", async () => {
    const { panel } = await readSources();
    // The duplicate branches render the banner + a Start over link
    // only. The Apply affordance ("Add to review tab" label) lives
    // ONLY in the preview_ready branch, so its absence in the slice
    // between the two duplicate branch markers AND the next state
    // branch is the visual contract that the user can't apply a
    // duplicate.
    const catalogBranch = sliceBetween(
      panel,
      `if (state.kind === "duplicate_in_catalog")`,
      `if (state.kind === "duplicate_in_review")`,
    );
    expect(catalogBranch).not.toMatch(/Add to review tab/);

    const reviewBranch = sliceBetween(
      panel,
      `if (state.kind === "duplicate_in_review")`,
      `if (state.kind === "preview_ready")`,
    );
    expect(reviewBranch).not.toMatch(/Add to review tab/);
  });
});

function sliceBetween(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  if (start === -1) return "";
  const end = text.indexOf(endMarker, start + startMarker.length);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}
