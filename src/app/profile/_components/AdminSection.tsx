"use client";

// Internal admin controls, visible only to users whose composer_users
// row has `is_admin = true`. That flag is flipped manually in Supabase
// — see CLAUDE.md. RLS guarantees each session can only read its own
// profile row, so this boolean can't be spoofed or inspected across
// users from the client.

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { VenueLookup } from "./VenueLookup";

type SyncState =
  | { status: "idle" }
  | { status: "syncing" }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

// Shape the /api/health report is expected to match. Kept as a
// structural type rather than imported from the route so we stay
// tolerant to additive changes in the API — we just read the bits we
// need for the summary line.
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
  failed: string[]; // names of failing checks, empty on success
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

export function AdminSection() {
  const { isAdmin } = useAuth();
  const [health, setHealth] = useState<HealthState>({ status: "idle" });
  const [sync, setSync] = useState<SyncState>({ status: "idle" });

  // Hooks-before-return rule: useState is declared unconditionally
  // above; the admin check only gates rendering.
  if (!isAdmin) return null;

  const runSync = async () => {
    setSync({ status: "syncing" });
    try {
      const res = await fetch("/api/admin/sync-venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setSync({ status: "error", message: (json.error as string) ?? "Sync failed" });
        return;
      }
      setSync({ status: "done", message: `Synced ${json.synced} venues` });
      setTimeout(() => setSync({ status: "idle" }), 5000);
    } catch (err) {
      setSync({
        status: "error",
        message: err instanceof Error ? err.message : "Request failed",
      });
    }
  };

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

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={sync.status === "syncing"}
            className="font-sans text-xs text-muted hover:text-charcoal transition-colors disabled:cursor-wait"
          >
            {sync.status === "syncing" ? "Syncing…" : "Sync all venues →"}
          </button>
          {sync.status === "done" && (
            <span className="font-sans text-xs text-emerald-600">{sync.message}</span>
          )}
          {sync.status === "error" && (
            <span className="font-sans text-xs text-burgundy">{sync.message}</span>
          )}
        </div>

        <VenueLookup />
      </div>
    </section>
  );
}

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
