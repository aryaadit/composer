import { describe, expect, it } from "vitest";

import { nextVenueIdFromExisting } from "@/lib/venues/sheet-write";

// venue_id picker — pure function tests + source-grep contracts for
// the route + panel wiring. The picker is split from the Sheets-bound
// `computeNextVenueId` orchestrator on purpose so the choose-which-id
// logic can be tested without faking the Google Sheets API.

describe("nextVenueIdFromExisting — pure picker", () => {
  it("returns v0001 when no ids exist (cold-start case)", () => {
    expect(nextVenueIdFromExisting(new Set())).toBe("v0001");
  });

  it("zero-pads to 4 digits ('v' + padStart(4, '0'))", () => {
    // max = 8 -> next = v0009. The padded form matches every
    // existing NYC Venues row so the catalog stays uniform.
    expect(nextVenueIdFromExisting(new Set(["v0008"]))).toBe("v0009");
    expect(nextVenueIdFromExisting(new Set(["v0099"]))).toBe("v0100");
    expect(nextVenueIdFromExisting(new Set(["v0999"]))).toBe("v1000");
  });

  it("takes max across BOTH tabs' ids unioned into one set", () => {
    // Simulates: NYC Venues has v0042, review tab has v0099 (an
    // operator pre-staged a higher id). Next = v0100.
    const both = new Set(["v0042", "v0011", "v0099"]);
    expect(nextVenueIdFromExisting(both)).toBe("v0100");
  });

  it("skips a candidate that's already used (monotonic, no gap reuse)", () => {
    // max = 9 but v0010 is already in the set (operator pre-staged
    // it ahead of schedule). Skip v0010, return v0011. Never go
    // back to fill gaps below max.
    const set = new Set(["v0009", "v0010"]);
    expect(nextVenueIdFromExisting(set)).toBe("v0011");
  });

  it("skips multiple consecutive used candidates", () => {
    // max = 9, but v0010, v0011, v0012 are all pre-staged.
    // Next = v0013.
    const set = new Set(["v0009", "v0010", "v0011", "v0012"]);
    expect(nextVenueIdFromExisting(set)).toBe("v0013");
  });

  it("ignores non-conforming ids for the max computation", () => {
    // "wv-east" was an experimental id shape used briefly; "main-1"
    // is a test fixture. Neither matches /^v(\\d+)$/, so neither
    // contributes to max. The single conforming id (v0050) wins.
    const set = new Set(["wv-east", "main-1", "garbage", "v0050"]);
    expect(nextVenueIdFromExisting(set)).toBe("v0051");
  });

  it("ignores ids that look like v + digits but aren't well-formed (mixed case, leading zero break, etc.)", () => {
    // V0050 (uppercase V) doesn't match the strict /^v.../ form.
    // "vONE" doesn't have digits. Both are ignored.
    const set = new Set(["V0050", "vONE", "v0042"]);
    expect(nextVenueIdFromExisting(set)).toBe("v0043");
  });

  it("does not double-count duplicates (Set handles dedup)", () => {
    // Both the catalog and the review tab might have v0099 (e.g. an
    // operator pre-staged it then it landed in NYC Venues). Set
    // dedups; max is still 99.
    const set = new Set(["v0099", "v0042"]);
    expect(nextVenueIdFromExisting(set)).toBe("v0100");
  });

  it("preserves the format across the 10000 boundary (5 digits, no padding fallback)", () => {
    // padStart only pads UP — once we cross 9999, the next id is
    // "v10000" which is 5 chars. The catalog convention is 4-digit
    // minimum, not exactly-4, so this is the correct behavior.
    expect(nextVenueIdFromExisting(new Set(["v9999"]))).toBe("v10000");
  });
});

// ─── Source-grep contracts ──────────────────────────────────────

async function readSources() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..", "..");
  const srcRoot = join(repoRoot, "src");
  return {
    sheetWrite: readFileSync(
      join(srcRoot, "lib", "venues", "sheet-write.ts"),
      "utf-8",
    ),
    route: readFileSync(
      join(srcRoot, "app", "api", "admin", "add-venue", "route.ts"),
      "utf-8",
    ),
    panel: readFileSync(
      join(srcRoot, "app", "profile", "_components", "AddVenuePanel.tsx"),
      "utf-8",
    ),
  };
}

describe("computeNextVenueId — orchestrator reads BOTH tabs", () => {
  it("unions catalog + review id sets before calling the picker", async () => {
    const { sheetWrite } = await readSources();
    // The orchestrator MUST consult both tabs so a recently-staged
    // id can't collide with a fresh apply.
    expect(sheetWrite).toMatch(
      /const catalog = await readNycVenuesVenueIds\(\);/,
    );
    expect(sheetWrite).toMatch(/readReviewTabVenueIds\(\)/);
    expect(sheetWrite).toMatch(/new Set<string>\(\[\.\.\.catalog, \.\.\.review\]\)/);
    expect(sheetWrite).toMatch(/return nextVenueIdFromExisting\(existing\)/);
  });

  it("treats missing review tab as an empty staged-id set (non-fatal)", async () => {
    const { sheetWrite } = await readSources();
    // A brand-new spreadsheet has no review tab yet; that should
    // not prevent the picker from running on just the catalog.
    expect(sheetWrite).toMatch(
      /if \(err instanceof ReviewTabMissingError\) \{\s*review = new Set\(\);/,
    );
  });
});

describe("/api/admin/add-venue — preview surfaces proposed_venue_id, falls back to blank+flag", () => {
  it("computes proposed_venue_id and includes it in the preview response", async () => {
    const { route } = await readSources();
    expect(route).toMatch(
      /proposed_venue_id = await computeNextVenueId\(\);/,
    );
    expect(route).toMatch(/proposed_venue_id,/);
    expect(route).toMatch(/row\["venue_id"\] = proposed_venue_id \?\? "";/);
  });

  it("on computeNextVenueId failure: blank venue_id + typed id_compute_error flag (no bogus low id)", async () => {
    const { route } = await readSources();
    expect(route).toMatch(
      /catch \(err\) \{\s*console\.error\("\[add-venue\] computeNextVenueId failed at preview:"/,
    );
    expect(route).toMatch(
      /id_compute_error =\s*"Could not compute venue_id — assign at promotion\."/,
    );
    // The flag travels on the response so the UI can surface it.
    expect(route).toMatch(/id_compute_error,$/m);
  });
});

describe("/api/admin/add-venue — apply recomputes immediately before append", () => {
  it("recomputes against both tabs, writes into row[venue_id], surfaces venue_id_written", async () => {
    const { route } = await readSources();
    // The recomputation lives in the apply handler, AFTER the
    // dedup re-check and BEFORE the cells projection — that
    // ordering is what narrows the race window between two
    // simultaneous applies.
    expect(route).toMatch(
      /venue_id_written = await computeNextVenueId\(\);\s*row\["venue_id"\] = venue_id_written;/,
    );
    expect(route).toMatch(/venue_id_written,/);
  });

  it("on apply-time computeNextVenueId failure: blank venue_id, still proceeds with append", async () => {
    const { route } = await readSources();
    // The failure path leaves venue_id_written as an empty string
    // and proceeds to the cells projection / append. The UI
    // surfaces the empty string with the "assign at promotion"
    // copy; the row STILL lands in the staging tab.
    expect(route).toMatch(
      /catch \(err\) \{\s*console\.error\("\[add-venue\] computeNextVenueId failed at apply:"/,
    );
    // No `return jsonResponse({.*apply_failed.*})` inside the
    // computeNextVenueId catch block — the row append continues.
    const failureMatch = route.match(
      /computeNextVenueId failed at apply:[\s\S]*?row\["venue_id"\] = "";/,
    );
    expect(failureMatch).not.toBeNull();
    expect(failureMatch![0]).not.toMatch(/return jsonResponse/);
  });
});

describe("AddVenuePanel — proposed_venue_id rendered prominently above FACTS", () => {
  it("renders the proposed_venue_id line BEFORE the FACTS field group", async () => {
    const { panel } = await readSources();
    // ProposedVenueIdBlock must precede the Facts FieldGroup in
    // the JSX so the operator sees the id before they scroll
    // through 20+ rows of Google fields.
    const proposedIdx = panel.indexOf("<ProposedVenueIdBlock");
    const factsIdx = panel.indexOf('title="Facts (from Google Places)"');
    expect(proposedIdx).toBeGreaterThan(-1);
    expect(factsIdx).toBeGreaterThan(-1);
    expect(proposedIdx).toBeLessThan(factsIdx);
  });

  it("includes helper text about re-confirming at promotion", async () => {
    const { panel } = await readSources();
    expect(panel).toMatch(/Correct as of staging\. Re-confirm at promotion/);
  });

  it("surfaces id_compute_error when the route couldn't compute", async () => {
    const { panel } = await readSources();
    expect(panel).toMatch(/Could not compute venue_id/);
    expect(panel).toMatch(/idComputeError \?\? "Reading the venue_id column failed\."/);
  });

  it("ApplySuccessBlock distinguishes 'venue_id written' vs 'venue_id left blank'", async () => {
    const { panel } = await readSources();
    expect(panel).toMatch(/data\.venue_id_written \? \(/);
    expect(panel).toMatch(/venue_id was left blank/);
  });
});
