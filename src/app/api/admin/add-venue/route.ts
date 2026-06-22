// POST /api/admin/add-venue — admin-only "draft a new venue and stage
// it for human review" endpoint.
//
// Two actions:
//   { action: "preview", input: <maps url or place_id> }
//     -> resolves the place_id, fetches Google Places details,
//        checks composer_venues_v2 for an existing google_place_id
//        (duplicate guard), maps deterministic fields, lets Gemini
//        draft taxonomy + editorial fields, validates Gemini's
//        output against the generated TS taxonomy, computes the
//        nearest-3 neighborhood candidates by centroid distance,
//        and returns the proposed row + diagnostic flags. Writes
//        nothing.
//
//   { action: "apply", row: <header-keyed row from preview> }
//     -> appends the row to the "NYC New Venues Review" staging
//        tab, after ensuring the tab exists and its header row is
//        populated with the canonical NYC Venues column order.
//        Never writes to the NYC Venues tab itself; review and
//        promotion happen in the sheet by the founders.
//
// Auth: inline requireAdmin(), same shape as
// src/app/api/admin/sync-venues/route.ts:50-67. Same composer_users
// is_admin check.
//
// Sheets writes use the dedicated write-scoped client in
// src/lib/venues/sheet-write.ts; the read-only importer module is
// untouched. See that module's header for the provisioning
// checklist (service account as Editor on the spreadsheet, the
// staging tab itself, etc.). On any 403 the route returns a typed
// "sheet_write_forbidden" failure so the admin panel surfaces the
// exact remediation step without the operator reading server logs.

import { NextResponse } from "next/server";

import { NEIGHBORHOOD_GROUPS } from "@/config/generated/neighborhoods";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase";
import {
  fetchPlaceDetails,
  textSearchPlaces,
  type PlaceData,
} from "@/lib/google-places";
import { callGeminiJSON } from "@/lib/claude";
import {
  extractMapsContext,
  extractPlaceIdFromInput,
  placesToRow,
  resolveMapsShortlink,
  type DeterministicRow,
} from "@/lib/venues/places-to-row";
import {
  ADD_VENUE_REVIEW_TAB,
  VENUE_SHEET_TAB,
} from "@/lib/venues/config";
import {
  MasterReferenceUnavailableError,
  ReviewTabMissingError,
  SheetWriteFailedError,
  SheetWriteForbiddenError,
  appendReviewTabRow,
  computeNextVenueId,
  readCanonicalHeaders,
  readMasterReferenceVocab,
  readNycVenuesPlaceIdMap,
  readReviewTabHeaders,
  readReviewTabPlaceIdMap,
  reviewTabExists,
  writeReviewTabHeaders,
} from "@/lib/venues/sheet-write";

// ─── Types ───────────────────────────────────────────────────────

type AddVenueRequest =
  | { action: "preview"; input: string }
  | { action: "apply"; row: Record<string, string> };

interface AuthOk {
  ok: true;
  userId: string;
}

interface AuthFailed {
  ok: false;
  kind: "auth_failed";
  reason: "unauthenticated" | "not_admin";
}

type AuthResult = AuthOk | AuthFailed;

/** The place_id already lives in the NYC Venues tab. The operator
 *  should verify the existing row before trying to re-add. The
 *  "active" field is intentionally not carried — the sheet is the
 *  source of truth for what exists, not for whether it's currently
 *  selectable by scoring (that's the DB's active column). */
interface DuplicateInCatalogResponse {
  ok: false;
  kind: "duplicate_in_catalog";
  venue_id: string;
  name: string;
}

/** The place_id is already staged in the NYC New Venues Review tab.
 *  Surfaces the row number so the operator can jump straight to it
 *  in the spreadsheet. */
interface DuplicateInReviewResponse {
  ok: false;
  kind: "duplicate_in_review";
  row_number: number;
  venue_id: string;
  name: string;
}

interface PreviewSuccess {
  ok: true;
  kind: "preview";
  /** Lowercase header-keyed row. The apply action expects this same
   *  shape back. */
  row: Record<string, string>;
  /** Proposed venue_id at staging time (highest v{NNNN} across both
   *  tabs + 1, monotonic). Null when the read failed; the UI then
   *  surfaces the typed `id_compute_error` flag instead. */
  proposed_venue_id: string | null;
  flags: {
    dropped: Array<{ field: string; value: string; reason: string }>;
    low_confidence: string[];
    neighborhood_candidates: Array<{ slug: string; label: string; km: number }>;
    /** Human-readable explanation when proposed_venue_id is null
     *  (sheet read failure). Null when the id was computed. */
    id_compute_error: string | null;
  };
  place_summary: {
    name: string;
    formatted_address: string;
    google_place_id: string;
    google_maps_uri: string;
  };
}

interface PreviewFailedResponse {
  ok: false;
  kind: "preview_failed";
  reason:
    | "missing_input"
    | "unresolved_place_id"
    | "places_lookup_failed"
    | "places_lookup_missing_key"
    | "catalog_unavailable";
  message: string;
}

interface VocabUnavailableResponse {
  ok: false;
  kind: "vocab_unavailable";
  message: string;
}

interface ApplySuccessResponse {
  ok: true;
  kind: "apply_success";
  sheet_tab: string;
  row_number: number;
  spreadsheet_url: string | null;
  /** venue_id that was actually written into the appended row. Empty
   *  string when the apply-time recomputation failed and the column
   *  was left blank — in that case the operator assigns the id at
   *  promotion time. */
  venue_id_written: string;
}

interface ApplyFailedResponse {
  ok: false;
  kind:
    | "apply_failed"
    | "sheet_write_forbidden"
    | "review_tab_missing"
    | "headers_unavailable";
  message: string;
}

interface InvalidRequestResponse {
  ok: false;
  kind: "invalid_request";
  error: string;
}

type AddVenueResponse =
  | PreviewSuccess
  | PreviewFailedResponse
  | VocabUnavailableResponse
  | DuplicateInCatalogResponse
  | DuplicateInReviewResponse
  | ApplySuccessResponse
  | ApplyFailedResponse
  | AuthFailed
  | InvalidRequestResponse;

// ─── Auth ────────────────────────────────────────────────────────

async function requireAdmin(): Promise<AuthResult> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, kind: "auth_failed", reason: "unauthenticated" };
  }
  const { data } = await supabase
    .from("composer_users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!data?.is_admin) {
    return { ok: false, kind: "auth_failed", reason: "not_admin" };
  }
  return { ok: true, userId: user.id };
}

function jsonResponse(body: AddVenueResponse, status?: number): NextResponse {
  return NextResponse.json(body, { status: status ?? (body.ok ? 200 : 400) });
}

function invalidRequest(error: string): NextResponse {
  return jsonResponse({ ok: false, kind: "invalid_request", error }, 400);
}

// ─── POST entrypoint ─────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth.ok !== true) {
    return jsonResponse(
      auth,
      auth.reason === "unauthenticated" ? 401 : 403,
    );
  }

  let body: AddVenueRequest;
  try {
    body = (await request.json()) as AddVenueRequest;
  } catch {
    return invalidRequest("Request body is not valid JSON");
  }

  if (!body || typeof body !== "object" || !("action" in body)) {
    return invalidRequest("Missing 'action' field");
  }

  switch (body.action) {
    case "preview":
      return handlePreview(body.input);
    case "apply":
      return handleApply(body.row);
    default:
      return invalidRequest(
        `Unknown action: ${(body as { action?: string }).action ?? "(none)"}`,
      );
  }
}

// ─── Preview ─────────────────────────────────────────────────────

async function handlePreview(rawInput: unknown): Promise<NextResponse> {
  if (typeof rawInput !== "string" || rawInput.trim().length === 0) {
    return jsonResponse({
      ok: false,
      kind: "preview_failed",
      reason: "missing_input",
      message: "Paste a Google Maps link or a Places place_id.",
    });
  }

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return jsonResponse({
      ok: false,
      kind: "preview_failed",
      reason: "places_lookup_missing_key",
      message:
        "GOOGLE_PLACES_API_KEY is not set. Provision the key in .env.local " +
        "(see CLAUDE.md Environment Variables).",
    });
  }

  // Resolve to a ChIJ-form place_id via this chain:
  //   (a) extract directly from the input (bare id, ?q=place_id:ChIJ...,
  //       ?place_id=ChIJ...)
  //   (b) if the input is a maps.app.goo.gl shortlink, follow one
  //       redirect to the underlying URL and retry the extractor
  //   (c) if still no ChIJ id, fall back to Places Text Search using
  //       the URL's name segment + a 150m locationBias around its
  //       pin coordinates (!3d/!4d, fall back to @lat,lng). Sanity
  //       guard: refuse the top candidate when it's >250m from the
  //       URL coords, because the same-name venue across town is the
  //       most common Text Search failure mode.
  //
  // Why the fallback exists: a standard Maps share link (and every
  // maps.app.goo.gl shortlink) carries a `!1s0x...:0x...` hex feature
  // ID and a `/g/...` MID, neither of which Places v1 accepts as a
  // place_id. The old code used to feed the hex to `places/<id>` and
  // got back null silently.
  const trimmedInput = rawInput.trim();
  let placeId = extractPlaceIdFromInput(trimmedInput);
  let resolvedUrl = trimmedInput;
  if (!placeId && /^https:\/\/maps\.app\.goo\.gl\//.test(trimmedInput)) {
    const resolved = await resolveMapsShortlink(trimmedInput);
    if (resolved) {
      resolvedUrl = resolved;
      placeId = extractPlaceIdFromInput(resolved);
    }
  }
  if (!placeId) {
    const ctx = extractMapsContext(resolvedUrl);
    if (!ctx.name || ctx.lat == null || ctx.lng == null) {
      return jsonResponse({
        ok: false,
        kind: "preview_failed",
        reason: "unresolved_place_id",
        message:
          "No ChIJ place_id, name, or coordinates could be extracted from " +
          "that input. Paste a full Google Maps link (the URL must reach " +
          'a place page, e.g. ".../maps/place/Name/@lat,lng/data=!3d...!4d...").',
      });
    }
    const candidates = await textSearchPlaces({
      textQuery: ctx.name,
      locationBias: {
        latitude: ctx.lat,
        longitude: ctx.lng,
        radiusMeters: 150,
      },
    });
    if (candidates.length === 0) {
      return jsonResponse({
        ok: false,
        kind: "preview_failed",
        reason: "unresolved_place_id",
        message:
          `Text Search returned no candidates for "${ctx.name}" within 150m ` +
          "of the URL coordinates. The venue may have been delisted from " +
          "Google. Confirm it still appears in Maps before re-trying.",
      });
    }
    const top = candidates[0];
    const distanceMeters =
      haversineKm(ctx.lat, ctx.lng, top.location.latitude, top.location.longitude) *
      1000;
    if (distanceMeters > 250) {
      return jsonResponse({
        ok: false,
        kind: "preview_failed",
        reason: "unresolved_place_id",
        message:
          `Text Search returned "${top.displayName.text}" but it is ` +
          `${Math.round(distanceMeters)}m from the URL coordinates. ` +
          "Refusing to use a likely-wrong place. Open the link in Maps " +
          "and confirm the venue, or paste a place_id directly.",
      });
    }
    placeId = top.id;
  }

  // Sheet-first dedup. The DB lags the sheet (a venue lives in NYC
  // Venues immediately on import, vs DB rows materialize only after
  // a sync-venues apply). Checking the sheet means a re-submission
  // caught here matches what the founders see in the spreadsheet.
  // The review tab dedup is the secondary guard: a place_id staged
  // by a previous preview shouldn't be staged again.
  let catalogMatch: { venue_id: string; name: string } | undefined;
  let reviewMatch:
    | { row_number: number; venue_id: string; name: string }
    | undefined;
  try {
    const catalogMap = await readNycVenuesPlaceIdMap();
    catalogMatch = catalogMap.get(placeId);
  } catch (err) {
    console.error("[add-venue] catalog dedup read failed:", err);
    return jsonResponse({
      ok: false,
      kind: "preview_failed",
      reason: "catalog_unavailable",
      message:
        `Could not read the "${VENUE_SHEET_TAB}" tab for dedup check. ` +
        "Confirm the tab exists and the service account has read access.",
    });
  }
  if (catalogMatch) {
    return jsonResponse({
      ok: false,
      kind: "duplicate_in_catalog",
      venue_id: catalogMatch.venue_id,
      name: catalogMatch.name,
    });
  }
  // Review tab dedup. Missing-tab is non-fatal at preview time — it
  // just means nothing has been staged yet; the apply path will
  // surface the "create the tab" remediation when it actually
  // matters. Other read failures bubble up as catalog_unavailable
  // because the operator should fix sheet access before staging.
  try {
    const reviewMap = await readReviewTabPlaceIdMap();
    reviewMatch = reviewMap.get(placeId);
  } catch (err) {
    if (err instanceof ReviewTabMissingError) {
      reviewMatch = undefined;
    } else {
      console.error("[add-venue] review-tab dedup read failed:", err);
      return jsonResponse({
        ok: false,
        kind: "preview_failed",
        reason: "catalog_unavailable",
        message:
          `Could not read the "${ADD_VENUE_REVIEW_TAB}" tab for dedup check.`,
      });
    }
  }
  if (reviewMatch) {
    return jsonResponse({
      ok: false,
      kind: "duplicate_in_review",
      row_number: reviewMatch.row_number,
      venue_id: reviewMatch.venue_id,
      name: reviewMatch.name,
    });
  }

  // Master Reference vocab. SINGLE source of truth for slug-shaped
  // fields. If the read fails the preview fails too — there is no
  // fallback to generated-TS taxonomy by design (the route would
  // otherwise drift from the sheet).
  let vocab: Map<string, Set<string>>;
  try {
    vocab = await readMasterReferenceVocab();
  } catch (err) {
    const message =
      err instanceof MasterReferenceUnavailableError
        ? err.message
        : (err as Error).message;
    console.error("[add-venue] master reference read failed:", err);
    return jsonResponse({
      ok: false,
      kind: "vocab_unavailable",
      message,
    });
  }

  // Fetch Google Places details, INCLUDING reviews. Review text is
  // used as drafter prompt context only (see draftEditorialFields)
  // and is never persisted to the sheet, DB, or response. The
  // operator sees the canonical PlaceData via the preview row but
  // never the raw review strings.
  const place = await fetchPlaceDetails(placeId, { withReviews: true });
  if (!place) {
    return jsonResponse({
      ok: false,
      kind: "preview_failed",
      reason: "places_lookup_failed",
      message:
        "Google Places returned no data for that place_id. The ID may be " +
        "stale or the venue may have been removed from Google.",
    });
  }

  // Deterministic fields.
  const today = todayISO();
  const deterministic = placesToRow(place, { placeId, today });

  // Gemini drafts the editorial + taxonomy fields, given the
  // Master Reference vocab as hard constraints.
  const drafted = await draftEditorialFields(place, deterministic, vocab);

  // Validate Gemini output against the Master Reference vocab.
  const dropped: Array<{ field: string; value: string; reason: string }> = [];
  const cleaned = filterDraftedTaxonomy(drafted, dropped, vocab);

  // Compose the row map.
  const row: Record<string, string> = { ...deterministic.fields };
  applyDraftedToRow(row, cleaned);
  row["notes"] = "";

  // Propose a venue_id by scanning the union of both tabs and
  // picking the next monotonic vNNNN. Apply will recompute against
  // the same union immediately before append so two simultaneous
  // applies can't land the same id (narrow race window). On read
  // failure we leave the column blank and surface a typed flag —
  // proposing a bogus low id would collide silently with an
  // existing row at promotion time.
  let proposed_venue_id: string | null = null;
  let id_compute_error: string | null = null;
  try {
    proposed_venue_id = await computeNextVenueId();
  } catch (err) {
    console.error("[add-venue] computeNextVenueId failed at preview:", err);
    id_compute_error =
      "Could not compute venue_id — assign at promotion.";
  }
  row["venue_id"] = proposed_venue_id ?? "";

  // Low-confidence flags: any field in LOW_CONFIDENCE_FIELDS that came
  // back blank after validation. That covers the taxonomy fields plus
  // reservation_difficulty and quality_score, which the route never
  // invents, so a blank there is surfaced for manual fill before promotion.
  const low_confidence: string[] = [];
  for (const f of LOW_CONFIDENCE_FIELDS) {
    if (!row[f] || row[f].trim().length === 0) low_confidence.push(f);
  }

  // Nearest-3 neighborhood candidates by centroid distance.
  const neighborhood_candidates = await nearestNeighborhoodCandidates(
    deterministic,
    place,
  );

  const placeName = (place.displayName as { text?: string } | undefined)?.text ?? "";
  return jsonResponse({
    ok: true,
    kind: "preview",
    row,
    proposed_venue_id,
    flags: {
      dropped,
      low_confidence,
      neighborhood_candidates,
      id_compute_error,
    },
    place_summary: {
      name: placeName,
      formatted_address: String(place.formattedAddress ?? ""),
      google_place_id: placeId,
      // Mirror the maps_url column the row writes: the canonical
      // place_id form, not the share-link shape Places returns.
      google_maps_uri: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    },
  });
}

// ─── Apply ───────────────────────────────────────────────────────

async function handleApply(
  rawRow: unknown,
): Promise<NextResponse> {
  if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
    return invalidRequest("Missing or invalid 'row'");
  }
  const row: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawRow as Record<string, unknown>)) {
    row[String(k).toLowerCase()] = typeof v === "string" ? v : String(v ?? "");
  }

  // Re-guard against duplicate place_id. The previewed row carries
  // google_place_id; re-check both the live catalog tab and the
  // review tab before appending so two admins clicking Apply within
  // the same window can't both land the same row. Same sheet-first
  // policy as preview.
  const placeId = row["google_place_id"];
  if (placeId) {
    try {
      const catalogMap = await readNycVenuesPlaceIdMap();
      const match = catalogMap.get(placeId);
      if (match) {
        return jsonResponse({
          ok: false,
          kind: "duplicate_in_catalog",
          venue_id: match.venue_id,
          name: match.name,
        });
      }
    } catch (err) {
      console.error("[add-venue] apply-time catalog re-check failed:", err);
      return jsonResponse({
        ok: false,
        kind: "apply_failed",
        message:
          `Could not re-verify against "${VENUE_SHEET_TAB}" before appending. ` +
          "Try again, and confirm service account read access if the issue persists.",
      });
    }
    try {
      const reviewMap = await readReviewTabPlaceIdMap();
      const match = reviewMap.get(placeId);
      if (match) {
        return jsonResponse({
          ok: false,
          kind: "duplicate_in_review",
          row_number: match.row_number,
          venue_id: match.venue_id,
          name: match.name,
        });
      }
    } catch (err) {
      if (!(err instanceof ReviewTabMissingError)) {
        // Real read failure (not "tab doesn't exist yet"). The
        // tab-existence check below will surface the missing-tab
        // case with its own structured response.
        console.error("[add-venue] apply-time review re-check failed:", err);
      }
    }
  }

  // Confirm the staging tab exists. The route surfaces a typed
  // "review_tab_missing" so the panel's error block names the exact
  // remediation step instead of a generic Sheets error.
  try {
    const exists = await reviewTabExists();
    if (!exists) {
      return jsonResponse({
        ok: false,
        kind: "review_tab_missing",
        message:
          `The "${ADD_VENUE_REVIEW_TAB}" tab does not exist. Create it in ` +
          `the spreadsheet (the row-2 headers will be auto-populated from ` +
          `"${VENUE_SHEET_TAB}" row 2 on first apply).`,
      });
    }
  } catch (err) {
    if (err instanceof SheetWriteForbiddenError) {
      return jsonResponse({
        ok: false,
        kind: "sheet_write_forbidden",
        message: err.message,
      });
    }
    console.error("[add-venue] reviewTabExists check failed:", err);
    return jsonResponse({
      ok: false,
      kind: "apply_failed",
      message:
        "Could not list spreadsheet tabs. Check service account access.",
    });
  }

  // Read canonical NYC Venues headers, ensure the staging tab's
  // header row matches.
  let canonicalHeaders: string[];
  try {
    canonicalHeaders = await readCanonicalHeaders();
  } catch (err) {
    console.error("[add-venue] failed reading canonical headers:", err);
    return jsonResponse({
      ok: false,
      kind: "headers_unavailable",
      message:
        `Could not read the column headers from "${VENUE_SHEET_TAB}". ` +
        "Confirm the tab exists and the service account has read access.",
    });
  }
  if (canonicalHeaders.length === 0) {
    return jsonResponse({
      ok: false,
      kind: "headers_unavailable",
      message: `Row 2 of "${VENUE_SHEET_TAB}" is empty; cannot infer column order.`,
    });
  }

  try {
    const existingHeaders = await readReviewTabHeaders();
    if (existingHeaders.length === 0) {
      await writeReviewTabHeaders(canonicalHeaders);
    }
  } catch (err) {
    if (err instanceof ReviewTabMissingError) {
      return jsonResponse({
        ok: false,
        kind: "review_tab_missing",
        message: err.message,
      });
    }
    if (err instanceof SheetWriteForbiddenError) {
      return jsonResponse({
        ok: false,
        kind: "sheet_write_forbidden",
        message: err.message,
      });
    }
    console.error("[add-venue] failed reading/writing review tab headers:", err);
    return jsonResponse({
      ok: false,
      kind: "apply_failed",
      message: "Could not read or initialize the review tab header row.",
    });
  }

  // Recompute the venue_id IMMEDIATELY before append. Recomputing
  // here (vs trusting the value preview proposed) narrows the
  // race window where two simultaneous applies could land on the
  // same id — both reads run against the live sheet state.
  // Failure mode: leave column A blank and surface the empty
  // venue_id_written on the response; the operator assigns at
  // promotion. Never propose a low id under failure, that would
  // collide silently with an existing row.
  let venue_id_written = "";
  try {
    venue_id_written = await computeNextVenueId();
    row["venue_id"] = venue_id_written;
  } catch (err) {
    console.error("[add-venue] computeNextVenueId failed at apply:", err);
    row["venue_id"] = "";
  }

  // Project the lowercase row map onto the canonical header order.
  // venue_id is column A in NYC Venues, so the venue_id we just
  // computed lands at position 0 of the appended cells array.
  const cells = canonicalHeaders.map((h) => row[h.trim().toLowerCase()] ?? "");

  try {
    const { rowNumber } = await appendReviewTabRow(cells);
    const spreadsheetUrl = process.env.GOOGLE_SHEET_ID
      ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`
      : null;
    return jsonResponse({
      ok: true,
      kind: "apply_success",
      sheet_tab: ADD_VENUE_REVIEW_TAB,
      row_number: rowNumber,
      spreadsheet_url: spreadsheetUrl,
      venue_id_written,
    });
  } catch (err) {
    if (err instanceof SheetWriteForbiddenError) {
      return jsonResponse({
        ok: false,
        kind: "sheet_write_forbidden",
        message: err.message,
      });
    }
    if (err instanceof ReviewTabMissingError) {
      return jsonResponse({
        ok: false,
        kind: "review_tab_missing",
        message: err.message,
      });
    }
    if (err instanceof SheetWriteFailedError) {
      return jsonResponse({
        ok: false,
        kind: "apply_failed",
        message: err.message,
      });
    }
    console.error("[add-venue] append failed:", err);
    return jsonResponse({
      ok: false,
      kind: "apply_failed",
      message:
        "Sheets append failed for an unexpected reason. Check server logs.",
    });
  }
}

// ─── Gemini drafting ─────────────────────────────────────────────
//
// Master Reference vocab is the SINGLE source of truth for every
// slug-shaped field. The set of fields below is the intersection of
// what Gemini drafts and what the Master Reference tab tracks
// (matches scripts/generate-configs.py column mapping). Range-only
// numeric fields (duration_hours, quality_score) are not slug-shaped
// so they don't have a vocab column; they get a sanity range check
// in filterDraftedTaxonomy.

/** Slug-shaped scalar fields. The Master Reference column header
 *  (lowercase) must match these keys for the vocab lookup to work. */
const SLUG_SCALAR_FIELDS = [
  "neighborhood",
  "category",
  "reservation_platform",
] as const;

/** Slug-shaped array fields. Each value in the array is checked
 *  against the same column's vocab set. */
const SLUG_ARRAY_FIELDS = [
  "vibe_tags",
  "occasion_tags",
  "stop_roles",
] as const;

const LOW_CONFIDENCE_FIELDS = [
  "neighborhood",
  "category",
  "vibe_tags",
  "occasion_tags",
  "stop_roles",
  "curation_note",
  "signature_order",
  "reservation_difficulty",
  "quality_score",
];

interface DraftedFields {
  neighborhood?: string;
  category?: string;
  vibe_tags?: string[];
  occasion_tags?: string[];
  stop_roles?: string[];
  duration_hours?: string | number;
  reservation_difficulty?: string | number;
  reservation_platform?: string;
  reservation_url?: string;
  resy_slug?: string;
  happy_hour?: string;
  quality_score?: string | number;
  awards?: string;
  curation_note?: string;
  signature_order?: string;
}

const DRAFTER_SYSTEM_PROMPT = `You are the voice of Composer, a curated NYC date-night app. Founders Adit and Reid hand-pick every venue; your job is to draft taxonomy slugs and short editorial copy for a new candidate venue, in their voice.

Voice rules (NON-NEGOTIABLE):
- Sentence case. No Title Case.
- Short, declarative. "This is the move" not "you might enjoy".
- Never use em dashes. Use commas or periods.
- No exclamation marks. No hedging.
- Banned phrases: "hidden gem", "perfect for", "great spot", "go-to", "amazing", "wonderful".
- curation_note: 1-2 sentences, observational, no clichés.
- signature_order: a short phrase or dish name. Lowercase except proper nouns. Optional.

Review snippets (SIGNAL ONLY):
- When the prompt includes user-review snippets, treat them as evidence about vibe, occasion, what the place is known for, and which dish to flag as signature_order.
- DO NOT quote or paraphrase review wording. The note must be original prose in Composer's voice.
- Reviews are noisy: weight repeat signals (multiple reviews mentioning the same thing) over single-reviewer claims. Ignore complaints about service / pricing unless they reshape what the place IS.

You will receive Google Places facts and a list of allowed slugs for each taxonomy field. Pick ONLY from the allowed list per field. If unsure, leave the field blank. Return STRICT JSON with these keys (any may be omitted): neighborhood, category, vibe_tags, occasion_tags, stop_roles, duration_hours, reservation_difficulty, reservation_platform, reservation_url, resy_slug, happy_hour, quality_score, awards, curation_note, signature_order.`;

const REVIEW_SNIPPET_COUNT = 5;
const REVIEW_SNIPPET_MAX_CHARS = 300;

interface ReviewLike {
  text?: { text?: unknown } | unknown;
  rating?: unknown;
}

/**
 * Extract up to REVIEW_SNIPPET_COUNT review text snippets from the
 * Places response, truncating each to REVIEW_SNIPPET_MAX_CHARS.
 * Returns an empty array when reviews are absent (the default for
 * fetchPlaceDetails without withReviews, or for venues with zero
 * reviews). Pure transformation; nothing is persisted by this
 * function or its callers beyond the lifetime of the request.
 */
function extractReviewSnippets(place: PlaceData): string[] {
  const reviews = place.reviews;
  if (!Array.isArray(reviews)) return [];
  const out: string[] = [];
  for (const rev of reviews as ReviewLike[]) {
    if (out.length >= REVIEW_SNIPPET_COUNT) break;
    const textBlock = rev.text;
    const text =
      typeof textBlock === "object" &&
      textBlock !== null &&
      typeof (textBlock as { text?: unknown }).text === "string"
        ? (textBlock as { text: string }).text
        : typeof textBlock === "string"
          ? textBlock
          : "";
    const trimmed = text.trim();
    if (!trimmed) continue;
    out.push(
      trimmed.length > REVIEW_SNIPPET_MAX_CHARS
        ? `${trimmed.slice(0, REVIEW_SNIPPET_MAX_CHARS - 1).trimEnd()}…`
        : trimmed,
    );
  }
  return out;
}

function vocabLine(
  label: string,
  vocab: Map<string, Set<string>>,
  key: string,
): string {
  const set = vocab.get(key);
  if (!set || set.size === 0) return `- ${label}: (no constraint — vocab empty)`;
  const values = [...set].sort();
  return `- ${label}: ${values.join(", ")}`;
}

function buildDrafterPrompt(
  place: PlaceData,
  deterministic: DeterministicRow,
  vocab: Map<string, Set<string>>,
): string {
  const displayName = (place.displayName as { text?: string } | undefined)?.text;
  const summary =
    (place.editorialSummary as { text?: string } | undefined)?.text ?? "";
  const types = Array.isArray(place.types)
    ? (place.types as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const reviewSnippets = extractReviewSnippets(place);
  const reviewBlock =
    reviewSnippets.length === 0
      ? "(no reviews available)"
      : reviewSnippets.map((s, i) => `  [${i + 1}] ${s}`).join("\n");
  return [
    `Venue: ${displayName ?? "(unknown)"}`,
    `Address: ${String(place.formattedAddress ?? "")}`,
    `Google rating: ${place.rating ?? "n/a"} (${place.userRatingCount ?? 0} reviews)`,
    `Google types: ${types.join(", ") || "n/a"}`,
    `Editorial summary (Google): ${summary || "n/a"}`,
    `Schedule (parsed): ${JSON.stringify(deterministic.schedule)}`,
    `Pre-computed time_blocks: ${deterministic.timeBlocks.join(",") || "(none)"}`,
    "",
    `Top reviews (signal only — do NOT quote, paraphrase, or repeat phrases):`,
    reviewBlock,
    "",
    "Allowed values per field (from the Master Reference tab):",
    vocabLine("neighborhood", vocab, "neighborhood"),
    vocabLine("category", vocab, "category"),
    `${vocabLine("vibe_tags (array)", vocab, "vibe_tags")}`,
    `${vocabLine("occasion_tags (array)", vocab, "occasion_tags")}`,
    `${vocabLine("stop_roles (array)", vocab, "stop_roles")}`,
    vocabLine("reservation_platform", vocab, "reservation_platform"),
    vocabLine("reservation_difficulty", vocab, "reservation_difficulty"),
    `- duration_hours: number (e.g. 1.5, 2)`,
    `- quality_score: integer 0-10`,
    "",
    "Pick ONLY from the allowed list per field. If unsure, omit the field.",
    "Return strict JSON. No prose, no markdown.",
  ].join("\n");
}

async function draftEditorialFields(
  place: PlaceData,
  deterministic: DeterministicRow,
  vocab: Map<string, Set<string>>,
): Promise<DraftedFields> {
  const prompt = buildDrafterPrompt(place, deterministic, vocab);
  const result = await callGeminiJSON<DraftedFields>(prompt, {
    systemInstruction: DRAFTER_SYSTEM_PROMPT,
  });
  return result ?? {};
}

/**
 * Validate Gemini's draft against the Master Reference vocab. Every
 * slug-shaped field's value (scalar or array element) must appear in
 * its column's vocab set. Misses drop into `dropped[]` with a
 * `not in master reference <column>` reason so the operator can spot
 * whether Gemini hallucinated or whether Master Reference is missing
 * the slug.
 *
 * Fields with no matching vocab column (the operator hasn't defined
 * a list yet) get a passthrough — see comment on
 * readMasterReferenceVocab for the "no constraint" semantics.
 */
function filterDraftedTaxonomy(
  drafted: DraftedFields,
  dropped: Array<{ field: string; value: string; reason: string }>,
  vocab: Map<string, Set<string>>,
): DraftedFields {
  const out: DraftedFields = {};

  // Slug-shaped scalar fields.
  for (const field of SLUG_SCALAR_FIELDS) {
    const value = drafted[field as keyof DraftedFields];
    if (typeof value !== "string" || value.length === 0) continue;
    const set = vocab.get(field);
    if (!set || set.size === 0 || set.has(value)) {
      assignField(out, field, value);
    } else {
      dropped.push({
        field,
        value,
        reason: `not in master reference ${field}`,
      });
    }
  }

  // Slug-shaped array fields.
  for (const field of SLUG_ARRAY_FIELDS) {
    const raw = drafted[field as keyof DraftedFields];
    if (!Array.isArray(raw)) continue;
    const set = vocab.get(field);
    const ok: string[] = [];
    for (const v of raw) {
      if (typeof v !== "string") continue;
      if (!set || set.size === 0 || set.has(v)) {
        ok.push(v);
      } else {
        dropped.push({
          field,
          value: v,
          reason: `not in master reference ${field}`,
        });
      }
    }
    assignField(out, field, ok);
  }

  // reservation_difficulty: Master Reference column I holds the
  // allowed integer values as strings ("1".."5"). Treat as a vocab
  // gate when present; fall back to a 1-5 range check otherwise.
  if (drafted.reservation_difficulty != null) {
    const n = Number(drafted.reservation_difficulty);
    const asStr = String(Math.round(n));
    const set = vocab.get("reservation_difficulty");
    if (Number.isFinite(n)) {
      const inVocab = set && set.size > 0 ? set.has(asStr) : n >= 1 && n <= 5;
      if (inVocab) {
        out.reservation_difficulty = Math.round(n);
      } else {
        dropped.push({
          field: "reservation_difficulty",
          value: asStr,
          reason: "not in master reference reservation_difficulty",
        });
      }
    } else {
      dropped.push({
        field: "reservation_difficulty",
        value: String(drafted.reservation_difficulty),
        reason: "not a number",
      });
    }
  }

  // duration_hours: numeric, no slug vocab — sanity range check.
  if (drafted.duration_hours != null) {
    const n = Number(drafted.duration_hours);
    if (Number.isFinite(n) && n > 0 && n <= 6) {
      out.duration_hours = n;
    } else {
      dropped.push({
        field: "duration_hours",
        value: String(drafted.duration_hours),
        reason: "outside 0-6 hours",
      });
    }
  }

  // quality_score: numeric, no slug vocab — sanity range check.
  if (drafted.quality_score != null) {
    const n = Number(drafted.quality_score);
    if (Number.isFinite(n) && n >= 0 && n <= 10) {
      out.quality_score = Math.round(n);
    } else {
      dropped.push({
        field: "quality_score",
        value: String(drafted.quality_score),
        reason: "outside 0-10",
      });
    }
  }

  // Pass-through editorial copy. Banned-phrase sanity-check on
  // curation_note (voice guardrail; not a vocab check).
  if (drafted.curation_note) {
    if (containsBannedPhrase(drafted.curation_note)) {
      dropped.push({
        field: "curation_note",
        value: drafted.curation_note,
        reason: "contains banned phrase",
      });
    } else {
      out.curation_note = drafted.curation_note;
    }
  }
  if (drafted.signature_order) out.signature_order = drafted.signature_order;
  if (drafted.awards) out.awards = drafted.awards;
  if (drafted.happy_hour) out.happy_hour = drafted.happy_hour;
  if (drafted.reservation_url) out.reservation_url = drafted.reservation_url;
  if (drafted.resy_slug) out.resy_slug = drafted.resy_slug;

  return out;
}

function assignField(
  out: DraftedFields,
  field: string,
  value: string | string[],
): void {
  // Narrow indirection so the SLUG_*_FIELDS loops don't need a
  // switch over every key — DraftedFields keys match the field
  // names exactly.
  (out as Record<string, unknown>)[field] = value;
}

const BANNED_PHRASES = [
  "hidden gem",
  "perfect for",
  "great spot",
  "go-to",
  "amazing",
  "wonderful",
];

function containsBannedPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.some((p) => lower.includes(p));
}

function applyDraftedToRow(
  row: Record<string, string>,
  drafted: DraftedFields,
): void {
  if (drafted.neighborhood) row["neighborhood"] = drafted.neighborhood;
  if (drafted.category) row["category"] = drafted.category;
  if (drafted.vibe_tags) row["vibe_tags"] = drafted.vibe_tags.join(",");
  if (drafted.occasion_tags)
    row["occasion_tags"] = drafted.occasion_tags.join(",");
  if (drafted.stop_roles) row["stop_roles"] = drafted.stop_roles.join(",");
  if (drafted.duration_hours != null)
    row["duration_hours"] = String(drafted.duration_hours);
  if (drafted.reservation_difficulty != null)
    row["reservation_difficulty"] = String(drafted.reservation_difficulty);
  if (drafted.reservation_platform)
    row["reservation_platform"] = drafted.reservation_platform;
  if (drafted.reservation_url) row["reservation_url"] = drafted.reservation_url;
  if (drafted.resy_slug) row["resy_slug"] = drafted.resy_slug;
  if (drafted.happy_hour) row["happy_hour"] = drafted.happy_hour;
  if (drafted.quality_score != null)
    row["quality_score"] = String(drafted.quality_score);
  if (drafted.awards) row["awards"] = drafted.awards;
  if (drafted.curation_note) row["curation_note"] = drafted.curation_note;
  if (drafted.signature_order)
    row["signature_order"] = drafted.signature_order;
}

// ─── Neighborhood candidates ─────────────────────────────────────

/**
 * Compute the nearest 3 neighborhoods by haversine distance from
 * the venue's coords to each neighborhood's existing-venue
 * centroid. Surfaces them as a sanity hint so the operator can
 * cross-check Gemini's neighborhood pick against geographic
 * reality before approving. Read-only via service-role Supabase.
 */
async function neighborhoodCentroids(): Promise<
  Record<string, { lat: number; lng: number }>
> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("composer_venues_v2")
    .select("neighborhood, latitude, longitude")
    .eq("active", true)
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  const sums: Record<string, { lat: number; lng: number; count: number }> = {};
  for (const r of data ?? []) {
    const slug = String((r as { neighborhood?: unknown }).neighborhood ?? "");
    const lat = Number((r as { latitude?: unknown }).latitude);
    const lng = Number((r as { longitude?: unknown }).longitude);
    if (!slug || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!sums[slug]) sums[slug] = { lat: 0, lng: 0, count: 0 };
    sums[slug].lat += lat;
    sums[slug].lng += lng;
    sums[slug].count += 1;
  }
  const result: Record<string, { lat: number; lng: number }> = {};
  for (const [slug, s] of Object.entries(sums)) {
    result[slug] = { lat: s.lat / s.count, lng: s.lng / s.count };
  }
  return result;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function nearestNeighborhoodCandidates(
  deterministic: DeterministicRow,
  place: PlaceData,
): Promise<Array<{ slug: string; label: string; km: number }>> {
  const loc = place.location as { latitude?: number; longitude?: number } | undefined;
  const lat = Number(loc?.latitude);
  const lng = Number(loc?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const centroids = await neighborhoodCentroids();
  const distances = Object.entries(centroids).map(([slug, c]) => ({
    slug,
    km: haversineKm(lat, lng, c.lat, c.lng),
  }));
  distances.sort((a, b) => a.km - b.km);
  return distances.slice(0, 3).map(({ slug, km }) => ({
    slug,
    label: neighborhoodLabel(slug),
    km: Math.round(km * 10) / 10,
  }));
}

function neighborhoodLabel(slug: string): string {
  for (const group of Object.values(NEIGHBORHOOD_GROUPS)) {
    if (group.slugs.includes(slug)) return group.label;
  }
  return slug;
}

// ─── Misc ────────────────────────────────────────────────────────

function todayISO(): string {
  // Local NYC date, YYYY-MM-DD. Same shape the importer uses for
  // last_verified.
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
