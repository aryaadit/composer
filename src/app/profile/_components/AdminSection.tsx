"use client";

// Internal admin controls, visible only to users whose composer_users
// row has `is_admin = true`. That flag is flipped manually in Supabase
// — see CLAUDE.md. RLS guarantees each session can only read its own
// profile row, so this boolean can't be spoofed or inspected across
// users from the client.
//
// Phase 5a: the venue-sync sub-section is a state machine across the
// preflight → preview → apply flow. Each panel renders a discrete state;
// transitions are operator-driven (no auto-fetching). All explanatory
// copy lives in syncCopy.ts.

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import type {
  AdminApplyAssertionBlockedResponse,
  AdminApplyFailedResponse,
  AdminApplySuccessResponse,
  AdminApplyThresholdBlockedResponse,
  AdminPreflightResponse,
  AdminPreviewResponse,
  AdminSyncRequest,
  AdminSyncResponse,
} from "@/lib/venues/types";
import { SyncPreflightPanel } from "./SyncPreflightPanel";
import { SyncPreviewPanel } from "./SyncPreviewPanel";
import {
  SyncApplyingPanel,
  SyncAssertionBlockedPanel,
  SyncFailedPanel,
  SyncSuccessPanel,
  SyncThresholdBlockedPanel,
} from "./SyncResultPanel";
import { ThresholdOverrideDialog } from "./ThresholdOverrideDialog";
import { VenueLookup } from "./VenueLookup";
import { authFailedCopy, buttonLabels, sectionHeaders, stateExplanations } from "./syncCopy";

// ─── Sync state machine ────────────────────────────────────────────────

type SyncState =
  | { kind: "initial" }
  | { kind: "loading_preflight" }
  | { kind: "preflight_ready"; data: AdminPreflightResponse }
  | { kind: "preflight_failed"; error: string }
  // Carries the preflight result so the transitional preview panel can
  // render Source/Target with real values while the diff and assertions
  // are still skeletons. Without this the user sees Source/Target jump
  // back to skeletons during the preview load (regression).
  | { kind: "loading_preview"; preflight: AdminPreflightResponse }
  | { kind: "preview_ready"; data: AdminPreviewResponse }
  | { kind: "preview_failed"; error: string }
  // Carries the preview that triggered this apply so the transitional
  // "Applying…" panel can show the diff that's being written. Without
  // this the operator sees a 2–3s blank gap (item 4 from UI fixes).
  | { kind: "loading_apply"; preview: AdminPreviewResponse }
  | { kind: "apply_success"; data: AdminApplySuccessResponse }
  | { kind: "apply_assertion_blocked"; data: AdminApplyAssertionBlockedResponse }
  | { kind: "apply_threshold_blocked"; data: AdminApplyThresholdBlockedResponse }
  | { kind: "apply_failed"; data: AdminApplyFailedResponse }
  | { kind: "auth_failed"; reason: "unauthenticated" | "not_admin" };

async function callRoute(req: AdminSyncRequest): Promise<AdminSyncResponse> {
  const res = await fetch("/api/admin/sync-venues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  // The route always returns the AdminSyncResponse shape; non-2xx is
  // expected for blocked/failed/auth states and the body still parses.
  return (await res.json()) as AdminSyncResponse;
}

// ─── Health check (unchanged from previous version) ────────────────────

interface HealthReport {
  ok?: boolean;
  checks?: {
    supabase?: { ok?: boolean };
    scoring?: { ok?: boolean };
    gemini?: { ok?: boolean };
  };
}

interface HealthSummary {
  ok: boolean;
  failed: string[];
}

type HealthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "data"; body: string; summary: HealthSummary }
  | { status: "error"; message: string };

function summarize(report: HealthReport): HealthSummary {
  const checks = report.checks ?? {};
  const failed: string[] = [];
  if (checks.supabase && checks.supabase.ok !== true) failed.push("supabase");
  if (checks.scoring && checks.scoring.ok !== true) failed.push("scoring");
  if (checks.gemini && checks.gemini.ok !== true) failed.push("gemini");
  return {
    ok: report.ok === true && failed.length === 0,
    failed,
  };
}

// ─── Component ─────────────────────────────────────────────────────────

export function AdminSection() {
  const { isAdmin } = useAuth();
  const [health, setHealth] = useState<HealthState>({ status: "idle" });
  const [sync, setSync] = useState<SyncState>({ kind: "initial" });
  const [overrideOpen, setOverrideOpen] = useState(false);

  if (!isAdmin) return null;

  const runHealthCheck = async () => {
    setHealth({ status: "loading" });
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const json = (await res.json()) as HealthReport;
      setHealth({
        status: "data",
        body: JSON.stringify(json, null, 2),
        summary: summarize(json),
      });
    } catch (err) {
      setHealth({
        status: "error",
        message: err instanceof Error ? err.message : "Request failed",
      });
    }
  };

  // ─── State transitions ──────────────────────────────────────────────

  const handlePreflight = async () => {
    setSync({ kind: "loading_preflight" });
    try {
      const res = await callRoute({ action: "preflight" });
      if (res.ok && res.kind === "preflight") {
        setSync({ kind: "preflight_ready", data: res });
      } else if (res.kind === "auth_failed") {
        setSync({ kind: "auth_failed", reason: res.reason });
      } else if (!res.ok) {
        setSync({
          kind: "preflight_failed",
          error: "error" in res ? (res.error as string) : "preflight failed",
        });
      }
    } catch (err) {
      setSync({
        kind: "preflight_failed",
        error: err instanceof Error ? err.message : "request failed",
      });
    }
  };

  const handlePreview = async () => {
    // Carry the current preflight forward into loading_preview so the
    // transitional panel can render Source/Target with real values
    // (already known) and only skeleton the new sections (assertions,
    // diff). If we got here without a preflight in state — shouldn't
    // happen via the normal flow — fall back to a synthetic empty
    // preflight so the panel doesn't crash; the values will look
    // unknown but layout stays intact.
    setSync((prev) => {
      const preflight =
        prev.kind === "preflight_ready"
          ? prev.data
          : ({
              ok: true,
              kind: "preflight",
              metadata: {
                spreadsheetId: "",
                title: "",
                rowCount: 0,
                sampleNeighborhoods: [],
              },
              db_active_count: 0,
              db_inactive_count: 0,
            } satisfies AdminPreflightResponse);
      return { kind: "loading_preview", preflight };
    });
    try {
      const res = await callRoute({ action: "preview" });
      if (res.ok && res.kind === "preview") {
        setSync({ kind: "preview_ready", data: res });
      } else if (res.kind === "auth_failed") {
        setSync({ kind: "auth_failed", reason: res.reason });
      } else if (!res.ok) {
        setSync({
          kind: "preview_failed",
          error: "error" in res ? (res.error as string) : "preview failed",
        });
      }
    } catch (err) {
      setSync({
        kind: "preview_failed",
        error: err instanceof Error ? err.message : "request failed",
      });
    }
  };

  const handleApply = async (
    flags: { override_assertions?: "OVERRIDE"; confirm_large_change?: boolean } = {}
  ) => {
    // Preserve the preview that triggered this apply so SyncApplyingPanel
    // can render the diff while the RPC runs. Falls back to a synthetic
    // empty preview only if apply was somehow invoked outside the
    // preview state — shouldn't happen via the normal flow.
    setSync((prev) => {
      const preview =
        prev.kind === "preview_ready"
          ? prev.data
          : prev.kind === "apply_assertion_blocked" ||
            prev.kind === "apply_threshold_blocked"
          ? null
          : null;
      return {
        kind: "loading_apply",
        preview:
          preview ?? ({
            ok: true,
            kind: "preview",
            metadata: {
              spreadsheetId: "",
              title: "",
              rowCount: 0,
              sampleNeighborhoods: [],
            },
            diff: { add: [], modify: [], deactivate: [], unchanged: 0, skipped: [] },
            assertions: { results: [], blocked: false },
            db_active_count: 0,
            db_inactive_count: 0,
          } satisfies AdminPreviewResponse),
      };
    });
    setOverrideOpen(false);
    try {
      const res = await callRoute({ action: "apply", ...flags });
      if (res.ok && res.kind === "apply_success") {
        setSync({ kind: "apply_success", data: res });
      } else if (!res.ok && res.kind === "apply_assertion_blocked") {
        setSync({ kind: "apply_assertion_blocked", data: res });
      } else if (!res.ok && res.kind === "apply_threshold_blocked") {
        setSync({ kind: "apply_threshold_blocked", data: res });
      } else if (!res.ok && res.kind === "apply_failed") {
        setSync({ kind: "apply_failed", data: res });
      } else if (res.kind === "auth_failed") {
        setSync({ kind: "auth_failed", reason: res.reason });
      } else {
        setSync({
          kind: "apply_failed",
          data: {
            ok: false,
            kind: "apply_failed",
            error: `unexpected response: ${JSON.stringify(res)}`,
          },
        });
      }
    } catch (err) {
      setSync({
        kind: "apply_failed",
        data: {
          ok: false,
          kind: "apply_failed",
          error: err instanceof Error ? err.message : "request failed",
        },
      });
    }
  };

  const startOver = () => {
    setSync({ kind: "initial" });
    setOverrideOpen(false);
  };

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-5">
        Internal
      </h2>

      <div className="flex flex-col gap-3 items-start">
        <Link
          href="/admin/onboarding"
          className="font-sans text-xs text-muted hover:text-charcoal transition-colors"
        >
          Reset onboarding &rarr;
        </Link>

        <button
          type="button"
          onClick={() => void runHealthCheck()}
          disabled={health.status === "loading"}
          className="font-sans text-xs text-muted hover:text-charcoal transition-colors disabled:cursor-wait"
        >
          {health.status === "loading"
            ? "Running…"
            : "Run health check →"}
        </button>

        {health.status === "data" && (
          <div className="mt-2 w-full">
            <HealthStatusBanner summary={health.summary} />
            <pre className="font-mono text-xs text-muted whitespace-pre-wrap mt-2 max-w-full overflow-x-auto">
              {health.body}
            </pre>
          </div>
        )}
        {health.status === "error" && (
          <pre className="font-mono text-xs text-muted whitespace-pre-wrap mt-2">
            {health.message}
          </pre>
        )}

        <div className="mt-6 w-full">
          <SyncSection
            state={sync}
            overrideOpen={overrideOpen}
            onPreflight={handlePreflight}
            onPreview={handlePreview}
            onApply={handleApply}
            onStartOver={startOver}
            onOverrideOpen={() => setOverrideOpen(true)}
            onOverrideCancel={() => setOverrideOpen(false)}
          />
        </div>

        <div className="mt-6 w-full">
          <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3">
            Single-venue resync
          </h3>
          <VenueLookup />
        </div>
      </div>
    </section>
  );
}

// ─── Sync section render ───────────────────────────────────────────────

interface SyncSectionProps {
  state: SyncState;
  overrideOpen: boolean;
  onPreflight: () => void;
  onPreview: () => void;
  onApply: (flags?: {
    override_assertions?: "OVERRIDE";
    confirm_large_change?: boolean;
  }) => void;
  onStartOver: () => void;
  onOverrideOpen: () => void;
  onOverrideCancel: () => void;
}

function SyncSection({
  state,
  overrideOpen,
  onPreflight,
  onPreview,
  onApply,
  onStartOver,
  onOverrideOpen,
  onOverrideCancel,
}: SyncSectionProps) {
  const isApplying = state.kind === "loading_apply";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-base text-charcoal mb-1">
          {sectionHeaders.title}
        </h3>
        <p className="font-sans text-xs text-warm-gray leading-relaxed max-w-2xl">
          {sectionHeaders.subtitle}
        </p>
      </div>

      <CurrentStateExplanation state={state} />

      <SyncBody
        state={state}
        isApplying={isApplying}
        onPreflight={onPreflight}
        onPreview={onPreview}
        onApply={onApply}
        onOverrideOpen={onOverrideOpen}
      />

      {state.kind !== "initial" && state.kind !== "loading_preflight" && (
        <button
          type="button"
          onClick={onStartOver}
          className="font-sans text-xs text-muted hover:text-charcoal transition-colors"
        >
          ← {buttonLabels.startOver}
        </button>
      )}

      {overrideOpen && (
        <ThresholdOverrideDialog
          onCancel={onOverrideCancel}
          onConfirm={() => onApply({ override_assertions: "OVERRIDE" })}
        />
      )}
    </div>
  );
}

function CurrentStateExplanation({ state }: { state: SyncState }) {
  let text: string | null = null;
  switch (state.kind) {
    case "initial":
      text = stateExplanations.initial;
      break;
    case "preflight_ready":
      text = stateExplanations.preflightReady;
      break;
    case "preview_ready":
      // When preview comes back with blocked assertions there's no
      // Apply button and nothing to "review and apply" — swap to the
      // assertion-blocked explanation so the subtitle isn't misleading.
      text = state.data.assertions.blocked
        ? stateExplanations.applyAssertionBlocked
        : stateExplanations.previewReady;
      break;
    default:
      return null;
  }
  return (
    <p className="font-sans text-xs text-warm-gray leading-relaxed max-w-2xl">
      {text}
    </p>
  );
}

function SyncBody({
  state,
  isApplying,
  onPreflight,
  onPreview,
  onApply,
  onOverrideOpen,
}: {
  state: SyncState;
  isApplying: boolean;
  onPreflight: () => void;
  onPreview: () => void;
  onApply: (flags?: {
    override_assertions?: "OVERRIDE";
    confirm_large_change?: boolean;
  }) => void;
  onOverrideOpen: () => void;
}) {
  switch (state.kind) {
    case "initial":
      return <PrimaryButton label={buttonLabels.checkSource} onClick={onPreflight} />;
    case "loading_preflight":
      // Skeleton variant of the preflight panel — same structure renders
      // immediately so the operator sees something happening, no jump
      // when data arrives.
      return <SyncPreflightPanel phase="loading" />;
    case "preflight_ready":
      return (
        <div className="space-y-3">
          <SyncPreflightPanel
            phase="ready"
            metadata={state.data.metadata}
            dbActive={state.data.db_active_count}
            dbInactive={state.data.db_inactive_count}
          />
          <PrimaryButton label={buttonLabels.runPreview} onClick={onPreview} />
        </div>
      );
    case "preflight_failed":
      return (
        <ErrorBlock title="Preflight failed" message={state.error} />
      );
    case "loading_preview":
      // Skeleton variant of the preview panel — Source/Target use real
      // preflight data; Sanity Assertions and Changes are skeletons.
      return <SyncPreviewPanel phase="loading" preflight={state.preflight} />;
    case "preview_ready":
      return (
        <SyncPreviewPanel
          phase="ready"
          data={state.data}
          isApplying={isApplying}
          onApply={() => onApply()}
          onOverride={onOverrideOpen}
        />
      );
    case "preview_failed":
      return <ErrorBlock title="Preview failed" message={state.error} />;
    case "loading_apply":
      return <SyncApplyingPanel preview={state.preview} />;
    case "apply_success":
      return <SyncSuccessPanel data={state.data} />;
    case "apply_assertion_blocked":
      return (
        <SyncAssertionBlockedPanel
          data={state.data}
          isApplying={isApplying}
          onOverride={onOverrideOpen}
        />
      );
    case "apply_threshold_blocked":
      return (
        <SyncThresholdBlockedPanel
          data={state.data}
          isApplying={isApplying}
          onConfirm={() => onApply({ confirm_large_change: true })}
        />
      );
    case "apply_failed":
      return <SyncFailedPanel data={state.data} />;
    case "auth_failed":
      return (
        <ErrorBlock
          title="Auth failed"
          message={
            state.reason === "unauthenticated"
              ? authFailedCopy.unauthenticated
              : authFailedCopy.notAdmin
          }
        />
      );
  }
}

function PrimaryButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-sans text-sm font-medium text-cream bg-burgundy hover:bg-burgundy-light transition-colors px-4 py-1.5 rounded-md"
    >
      {label}
    </button>
  );
}

function ErrorBlock({ title, message }: { title: string; message: string }) {
  return (
    <div className="border border-burgundy/30 bg-burgundy-tint rounded-md p-4">
      <h4 className="font-sans text-sm font-medium text-burgundy mb-1">
        {title}
      </h4>
      <pre className="font-mono text-xs text-charcoal whitespace-pre-wrap">
        {message}
      </pre>
    </div>
  );
}

// ─── Health banner (unchanged) ─────────────────────────────────────────

function HealthStatusBanner({ summary }: { summary: HealthSummary }) {
  if (summary.ok) {
    return (
      <div className="inline-flex items-center gap-2 font-sans text-xs font-medium text-emerald-600">
        <CheckIcon />
        <span>All checks passed</span>
      </div>
    );
  }
  const n = summary.failed.length;
  const list = summary.failed.join(", ");
  return (
    <div className="inline-flex items-center gap-2 font-sans text-xs font-medium text-burgundy">
      <CrossIcon />
      <span>
        {n} of 3 checks failed{list ? ` — ${list}` : ""}
      </span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 12 5 5L20 6" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
