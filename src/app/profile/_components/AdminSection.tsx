"use client";

// Internal admin controls, visible only to the two founder accounts.
// This is gated by email equality — no role column, no server-side
// check. RLS still protects data; this section only surfaces extra
// UI affordances (reset onboarding, run health probe). Adding a third
// admin = add the email to ADMIN_EMAILS below.

import { useState } from "react";
import Link from "next/link";

// TODO: replace Reid's placeholder email with his actual one before
// shipping. Using the RFC 2606 `.invalid` TLD so it can't match a real
// inbox if forgotten.
const ADMIN_EMAILS: readonly string[] = [
  "aryaadit@hotmail.com",
  "reid@TODO-REPLACE.invalid",
];

type HealthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "data"; body: string }
  | { status: "error"; message: string };

interface AdminSectionProps {
  email: string;
}

export function AdminSection({ email }: AdminSectionProps) {
  const [health, setHealth] = useState<HealthState>({ status: "idle" });

  // Hooks-before-return rule: useState is declared unconditionally
  // above; the admin check only gates rendering.
  if (!ADMIN_EMAILS.includes(email)) return null;

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
          href="/?onboarding=true"
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
