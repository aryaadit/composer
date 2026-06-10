// Strict canonical-neighborhood gate in the venue importer.
//
// Validates:
//   1. Any unknown slug → assertion fails (blocks), with per-row offender
//      detail (sheet row, venue name, bad slug).
//   2. All-canonical → assertion passes.
//   3. transformRows surfaces `recordSheetRows` so the assertion can
//      reach back into the sheet to label offenders.

import { describe, it, expect } from "vitest";
import { runAssertions } from "@/lib/venues/assertions";
import { transformRows } from "@/lib/venues/transform";
import type { VenueRecord, SheetMetadata } from "@/lib/venues/types";

const CANONICAL: ReadonlySet<string> = new Set([
  "west_village",
  "east_village",
  "soho_nolita",
]);

const META: SheetMetadata = {
  spreadsheetId: "test",
  title: "test sheet",
  rowCount: 3,
  modifiedTime: new Date().toISOString(),
  modifiedBy: "test",
  sampleNeighborhoods: [],
};

const TABS = ["NYC Venues"];
const HEADERS = [
  "venue_id",
  "name",
  "latitude",
  "longitude",
  "neighborhood",
  "active",
];

function record(
  venue_id: string,
  name: string,
  neighborhood: string,
): VenueRecord {
  return {
    venue_id,
    name,
    latitude: 40.73,
    longitude: -74.0,
    neighborhood,
    active: true,
  };
}

describe("canonicalNeighborhoodsAssertion — strict gate", () => {
  it("any unknown slug → blocks with per-row offender detail", () => {
    const records = [
      record("v1", "Bistro West", "west_village"),
      record("v2", "Wrong Slug Bar", "soho"), // not in CANONICAL
      record("v3", "Another Bad", "tribeca"), // not in CANONICAL
    ];
    // recordSheetRows: parallel to records (data starts at sheet row 3).
    const recordSheetRows = [3, 4, 5];

    const report = runAssertions(
      records,
      recordSheetRows,
      META,
      TABS,
      HEADERS,
      100,
      CANONICAL,
    );

    expect(report.blocked).toBe(true);
    const canon = report.results.find((r) => r.name === "Canonical neighborhoods");
    expect(canon).toBeDefined();
    expect(canon!.passed).toBe(false);

    // Per-row offender output: spec requires sheet row, venue name, bad slug.
    expect(canon!.detail).toContain("row 4");
    expect(canon!.detail).toContain("Wrong Slug Bar");
    expect(canon!.detail).toContain("'soho'");
    expect(canon!.detail).toContain("row 5");
    expect(canon!.detail).toContain("Another Bad");
    expect(canon!.detail).toContain("'tribeca'");
    // Offender count surfaced for at-a-glance scale of the problem.
    expect(canon!.detail).toContain("2 row(s)");
  });

  it("all-canonical → assertion passes", () => {
    const records = [
      record("v1", "Bistro West", "west_village"),
      record("v2", "EV Tavern", "east_village"),
      record("v3", "SoHo Place", "soho_nolita"),
    ];
    const report = runAssertions(
      records,
      [3, 4, 5],
      META,
      TABS,
      HEADERS,
      100,
      CANONICAL,
    );

    const canon = report.results.find((r) => r.name === "Canonical neighborhoods");
    expect(canon).toBeDefined();
    expect(canon!.passed).toBe(true);
    expect(canon!.detail).toMatch(/3 record\(s\) all in canonical set/);
  });

  it("more than 10 offenders → preview truncated with overflow count", () => {
    const records: VenueRecord[] = [];
    const rows: number[] = [];
    for (let i = 0; i < 15; i++) {
      records.push(record(`v${i}`, `Venue ${i}`, `unknown_slug_${i}`));
      rows.push(3 + i);
    }
    const report = runAssertions(
      records,
      rows,
      META,
      TABS,
      HEADERS,
      100,
      CANONICAL,
    );
    const canon = report.results.find((r) => r.name === "Canonical neighborhoods")!;
    expect(canon.passed).toBe(false);
    expect(canon.detail).toContain("15 row(s)");
    expect(canon.detail).toContain("…and 5 more");
  });
});

describe("transformRows — recordSheetRows parallel array", () => {
  it("returns sheet rows aligned to records, accounting for blank rows", () => {
    // Data rows start at sheet row 3 (rowIdx + 3). A blank row in the
    // middle should be skipped entirely (not emitted as records or
    // sheet-row entries) so the parallel array stays aligned.
    const rows = [
      ["v1", "Alpha", "40.73", "-74.0", "west_village", "yes"], // sheet row 3
      ["", "", "", "", "", ""],                                  // sheet row 4 (blank)
      ["v2", "Beta", "40.74", "-74.0", "east_village", "yes"],  // sheet row 5
    ];
    const result = transformRows(HEADERS, rows);
    expect(result.records).toHaveLength(2);
    expect(result.recordSheetRows).toEqual([3, 5]);
    expect(result.skipped).toHaveLength(0);
  });

  it("skipped rows do not appear in recordSheetRows", () => {
    // Row 4 fails the missing-neighborhood check and lands in skipped,
    // not records — so its sheet row 4 must NOT appear in
    // recordSheetRows, otherwise the parallel-array invariant breaks.
    const rows = [
      ["v1", "Alpha", "40.73", "-74.0", "west_village", "yes"], // 3 — ok
      ["v2", "Beta", "40.74", "-74.0", "", "yes"],              // 4 — missing neighborhood
      ["v3", "Gamma", "40.75", "-74.0", "east_village", "yes"], // 5 — ok
    ];
    const result = transformRows(HEADERS, rows);
    expect(result.records).toHaveLength(2);
    expect(result.recordSheetRows).toEqual([3, 5]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ row: 4, reason: expect.stringContaining("neighborhood") });
  });
});
