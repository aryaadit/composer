// Sheets + Drive API wrapper for the venue importer.
//
// Owns:
//   - service-account auth (env vars or local JSON key)
//   - reading the NYC Venues tab (headers + data rows)
//   - fetching sheet identity for Layer 1 safety (title, last modified)
//
// Venue-importer-specific by design. The previous shared helper
// (src/lib/google-sheets.ts) was deleted in Phase 5b — its only consumer
// was the pre-cutover admin route, which now uses this module instead.

import * as fs from "fs";
import * as path from "path";
import { google, type sheets_v4 } from "googleapis";

import {
  VENUE_SHEET_DATA_RANGE,
  VENUE_SHEET_HEADER_RANGE,
  VENUE_SHEET_TAB,
} from "./config";
import type { SheetMetadata } from "./types";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

const HEADER_RANGE = `${VENUE_SHEET_TAB}!${VENUE_SHEET_HEADER_RANGE}`;
const DATA_RANGE = `${VENUE_SHEET_TAB}!${VENUE_SHEET_DATA_RANGE}`;

/**
 * Resolve the sheet ID from `GOOGLE_SHEET_ID`. Throws immediately if
 * unset — the operator should never accidentally point the importer at
 * a different sheet than they think they are. Sheet identity is then
 * confirmed visually in the dry-run output (Layer 1 safety).
 */
export function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) {
    throw new Error("GOOGLE_SHEET_ID is required. Set it in .env.local.");
  }
  return id;
}

function getAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  if (process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
      scopes: SCOPES,
    });
  }

  // Local-dev fallback: service account JSON checked into docs/.
  const keyFile = path.resolve(
    process.cwd(),
    "docs/palate-composer-67baf1d883e3.json"
  );
  if (fs.existsSync(keyFile)) {
    return new google.auth.GoogleAuth({ keyFile, scopes: SCOPES });
  }

  throw new Error(
    "Google Sheets credentials not found. Set GOOGLE_SHEETS_CLIENT_EMAIL + GOOGLE_SHEETS_PRIVATE_KEY in .env.local."
  );
}

function sheetsClient(): sheets_v4.Sheets {
  return google.sheets({ version: "v4", auth: getAuth() });
}

/**
 * Read the NYC Venues tab. Row 2 is headers, row 3+ is data.
 * Headers are normalized (trimmed, lowercased) so downstream code can
 * key off canonical column names regardless of sheet casing.
 */
export async function readSheetRows(): Promise<{
  headers: string[];
  rows: string[][];
}> {
  const sheets = sheetsClient();
  const spreadsheetId = getSheetId();

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: HEADER_RANGE,
  });
  const headers = ((headerRes.data.values ?? [[]])[0] ?? []).map((h) =>
    String(h).trim().toLowerCase()
  );

  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: DATA_RANGE,
  });
  const rows = (dataRes.data.values ?? []).map((r) => r.map((c) => String(c)));

  return { headers, rows };
}

/**
 * List the tab titles in the spreadsheet. Used by the tab-existence
 * sanity assertion so a renamed tab fails loudly with the available
 * names instead of producing a confusing "0 rows read" downstream.
 *
 * Costs one API call per dry-run/apply — negligible.
 */
export async function fetchTabNames(): Promise<string[]> {
  const sheets = sheetsClient();
  const spreadsheetId = getSheetId();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const titles =
    meta.data.sheets
      ?.map((s) => s.properties?.title)
      .filter((t): t is string => typeof t === "string") ?? [];
  return titles;
}

/**
 * Fetch identity metadata for the sheet. The Drive API call is best-effort
 * — if the Drive API isn't enabled on the service account's project, the
 * call fails and we proceed without modifiedTime/modifiedBy. Sheet identity
 * (title + ID) and the row count are guaranteed.
 */
export async function fetchSheetMetadata(
  rowCount: number,
  sampleNeighborhoods: string[]
): Promise<SheetMetadata> {
  const spreadsheetId = getSheetId();

  let title = "(unknown)";
  try {
    const sheets = sheetsClient();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "properties.title",
    });
    title = meta.data.properties?.title ?? title;
  } catch (err) {
    console.warn(
      `[sheet] Could not fetch spreadsheet title: ${(err as Error).message}`
    );
  }

  let modifiedTime: string | undefined;
  let modifiedBy: string | undefined;
  try {
    const drive = google.drive({ version: "v3", auth: getAuth() });
    const fileMeta = await drive.files.get({
      fileId: spreadsheetId,
      fields: "modifiedTime,lastModifyingUser",
    });
    modifiedTime = fileMeta.data.modifiedTime ?? undefined;
    modifiedBy =
      fileMeta.data.lastModifyingUser?.emailAddress ??
      fileMeta.data.lastModifyingUser?.displayName ??
      undefined;
  } catch (err) {
    console.warn(
      `[sheet] Drive API unavailable (modifiedTime/modifiedBy will be omitted): ${(err as Error).message}`
    );
  }

  return {
    spreadsheetId,
    title,
    modifiedTime,
    modifiedBy,
    rowCount,
    sampleNeighborhoods,
  };
}
