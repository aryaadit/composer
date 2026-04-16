"use client";

// Internal admin controls, visible only to users whose composer_users
// row has `is_admin = true`. That flag is flipped manually in Supabase
// — see CLAUDE.md. RLS guarantees each session can only read its own
// profile row, so this boolean can't be spoofed or inspected across
// users from the client.

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";

type HealthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "data"; body: string }
  | { status: "error"; message: string };

export function AdminSection() {
  const { isAdmin } = useAuth();
  const [health, setHealth] = useState<HealthState>({ status: "idle" });

  // Hooks-before-return rule: useState is declared unconditionally
  // above; the admin check only gates rendering.
  if (!isAdmin) return null;

  const runHealthCheck = async () => {
    setHealth({ status: "loading" });
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const json = (await res.json()) as unknown;
      setHealth({ status: "data", body: JSON.stringify(json, null, 2) });
    } catch (err) {
      setHealth({
        status: "error",
        message: err instanceof Error ? err.message : "Request failed",
      });
    }
  };

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <h2 className="font-sans text-xs tracking-widest uppercase text-[#D1D5DB] mb-5">
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
          <pre className="font-mono text-xs text-muted whitespace-pre-wrap mt-2 max-w-full overflow-x-auto">
            {health.body}
          </pre>
        )}
        {health.status === "error" && (
          <pre className="font-mono text-xs text-muted whitespace-pre-wrap mt-2">
            {health.message}
          </pre>
        )}
      </div>
    </section>
  );
}
