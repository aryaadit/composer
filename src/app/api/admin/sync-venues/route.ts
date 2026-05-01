// POST /api/admin/sync-venues — admin-only venue import endpoint.
//
// Phase 5a thin wrapper around the canonical import module
// (src/lib/venues/*). Replaces the previous one-shot upsert route that
// batched 100-row chunks with no transaction and no audit. The new route
// exposes four actions:
//
//   { action: "preflight" }     → sheet identity + DB counts
//   { action: "preview" }       → full diff + sanity assertions
//   { action: "apply", ... }    → atomic upsert + deactivation + audit
//   { action: "sync_single", venue_id } → force-write one row
//
// Apply paths support `confirm_large_change: true` (bypass threshold
// guard) and `override_assertions: "OVERRIDE"` (bypass blocked
// assertions). Both correspond to CLI flags `--confirm-large-change`
// and `--skip-assertions`.
//
// The authenticated user's UUID flows into the audit table's
// `triggered_by` column so route-driven runs are attributable.
//
// Sheet-identity validation deliberately does NOT compare GOOGLE_SHEET_ID
// against a hardcoded constant. Identity is validated by the operator
// looking at the preflight/preview output.

import { NextResponse } from "next/server";

import {
  prepareApply,
  runApply,
  runApplySingleVenue,
  runPreflight,
  AssertionsBlockedError,
} from "@/lib/venues/import";
import { LargeChangeError } from "@/lib/venues/apply";
import { getServerSupabase } from "@/lib/supabase/server";
import type {
  AdminAuthFailedResponse,
  AdminInvalidRequestResponse,
  AdminSyncRequest,
  AdminSyncResponse,
} from "@/lib/venues/types";

interface AuthOk {
  ok: true;
  userId: string;
}

type AuthResult = AuthOk | AdminAuthFailedResponse;

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

function jsonResponse(body: AdminSyncResponse, status?: number): NextResponse {
  return NextResponse.json(body, { status: status ?? (body.ok ? 200 : 400) });
}

function invalidRequest(error: string): NextResponse {
  const body: AdminInvalidRequestResponse = {
    ok: false,
    kind: "invalid_request",
    error,
  };
  return jsonResponse(body, 400);
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth.ok !== true) {
    return jsonResponse(
      auth,
      auth.reason === "unauthenticated" ? 401 : 403
    );
  }

  let body: AdminSyncRequest;
  try {
    body = (await request.json()) as AdminSyncRequest;
  } catch {
    return invalidRequest("Request body must be valid JSON.");
  }

  if (!body || typeof body !== "object" || !("action" in body)) {
    return invalidRequest("Request body must include an 'action' field.");
  }

  switch (body.action) {
    case "preflight":
      return handlePreflight();
    case "preview":
      return handlePreview();
    case "apply":
      return handleApply(body, auth.userId);
    case "sync_single":
      return handleSyncSingle(body, auth.userId);
    default:
      return invalidRequest(`Unknown action: ${(body as { action: string }).action}`);
  }
}

// ─── Handlers ──────────────────────────────────────────────────────────

async function handlePreflight(): Promise<NextResponse> {
  try {
    const result = await runPreflight();
    return jsonResponse({
      ok: true,
      kind: "preflight",
      metadata: result.sheet,
      db_active_count: result.db.active,
      db_inactive_count: result.db.inactive,
    });
  } catch (err) {
    console.error("[sync-venues] preflight failed:", err);
    return invalidRequest(
      err instanceof Error ? err.message : "preflight failed"
    );
  }
}

async function handlePreview(): Promise<NextResponse> {
  try {
    const prep = await prepareApply();
    return jsonResponse({
      ok: true,
      kind: "preview",
      metadata: prep.sheet,
      diff: prep.diff,
      assertions: prep.assertions,
      db_active_count: prep.db.active,
      db_inactive_count: prep.db.inactive,
    });
  } catch (err) {
    console.error("[sync-venues] preview failed:", err);
    return invalidRequest(
      err instanceof Error ? err.message : "preview failed"
    );
  }
}

async function handleApply(
  body: Extract<AdminSyncRequest, { action: "apply" }>,
  userId: string
): Promise<NextResponse> {
  const overrideAssertions = body.override_assertions === "OVERRIDE";
  const confirmLargeChange = body.confirm_large_change === true;

  // Trigger source carries the salient flags so audit history is grep-able.
  const sourceParts = ["route:apply"];
  if (overrideAssertions) sourceParts.push("override_assertions");
  if (confirmLargeChange) sourceParts.push("confirm_large_change");
  const triggerSource = sourceParts.join(" ");

  try {
    const result = await runApply({
      confirmLargeChange,
      skipAssertions: overrideAssertions,
      triggerSource,
      triggeredBy: userId,
    });
    return jsonResponse({
      ok: true,
      kind: "apply_success",
      apply_result: result.applyResult,
      diff: result.diff,
      run_id: result.runId,
    });
  } catch (err) {
    if (err instanceof AssertionsBlockedError) {
      return jsonResponse({
        ok: false,
        kind: "apply_assertion_blocked",
        assertions: err.assertions,
        run_id: err.runId,
      });
    }
    if (err instanceof LargeChangeError) {
      return jsonResponse({
        ok: false,
        kind: "apply_threshold_blocked",
        reasons: err.reasons,
        run_id: err.runId,
      });
    }
    console.error("[sync-venues] apply failed:", err);
    const errWithRunId = err as Error & { runId?: string | null };
    return jsonResponse({
      ok: false,
      kind: "apply_failed",
      error: err instanceof Error ? err.message : String(err),
      run_id: errWithRunId.runId ?? null,
    });
  }
}

async function handleSyncSingle(
  body: Extract<AdminSyncRequest, { action: "sync_single" }>,
  userId: string
): Promise<NextResponse> {
  const venueId = typeof body.venue_id === "string" ? body.venue_id.trim() : "";
  if (!venueId) {
    return invalidRequest("sync_single requires a non-empty venue_id.");
  }

  try {
    const result = await runApplySingleVenue(venueId, {
      triggeredBy: userId,
      triggerSource: "route:sync_single",
    });

    if (!result.found) {
      return jsonResponse({
        ok: false,
        kind: "sync_single_not_found",
        venue_id: venueId,
        error: result.error,
      });
    }

    if (result.error) {
      // Found in sheet but RPC failed — distinguish from not-found.
      return jsonResponse({
        ok: false,
        kind: "sync_single_failed",
        venue_id: venueId,
        error: result.error,
        run_id: result.runId ?? null,
      });
    }

    return jsonResponse({
      ok: true,
      kind: "sync_single_success",
      venue_id: venueId,
      action: result.action ?? "updated",
      run_id: result.runId ?? null,
    });
  } catch (err) {
    console.error("[sync-venues] sync_single failed:", err);
    return jsonResponse({
      ok: false,
      kind: "sync_single_failed",
      venue_id: venueId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
