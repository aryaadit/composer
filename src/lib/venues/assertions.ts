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

function canonicalNeighborhoodsAssertion(
  records: VenueRecord[],
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
  let inSet = 0;
  const offenders: string[] = [];
  const seenOffenders = new Set<string>();
  for (const r of records) {
    const hood = r.neighborhood;
    if (typeof hood === "string" && canonical.has(hood)) {
      inSet++;
    } else if (typeof hood === "string" && !seenOffenders.has(hood)) {
      seenOffenders.add(hood);
      offenders.push(hood);
    }
  }
  const fraction = inSet / records.length;
  const min = SANITY_THRESHOLDS.minCanonicalNeighborhoodCoverage;
  const passed = fraction >= min;
  let detail = `${pct(fraction)} (${fmtNum(inSet)}/${fmtNum(records.length)}) in canonical set (min ${pct(min)})`;
  if (!passed && offenders.length > 0) {
    detail += `. First non-canonical: ${offenders.slice(0, 5).join(", ")}`;
  }
  return {
    name: "Canonical neighborhoods",
    passed,
    detail,
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
  results.push(canonicalNeighborhoodsAssertion(sheetVenues, canonicalNeighborhoods));
  results.push(staleSheetAssertion(metadata));

  const blocked = results.some((r) => !r.passed && r.severity === "block");
  return { results, blocked };
}
