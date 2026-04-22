// Google Sheets client for reading venue data directly from the
// curated Google Sheet. Used by the admin sync endpoint to pull
// venue data without requiring an xlsx export.
//
// Requires env vars:
//   GOOGLE_SHEETS_CLIENT_EMAIL — service account email
//   GOOGLE_SHEETS_PRIVATE_KEY  — service account private key (PEM)
//   GOOGLE_SHEET_ID            — the spreadsheet ID from the URL

import { google } from "googleapis";
import * as path from "path";
import * as fs from "fs";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

function getAuth() {
  // Prefer env vars (Vercel production). Fall back to the service
  // account JSON file in the repo for local dev.
  if (process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(
          /\\n/g,
          "\n"
        ),
      },
      scopes: SCOPES,
    });
  }

  // Local dev: load from the JSON credentials file
  const keyFile = path.resolve(
    process.cwd(),
    "docs/palate-composer-67baf1d883e3.json"
  );
  if (fs.existsSync(keyFile)) {
    return new google.auth.GoogleAuth({ keyFile, scopes: SCOPES });
  }

  throw new Error(
    "Google Sheets credentials not found. Set GOOGLE_SHEETS_CLIENT_EMAIL + GOOGLE_SHEETS_PRIVATE_KEY env vars, or place the service account JSON in docs/."
  );
}

/**
 * Read all venue rows from the Venues sheet. Skips the first 3 rows
 * (title, DB info, column headers) — returns data rows only.
 * Each row is a string array matching the sheet's column order.
 */
export async function getSheetData(): Promise<string[][]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Venues!A3:AH", // Row 3+ = data (row 1 = group headers, row 2 = column headers)
  });

  return response.data.values || [];
}

/**
 * Read the column headers from row 2 of the Venues sheet.
 * Used to verify column mapping matches expectations.
 */
export async function getSheetHeaders(): Promise<string[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Venues!A2:AH2",
  });

  return response.data.values?.[0] || [];
}
