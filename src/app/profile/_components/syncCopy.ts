// Single source of truth for all admin sync UI copy.
//
// Per the Phase 5a spec note: this surface is intentionally clinical-but-
// clear, NOT dry-and-funny. Operators making destructive decisions need
// precision over personality. BRAND_VOICE.md applies to the rest of the
// app; admin error states are an exception.

export const sectionHeaders = {
  title: "Venue sync",
  subtitle:
    'Pulls the latest venue data from the source Google Sheet and applies ' +
    'it to the database. The sheet is the source of truth — venues missing ' +
    'from the sheet are marked inactive in the app, not deleted.',
};

export const buttonLabels = {
  checkSource: "Check source",
  runPreview: "Run preview",
  applyChanges: (n: number) =>
    `Apply ${n.toLocaleString()} change${n === 1 ? "" : "s"}`,
  applyNoChanges: "No changes to apply",
  startOver: "Start over",
  overrideAssertions: "Override and apply anyway",
  confirmLargeChange: "I understand — apply anyway",
  cancel: "Cancel",
};

export const stateExplanations = {
  initial:
    'Click "Check source" to fetch the source sheet identity. Nothing is ' +
    "read or written yet.",
  preflightReady:
    'Source sheet identified. Click "Run preview" to compute the diff between ' +
    "the sheet and the database. Preview is read-only — no writes yet.",
  previewReady:
    "Preview computed. Review the changes and assertions below. Clicking " +
    '"Apply" writes to the database in a single atomic transaction.',
  applySuccess:
    "Sync complete. Changes are live. The full run is recorded in the " +
    "audit trail (use the CLI to inspect: `npm run import-venues -- show <id>`).",
  applyAssertionBlocked:
    "Sync was blocked because one or more sanity checks failed. Review the " +
    "failures below — these checks exist because they catch the kind of " +
    "mistake (wrong sheet, accidental edits) that bulk-imports normally amplify.",
  applyThresholdBlocked:
    "Sync was paused because the change set is large enough to warrant " +
    "explicit confirmation. Review the diff one more time. Mass changes " +
    "usually mean something is wrong upstream (wrong sheet, accidental " +
    "sheet edit, filter applied) rather than legitimate bulk updates.",
  applyFailed:
    "The apply failed and rolled back. The database is unchanged. The error " +
    "is below — check the audit trail or run the same sync via CLI for " +
    "comparison.",
};

export interface AssertionExplanation {
  whatItMeans: string;
  whatToDo: string;
}

/**
 * Per-assertion human guidance. Keys match the assertion `name` strings
 * emitted by `runAssertions` (`src/lib/venues/assertions.ts`). If a name
 * has no entry the UI falls back to just the detail string.
 */
export const assertionExplanations: Record<string, AssertionExplanation> = {
  "Tab exists": {
    whatItMeans:
      "The expected tab is no longer in the spreadsheet. Either it was renamed, " +
      "deleted, or this is the wrong spreadsheet entirely.",
    whatToDo:
      "Check the tabs listed in the failure detail. If the tab was renamed, " +
      "either rename it back or update VENUE_SHEET_TAB in src/lib/venues/config.ts " +
      "(engineer-only change).",
  },
  "Headers present": {
    whatItMeans:
      "Required columns (venue_id, name, latitude, longitude, neighborhood, active) " +
      "are missing from the header row. The importer cannot map sheet data to " +
      "database fields without these.",
    whatToDo:
      "Open the sheet and check row 2 — required headers may have been renamed, " +
      "deleted, or shifted. Restore them and re-run preview.",
  },
  "Row count band": {
    whatItMeans:
      'The sheet row count differs from the database active count by more than ' +
      "the allowed band (20% by default). This is the assertion most likely to " +
      'catch "wrong sheet connected" — for example, a 50-row test sheet against ' +
      "a 1,300-row production database.",
    whatToDo:
      "First: confirm GOOGLE_SHEET_ID points at the correct sheet. Second: " +
      "check the sheet for active filters that might be hiding rows. Third: " +
      "if a large legitimate change is happening (mass venue addition or " +
      "cleanup), override is appropriate — but read the diff carefully first.",
  },
  "Lat/lng coverage": {
    whatItMeans:
      "More than 10% of sheet rows are missing latitude or longitude. Venues " +
      "without coordinates cannot appear in itineraries.",
    whatToDo:
      "Filter the sheet to rows with empty lat/lng and fill them in. Common " +
      "cause: a paste that dropped the coordinate columns, or a recent batch " +
      "add that didn't include geocoding.",
  },
  "Canonical neighborhoods": {
    whatItMeans:
      "Some venues have neighborhood values that aren't in the canonical " +
      "neighborhood list. They will be imported but won't be selectable in " +
      "any itinerary picker.",
    whatToDo:
      "Either fix the values in the sheet to match canonical slugs (e.g., " +
      '"soho" not "Soho" or "south-of-houston"), or — if the neighborhood ' +
      "should genuinely be valid — add it to the Master Reference tab and " +
      "regenerate configs (`npm run generate-configs`) before retrying.",
  },
  "Sheet staleness": {
    whatItMeans:
      "The sheet hasn't been edited in over 90 days. This might mean you're " +
      "connected to an archived backup rather than the live working sheet.",
    whatToDo:
      "Confirm with whoever maintains venue data that this is the correct " +
      "live sheet. If the sheet is genuinely current and just hasn't needed " +
      "edits recently, override is reasonable.",
  },
};

export const overrideDialogCopy = {
  title: "Override sanity checks",
  warning:
    "You're about to apply an import that failed one or more sanity checks. " +
    "These checks exist to prevent destructive imports against the wrong " +
    "sheet or with corrupted data. Continue only if you have specifically " +
    "reviewed each failure and are confident the data is correct.",
  prompt: "Type OVERRIDE to confirm:",
  expectedValue: "OVERRIDE",
};

export const deactivationExplanation =
  "Deactivation marks the venue as inactive (active = false) — it does NOT " +
  "delete the row. Inactive venues are hidden from itineraries but the data " +
  "remains in the database. To restore a deactivated venue, add it back to " +
  "the sheet and re-sync.";

export const authFailedCopy = {
  unauthenticated:
    "You're signed out. Sign in to access the admin tools.",
  notAdmin:
    "Your account doesn't have admin access. Ask Adit or Reid to flip the " +
    "is_admin flag on your composer_users row.",
};

/**
 * Pattern-match common errors to actionable hints. Keep this list short
 * and conservative — wrong hints are worse than no hint.
 */
export function errorHints(errorMessage: string): string | null {
  if (/permission denied|RLS/i.test(errorMessage)) {
    return (
      "Likely cause: a Postgres function grant is missing. Check that " +
      "service_role has EXECUTE on composer_apply_venue_import."
    );
  }
  if (/column .+ does not exist|does not exist in the table/i.test(errorMessage)) {
    return (
      "Likely cause: schema drift. The TS column constants reference a " +
      "column not present in composer_venues_v2. Engineer required."
    );
  }
  if (/fetch failed|network|ECONNREFUSED/i.test(errorMessage)) {
    return (
      "Likely cause: transient network or Supabase unavailability. Retry. " +
      "If persistent, check Supabase status page."
    );
  }
  return null;
}
