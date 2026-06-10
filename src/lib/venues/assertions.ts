// Layer 2 sanity assertions for the venue importer.
//
// Layer 1 (sheet identity) is the operator's eyeball check on the dry-run
// header. Layer 2 — this module — programmatically catches "wrong sheet
// pointed at" / "filtered view exported" / "stale archive sheet" scenarios
// that look right at a glance.
//
// Run order matters: tab-existence first, then header presence, then
// content checks. If the tab is missing, content assertions are
// meaningless and we short-circuit.

import { VENUE_SHEET_TAB, SANITY_THRESHOLDS } from "./config";
import type {
  AssertionReport,
  AssertionResult,
  SheetMetadata,
  VenueRecord,
} from "./types";

const REQUIRED_HEADERS = [
  "venue_id",
  "name",
  "latitude",
  "longitude",
  "neighborhood",
  "active",
] as const;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function tabExistsAssertion(tabNames: string[]): AssertionResult {
  if (tabNames.includes(VENUE_SHEET_TAB)) {
    return {
      name: "Tab exists",
      passed: true,
      detail: `'${VENUE_SHEET_TAB}' found`,
      severity: "block",
    };
  }
  const present = tabNames.length > 0 ? tabNames.map((t) => `'${t}'`).join(", ") : "(none)";
  return {
    name: "Tab exists",
    passed: false,
    detail: `'${VENUE_SHEET_TAB}' tab not found. Tabs present: ${present}. Did you rename the tab?`,
    severity: "block",
  };
}

function headersPresentAssertion(headers: string[]): AssertionResult {
  const have = new Set(headers);
  const missing = REQUIRED_HEADERS.filter((h) => !have.has(h));
  if (missing.length === 0) {
    return {
      name: "Headers present",
      passed: true,
      detail: `all ${REQUIRED_HEADERS.length} required (${REQUIRED_HEADERS.join(", ")})`,
      severity: "block",
    };
  }
  return {
    name: "Headers present",
    passed: false,
    detail: `missing required header(s): ${missing.join(", ")}`,
    severity: "block",
  };
}

function rowCountBandAssertion(
  sheetRowCount: number,
  dbActiveCount: number
): AssertionResult {
  // Defensive: an empty DB shouldn't lock out the very first import. Treat
  // delta as 0 when there are no rows on either side (1 vs 0 is not
  // catastrophic — just means we're seeding).
  if (dbActiveCount === 0 && sheetRowCount === 0) {
    return {
      name: "Row count band",
      passed: true,
      detail: "sheet 0 / DB 0 active",
      severity: "block",
    };
  }
  const denominator = dbActiveCount > 0 ? dbActiveCount : sheetRowCount;
  const delta = Math.abs(sheetRowCount - dbActiveCount) / denominator;
  const allowed = SANITY_THRESHOLDS.rowCountDeltaPercent;
  const detail = `sheet ${fmtNum(sheetRowCount)} rows / DB ${fmtNum(
    dbActiveCount
  )} active (Δ ${pct(delta)}, allowed ${pct(allowed)})`;
  return {
    name: "Row count band",
    passed: delta <= allowed,
    detail,
    severity: "block",
  };
}

function latLngCoverageAssertion(records: VenueRecord[]): AssertionResult {
  if (records.length === 0) {
    return {
      name: "Lat/lng coverage",
      passed: false,
      detail: "no records to check (transform produced 0 rows)",
      severity: "block",
    };
  }
  const withCoords = records.filter(
    (r) => typeof r.latitude === "number" && typeof r.longitude === "number"
  ).length;
  const fraction = withCoords / records.length;
  const min = SANITY_THRESHOLDS.minLatLngCoverage;
  const detail = `${pct(fraction)} (${fmtNum(withCoords)}/${fmtNum(
    records.length
  )}) have lat+lng (min ${pct(min)})`;
  return {
    name: "Lat/lng coverage",
    passed: fraction >= min,
    detail,
    severity: "block",
  };
}

/** Maximum per-row offenders to surface in the assertion detail. The full
 * list could be hundreds in pathological cases (e.g. an entire sheet
 * column renamed); the first 10 are enough for the operator to recognize
 * the pattern and act. */
const OFFENDER_PREVIEW = 10;

function canonicalNeighborhoodsAssertion(
  records: VenueRecord[],
  recordSheetRows: number[],
  canonical: ReadonlySet<string>
): AssertionResult {
  if (records.length === 0) {
    return {
      name: "Canonical neighborhoods",
      passed: false,
      detail: "no records to check",
      severity: "block",
    };
  }
  // Strict: ANY row whose neighborhood slug isn't in ALL_NEIGHBORHOODS
  // blocks the import. Adding a new slug requires re-running
  // `npm run generate-configs` (which rewrites src/config/generated/
  // neighborhoods.ts from the sheet's Master Reference tab) before this
  // assertion will pass. That gate is intentional — it forces the
  // group-membership decision to be made before the venue can be served
  // to the questionnaire, instead of silently piling up orphan slugs
  // that no neighborhood selection can ever hit.
  const offenders: {
    sheet_row: number;
    name: string;
    neighborhood: string;
  }[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const hood = r.neighborhood;
    if (typeof hood === "string" && !canonical.has(hood)) {
      offenders.push({
        sheet_row: recordSheetRows[i] ?? -1,
        name: typeof r.name === "string" ? r.name : "(unknown)",
        neighborhood: hood,
      });
    }
  }
  if (offenders.length === 0) {
    return {
      name: "Canonical neighborhoods",
      passed: true,
      detail: `${fmtNum(records.length)} record(s) all in canonical set`,
      severity: "block",
    };
  }
  const preview = offenders
    .slice(0, OFFENDER_PREVIEW)
    .map((o) => `row ${o.sheet_row} (${o.name}): '${o.neighborhood}'`)
    .join("; ");
  const more =
    offenders.length > OFFENDER_PREVIEW
      ? ` …and ${offenders.length - OFFENDER_PREVIEW} more`
      : "";
  return {
    name: "Canonical neighborhoods",
    passed: false,
    detail: `${fmtNum(offenders.length)} row(s) carry slugs not in ALL_NEIGHBORHOODS (re-run \`npm run generate-configs\` after adding the slug to the sheet's Master Reference tab). Offenders: ${preview}${more}`,
    severity: "block",
  };
}

function staleSheetAssertion(metadata: SheetMetadata): AssertionResult {
  if (!metadata.modifiedTime) {
    return {
      name: "Sheet staleness",
      passed: true,
      detail: "skipped (Drive API unavailable)",
      severity: "block",
    };
  }
  const modified = new Date(metadata.modifiedTime);
  if (!Number.isFinite(modified.getTime())) {
    return {
      name: "Sheet staleness",
      passed: true,
      detail: `skipped (unparseable modifiedTime: ${metadata.modifiedTime})`,
      severity: "block",
    };
  }
  const ageMs = Date.now() - modified.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const max = SANITY_THRESHOLDS.maxStaleDays;
  const ageLabel =
    ageDays < 1
      ? `${Math.round(ageMs / (1000 * 60 * 60))} hours ago`
      : `${Math.round(ageDays)} days ago`;
  return {
    name: "Sheet staleness",
    passed: ageDays <= max,
    detail: `modified ${ageLabel} (max ${max} days)`,
    severity: "block",
  };
}

/**
 * Run every Layer-2 assertion in fixed order. Returns a report; the caller
 * decides whether to apply (`blocked === false`) or surface the failures.
 *
 * Short-circuits on tab-existence: if the tab isn't there, the rest of
 * the data is meaningless, so subsequent checks are skipped to keep the
 * output focused on the actionable failure.
 */
export function runAssertions(
  sheetVenues: VenueRecord[],
  sheetVenueRows: number[],
  metadata: SheetMetadata,
  tabNames: string[],
  headers: string[],
  dbActiveCount: number,
  canonicalNeighborhoods: ReadonlySet<string>
): AssertionReport {
  const results: AssertionResult[] = [];

  const tab = tabExistsAssertion(tabNames);
  results.push(tab);
  if (!tab.passed) {
    return { results, blocked: true };
  }

  results.push(headersPresentAssertion(headers));
  results.push(rowCountBandAssertion(sheetVenues.length, dbActiveCount));
  results.push(latLngCoverageAssertion(sheetVenues));
  results.push(
    canonicalNeighborhoodsAssertion(
      sheetVenues,
      sheetVenueRows,
      canonicalNeighborhoods
    )
  );
  results.push(staleSheetAssertion(metadata));

  const blocked = results.some((r) => !r.passed && r.severity === "block");
  return { results, blocked };
}
