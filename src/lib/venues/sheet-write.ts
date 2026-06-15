// Write-scoped Sheets client for the admin "Add venue" feature.
//
// Why a separate module:
//   - src/lib/venues/sheet.ts is intentionally read-only. The importer
//     pulls rows OUT of the sheet but never writes back; the venue
//     catalog flows: sheet -> import preview -> DB apply. Locking that
//     module to `spreadsheets.readonly` keeps the importer from
//     accidentally mutating the live `NYC Venues` tab if a bug ever
//     called the wrong API method.
//   - The add-venue feature appends rows to a SEPARATE `NYC New Venues
//     Review` staging tab (see ADD_VENUE_REVIEW_TAB). Different writer,
//     different scope, different module. Keeping the two split means a
//     future "let importers write back" change is opt-in per file.
//
// PROVISIONING the write path:
//   1. SCOPE: this module requests "spreadsheets" (full read+write).
//      Same service account + env vars as the read-only importer; no
//      new credential needed.
//   2. SHARE: the spreadsheet must list the service account email
//      (GOOGLE_SHEETS_CLIENT_EMAIL) as **Editor** in its Share dialog.
//      A Viewer share will 403 on append even with full scope. This
//      step is operator-side, not env-side.
//   3. TAB: the staging tab named ADD_VENUE_REVIEW_TAB must exist.
//      Header row (row 1) can be empty on first apply; ensureHeaders()
//      will write the canonical header order taken from `NYC Venues`
//      row 2.
//
// If any of the three are wrong the append surfaces a typed
// SheetWriteForbiddenError (for 403) or a SheetWriteFailedError (for
// other non-2xx). The route handler maps these to a typed
// ComposeFailure-shaped response so the admin panel can tell the
// operator exactly what to fix without reading logs.

import { google, type sheets_v4 } from "googleapis";

import {
  ADD_VENUE_REVIEW_TAB,
  VENUE_SHEET_DATA_RANGE,
  VENUE_SHEET_HEADER_RANGE,
  VENUE_SHEET_TAB,
} from "./config";
import { getSheetId } from "./sheet";

const MASTER_REFERENCE_TAB = "Master Reference";

const WRITE_SCOPES = [
  // FULL spreadsheets scope (not .readonly). Required for
  // spreadsheets.values.append, .update, and .batchUpdate. Drive
  // scope stays readonly since appends never touch Drive metadata.
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
];

export class SheetWriteForbiddenError extends Error {
  constructor() {
    super(
      "Google Sheets returned 403 on append. Provision: " +
        "(a) the service account in GOOGLE_SHEETS_CLIENT_EMAIL must be " +
        "shared as Editor on the spreadsheet (Share dialog in Google " +
        `Sheets), and (b) the "${ADD_VENUE_REVIEW_TAB}" tab must exist. ` +
        "See src/lib/venues/sheet-write.ts for the full provisioning checklist.",
    );
    this.name = "SheetWriteForbiddenError";
  }
}

export class SheetWriteFailedError extends Error {
  constructor(status: number, body: string) {
    super(`Google Sheets append failed: HTTP ${status}. Body: ${body}`);
    this.name = "SheetWriteFailedError";
  }
}

export class MasterReferenceUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `Could not read the "${MASTER_REFERENCE_TAB}" tab: ${detail}. ` +
        "The add-venue preview action depends on this tab as the single " +
        "source of truth for taxonomy slugs. Confirm the tab exists, the " +
        "service account has read access, and rows 3+ contain the canonical " +
        "slug lists per column (A=neighborhood, B=category, C=price_tier, " +
        "D=vibe_tags, E=occasion_tags, F=stop_roles, G=time_blocks, " +
        "H=outdoor_seating, I=reservation_difficulty, J=curated_by, " +
        "K=reservation_platform).",
    );
    this.name = "MasterReferenceUnavailableError";
  }
}

export class ReviewTabMissingError extends Error {
  constructor() {
    super(
      `The "${ADD_VENUE_REVIEW_TAB}" tab does not exist in the spreadsheet. ` +
        "Create it (the row-1 headers will be auto-populated on first " +
        `append using the column order from "${VENUE_SHEET_TAB}" row 2).`,
    );
    this.name = "ReviewTabMissingError";
  }
}

function getWriteAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  if (
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL &&
    process.env.GOOGLE_SHEETS_PRIVATE_KEY
  ) {
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(
          /\\n/g,
          "\n",
        ),
      },
      scopes: WRITE_SCOPES,
    });
  }
  throw new Error(
    "Google Sheets credentials not found. Set GOOGLE_SHEETS_CLIENT_EMAIL + " +
      "GOOGLE_SHEETS_PRIVATE_KEY in .env.local.",
  );
}

function writeSheetsClient(): sheets_v4.Sheets {
  return google.sheets({ version: "v4", auth: getWriteAuth() });
}

/**
 * Read the canonical column-header order from `NYC Venues` row 2.
 * The add-venue route uses this as the source of truth for column
 * ordering in the staging tab — keeping the two tabs aligned means
 * the operator can copy-paste reviewed rows directly into `NYC Venues`
 * without manual column shuffling.
 *
 * Returns headers as written (display case + spacing); the caller is
 * responsible for any normalization (lowercase for keying, etc.).
 */
export async function readCanonicalHeaders(): Promise<string[]> {
  const sheets = writeSheetsClient();
  const spreadsheetId = getSheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${VENUE_SHEET_TAB}!${VENUE_SHEET_HEADER_RANGE}`,
  });
  const row = (res.data.values ?? [[]])[0] ?? [];
  return row.map((c) => String(c));
}

/**
 * Read what's currently in row 1 of the staging tab. Returns an empty
 * array when the tab exists but row 1 is blank (the "first append"
 * case where ensureHeaders writes the canonical headers).
 *
 * Throws ReviewTabMissingError when the tab itself doesn't exist —
 * the route maps this to a typed response so the operator sees the
 * "create the tab" remediation step verbatim.
 */
export async function readReviewTabHeaders(): Promise<string[]> {
  const sheets = writeSheetsClient();
  const spreadsheetId = getSheetId();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${ADD_VENUE_REVIEW_TAB}!1:1`,
    });
    const row = (res.data.values ?? [[]])[0] ?? [];
    return row.map((c) => String(c));
  } catch (err) {
    // Sheets returns 400 with "Unable to parse range" when the tab
    // doesn't exist. Catch and rethrow as the typed error so the
    // route handler can map it to a structured response.
    const status = (err as { code?: number }).code;
    const message = (err as Error).message ?? "";
    if (status === 400 && /unable to parse range/i.test(message)) {
      throw new ReviewTabMissingError();
    }
    throw err;
  }
}

/**
 * Write the canonical NYC Venues headers into row 1 of the staging
 * tab. Called only when readReviewTabHeaders() returned an empty row.
 */
export async function writeReviewTabHeaders(
  headers: string[],
): Promise<void> {
  const sheets = writeSheetsClient();
  const spreadsheetId = getSheetId();
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${ADD_VENUE_REVIEW_TAB}!1:1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
  } catch (err) {
    throw classifyWriteError(err);
  }
}

/**
 * Append a single row of cells to the bottom of the staging tab.
 * Returns the 1-indexed row number of the appended row (parsed from
 * the API's `updatedRange` like "NYC New Venues Review!A47:CD47").
 *
 * The cells array MUST be in the same column order as the row-1
 * headers — caller is responsible for ordering. We pass
 * `valueInputOption: "USER_ENTERED"` so operator-typed formulas
 * (rare in the staging tab but possible) are interpreted, matching
 * what a manual paste would produce. `insertDataOption: "INSERT_ROWS"`
 * inserts a fresh row rather than overwriting existing data.
 */
export async function appendReviewTabRow(
  cells: string[],
): Promise<{ rowNumber: number }> {
  const sheets = writeSheetsClient();
  const spreadsheetId = getSheetId();
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${ADD_VENUE_REVIEW_TAB}!A:A`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [cells] },
    });
    const updatedRange = res.data.updates?.updatedRange ?? "";
    const rowNumber = parseAppendedRowNumber(updatedRange);
    return { rowNumber };
  } catch (err) {
    throw classifyWriteError(err);
  }
}

/**
 * Confirm the staging tab exists in the spreadsheet. Used by the
 * preview action so the operator sees "create the tab" remediation
 * BEFORE drafting a row, not after submitting one. Reuses the
 * read-only importer's fetchTabNames implicitly via tab-listing.
 */
export async function reviewTabExists(): Promise<boolean> {
  const sheets = writeSheetsClient();
  const spreadsheetId = getSheetId();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const titles =
    meta.data.sheets
      ?.map((s) => s.properties?.title)
      .filter((t): t is string => typeof t === "string") ?? [];
  return titles.includes(ADD_VENUE_REVIEW_TAB);
}

function classifyWriteError(err: unknown): Error {
  const status = (err as { code?: number }).code;
  const message = (err as Error).message ?? "";
  if (status === 403) {
    console.error("[sheet-write] 403 on append:", message);
    return new SheetWriteForbiddenError();
  }
  if (status === 400 && /unable to parse range/i.test(message)) {
    return new ReviewTabMissingError();
  }
  if (typeof status === "number") {
    return new SheetWriteFailedError(status, message);
  }
  return err as Error;
}

/**
 * Parse the 1-indexed row number out of a Sheets API updatedRange.
 * Example input: "'NYC New Venues Review'!A47:CD47" -> 47.
 * Returns -1 when the shape is unexpected; the caller should treat
 * that as "appended successfully but row number unknown" rather than
 * surfacing a failure (the row IS in the sheet at this point).
 */
function parseAppendedRowNumber(updatedRange: string): number {
  const match = updatedRange.match(/!([A-Z]+)(\d+):/);
  if (!match) return -1;
  const n = Number.parseInt(match[2], 10);
  return Number.isFinite(n) ? n : -1;
}

// ─── Dedup readers ───────────────────────────────────────────────
//
// The add-venue feature dedups against the LIVE NYC Venues tab
// (final / approved venues) AND the staging NYC New Venues Review
// tab (in-flight submissions awaiting human review). We deliberately
// do not touch composer_venues_v2 — the DB is downstream of the
// sheet, and a venue can sit in either tab before it reaches the DB
// via the importer. Sheet-first dedup means a re-submission caught
// here mirrors what the founders see when they open the spreadsheet.

export interface CatalogVenueMatch {
  venue_id: string;
  name: string;
}

export interface ReviewTabMatch {
  row_number: number;
  venue_id: string;
  name: string;
}

/**
 * Build a Map<google_place_id, {venue_id, name}> from the live
 * NYC Venues tab. The header row tells us which columns to read
 * (we don't hardcode positions; the spreadsheet has shifted columns
 * across audits and a positional reader would silently break).
 */
export async function readNycVenuesPlaceIdMap(): Promise<
  Map<string, CatalogVenueMatch>
> {
  const sheets = writeSheetsClient();
  const spreadsheetId = getSheetId();
  const [headerRes, dataRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${VENUE_SHEET_TAB}!${VENUE_SHEET_HEADER_RANGE}`,
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${VENUE_SHEET_TAB}!${VENUE_SHEET_DATA_RANGE}`,
    }),
  ]);

  const headers = ((headerRes.data.values ?? [[]])[0] ?? []).map((c) =>
    String(c).trim().toLowerCase(),
  );
  const placeIdCol = headers.indexOf("google_place_id");
  const venueIdCol = headers.indexOf("venue_id");
  const nameCol = headers.indexOf("name");

  const map = new Map<string, CatalogVenueMatch>();
  if (placeIdCol === -1) return map;

  for (const row of dataRes.data.values ?? []) {
    const placeId = String(row[placeIdCol] ?? "").trim();
    if (!placeId) continue;
    map.set(placeId, {
      venue_id: venueIdCol === -1 ? "" : String(row[venueIdCol] ?? "").trim(),
      name: nameCol === -1 ? "" : String(row[nameCol] ?? "").trim(),
    });
  }
  return map;
}

/**
 * Build a Map<google_place_id, {row_number, venue_id, name}> from
 * the NYC New Venues Review staging tab. Row 1 is the header row
 * (written on first apply by writeReviewTabHeaders); data starts at
 * row 2. The row_number is the 1-indexed sheet row so the UI can
 * tell the operator exactly where to look in the spreadsheet.
 *
 * Returns an empty Map (not an error) when the tab is empty or only
 * has headers — the "no staged submissions yet" case is normal.
 * Throws ReviewTabMissingError when the tab itself doesn't exist.
 */
export async function readReviewTabPlaceIdMap(): Promise<
  Map<string, ReviewTabMatch>
> {
  const sheets = writeSheetsClient();
  const spreadsheetId = getSheetId();

  let values: string[][];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${ADD_VENUE_REVIEW_TAB}!A:CD`,
    });
    values = (res.data.values ?? []).map((r) => r.map((c) => String(c)));
  } catch (err) {
    const status = (err as { code?: number }).code;
    const message = (err as Error).message ?? "";
    if (status === 400 && /unable to parse range/i.test(message)) {
      throw new ReviewTabMissingError();
    }
    throw err;
  }

  const map = new Map<string, ReviewTabMatch>();
  if (values.length === 0) return map;

  const headers = (values[0] ?? []).map((c) => c.trim().toLowerCase());
  const placeIdCol = headers.indexOf("google_place_id");
  const venueIdCol = headers.indexOf("venue_id");
  const nameCol = headers.indexOf("name");
  if (placeIdCol === -1) return map;

  // Data starts at row 2 of the sheet (index 1 in `values`); the
  // row_number we expose is 1-indexed and includes the header row.
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const placeId = (row[placeIdCol] ?? "").trim();
    if (!placeId) continue;
    map.set(placeId, {
      row_number: i + 1,
      venue_id: venueIdCol === -1 ? "" : (row[venueIdCol] ?? "").trim(),
      name: nameCol === -1 ? "" : (row[nameCol] ?? "").trim(),
    });
  }
  return map;
}

// ─── Master Reference vocab ──────────────────────────────────────

/**
 * Map of column header (lowercase) -> Set of non-empty values
 * sitting below it in the Master Reference tab. The header row is
 * row 2 in the spreadsheet (row 1 is operator notes); data starts
 * at row 3. Empty cells in any column are skipped so a stub column
 * with one allowed value doesn't accidentally produce a "vocab is
 * empty" surface.
 *
 * Columns expected per the canonical layout (matches
 * scripts/generate-configs.py):
 *   A=neighborhood, B=category, C=price_tier, D=vibe_tags,
 *   E=occasion_tags, F=stop_roles, G=time_blocks, H=outdoor_seating,
 *   I=reservation_difficulty, J=curated_by, K=reservation_platform.
 *
 * If the tab is missing OR has no header row OR has zero data rows,
 * this throws MasterReferenceUnavailableError so the route surfaces
 * a typed vocab_unavailable failure rather than silently using a
 * stale or empty taxonomy. There is NO fallback — Master Reference
 * is the only source of truth.
 */
export async function readMasterReferenceVocab(): Promise<
  Map<string, Set<string>>
> {
  const sheets = writeSheetsClient();
  const spreadsheetId = getSheetId();

  let values: string[][];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${MASTER_REFERENCE_TAB}!A2:K`,
    });
    values = (res.data.values ?? []).map((r) => r.map((c) => String(c)));
  } catch (err) {
    const status = (err as { code?: number }).code;
    const message = (err as Error).message ?? "";
    if (status === 400 && /unable to parse range/i.test(message)) {
      throw new MasterReferenceUnavailableError(
        `the tab named "${MASTER_REFERENCE_TAB}" was not found`,
      );
    }
    throw new MasterReferenceUnavailableError(message || "unknown error");
  }

  if (values.length === 0) {
    throw new MasterReferenceUnavailableError("the range A2:K is empty");
  }

  const headers = (values[0] ?? []).map((c) => c.trim().toLowerCase());
  if (headers.length === 0) {
    throw new MasterReferenceUnavailableError(
      "row 2 (headers) is empty; cannot infer column names",
    );
  }

  const vocab = new Map<string, Set<string>>();
  for (let col = 0; col < headers.length; col++) {
    const header = headers[col];
    if (!header) continue;
    const set = new Set<string>();
    for (let row = 1; row < values.length; row++) {
      const cell = (values[row][col] ?? "").trim();
      if (cell) set.add(cell);
    }
    // Only emit columns that actually have data — empty columns are
    // probably "reserved for future use" placeholders the operator
    // hasn't filled. The route treats absent vocab as "no constraint
    // on this field" rather than rejecting every value.
    if (set.size > 0) vocab.set(header, set);
  }

  if (vocab.size === 0) {
    throw new MasterReferenceUnavailableError(
      "no columns had any data rows; every field would have empty vocab",
    );
  }

  return vocab;
}
