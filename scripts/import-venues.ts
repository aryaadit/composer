// CLI wrapper for src/lib/venues/import.ts.
//
// Phase 1: dry-run only. Read-only diff against production. The apply
// subcommand intentionally errors out — it lands in Phase 2.
//
// Usage:
//   npm run import-venues -- dry-run                  # default, formatted stdout
//   npm run import-venues -- dry-run --json           # JSON to stdout
//   npm run import-venues -- dry-run --out diff.json  # JSON to file
//   npm run import-venues -- apply                    # not yet implemented

import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";

loadEnv({ path: ".env.local" });

import { runDryRun, type DryRunResult } from "../src/lib/venues/import";
import type { FieldChange, ModifiedVenue, SkippedRow } from "../src/lib/venues/types";

// ─── Argv ──────────────────────────────────────────────────────────────

interface Args {
  command: "dry-run" | "apply";
  json: boolean;
  out: string | null;
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const command = (args[0] ?? "dry-run") as Args["command"];

  let json = false;
  let out: string | null = null;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") {
      json = true;
    } else if (a === "--out") {
      out = args[i + 1] ?? null;
      i++;
    } else if (a.startsWith("--out=")) {
      out = a.slice("--out=".length);
    } else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  if (command !== "dry-run" && command !== "apply") {
    console.error(`Unknown command: ${command}. Expected "dry-run" or "apply".`);
    process.exit(2);
  }
  return { command, json, out };
}

// ─── Formatters ────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtModifiedTime(iso: string | undefined, by: string | undefined): string {
  if (!iso) return "(unavailable — Drive API not enabled)";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  return by ? `${stamp} by ${by}` : stamp;
}

function fmtValue(v: unknown): string {
  if (v == null) return "null";
  if (Array.isArray(v)) return `[${v.map((x) => fmtValue(x)).join(", ")}]`;
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

function fmtChange(c: FieldChange): string {
  if (c.added || c.removed) {
    const parts: string[] = [];
    if (c.added && c.added.length > 0) parts.push(`+ ${fmtValue(c.added)}`);
    if (c.removed && c.removed.length > 0) parts.push(`- ${fmtValue(c.removed)}`);
    return `${c.field} ${parts.join(", ")}`;
  }
  return `${c.field} ${fmtValue(c.before)} → ${fmtValue(c.after)}`;
}

function summarizeMod(m: ModifiedVenue): string {
  // Show up to 2 field changes per venue in the inline preview; enough
  // signal for a smell test without flooding stdout.
  const top = m.changedFields.slice(0, 2).map(fmtChange).join("; ");
  const overflow =
    m.changedFields.length > 2
      ? ` (+${m.changedFields.length - 2} more field${m.changedFields.length - 2 === 1 ? "" : "s"})`
      : "";
  return `  - ${m.venue_id}: ${top}${overflow}`;
}

function fmtSkipped(s: SkippedRow): string {
  const id = s.venue_id ? ` ${s.venue_id}` : "";
  const name = s.name ? ` "${s.name}"` : "";
  return `  - row ${s.row}${id}${name}: ${s.reason}`;
}

function printReport(result: DryRunResult): void {
  const { sheet, db, diff } = result;

  const lines: string[] = [];
  lines.push("=== Venue Import Dry Run ===");
  lines.push("");
  lines.push("Source");
  lines.push(`  Sheet:        "${sheet.title}"`);
  lines.push(`  ID:           ${sheet.spreadsheetId}`);
  lines.push(`  Modified:     ${fmtModifiedTime(sheet.modifiedTime, sheet.modifiedBy)}`);
  lines.push(`  Rows in tab:  ${fmtNum(sheet.rowCount)}`);
  lines.push(
    `  Sample neighborhoods: ${
      sheet.sampleNeighborhoods.length > 0
        ? sheet.sampleNeighborhoods.join(", ")
        : "(none)"
    }`
  );
  lines.push("");
  lines.push("Target");
  lines.push(`  Database:     composer_venues_v2 (${dbEnvLabel()})`);
  lines.push(`  Active rows:  ${fmtNum(db.active)}`);
  lines.push(`  Inactive:     ${fmtNum(db.inactive)}`);
  lines.push("");
  lines.push("Diff");
  lines.push(`  Add:        ${fmtNum(diff.add.length)} venues`);
  lines.push(`  Modify:     ${fmtNum(diff.modify.length)} venues`);
  lines.push(`  Unchanged:  ${fmtNum(diff.unchanged)} venues`);
  lines.push(
    `  Skipped:    ${fmtNum(diff.skipped.length)} sheet rows (validation failures)`
  );

  if (diff.modify.length > 0) {
    lines.push("");
    lines.push(
      `Sample modifications (first ${Math.min(5, diff.modify.length)}):`
    );
    diff.modify.slice(0, 5).forEach((m) => lines.push(summarizeMod(m)));
  }

  if (diff.add.length > 0) {
    lines.push("");
    lines.push(`New venues (first ${Math.min(5, diff.add.length)}):`);
    diff.add.slice(0, 5).forEach((v) => {
      const vid = v.venue_id as string;
      const name = (v.name as string) ?? "(unnamed)";
      const hood = (v.neighborhood as string) ?? "(no neighborhood)";
      lines.push(`  - ${vid}: "${name}" (${hood})`);
    });
  }

  lines.push("");
  if (diff.skipped.length > 0) {
    lines.push(
      `Skipped rows (first ${Math.min(20, diff.skipped.length)}):`
    );
    diff.skipped.slice(0, 20).forEach((s) => lines.push(fmtSkipped(s)));
    if (diff.skipped.length > 20) {
      lines.push(`  ... and ${diff.skipped.length - 20} more`);
    }
  } else {
    lines.push("Skipped rows: none");
  }

  lines.push("");
  lines.push("(read-only — no changes applied)");

  process.stdout.write(lines.join("\n") + "\n");
}

/**
 * Best-effort label for which DB the importer is talking to. Falls back to
 * the URL host so the operator can see at a glance whether they're hitting
 * production, a branch, or local.
 */
function dbEnvLabel(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url) return "unknown";
  try {
    const host = new URL(url).host;
    return host;
  } catch {
    return "unknown";
  }
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.command === "apply") {
    console.error("apply: Not yet implemented. Phase 2.");
    process.exit(1);
  }

  const result = await runDryRun();

  if (args.out) {
    const target = path.resolve(process.cwd(), args.out);
    fs.writeFileSync(target, JSON.stringify(result, null, 2) + "\n", "utf8");
    if (!args.json) {
      printReport(result);
      console.log(`\nFull diff written to ${target}`);
    } else {
      console.log(`Full diff written to ${target}`);
    }
    return;
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  printReport(result);
}

main().catch((err) => {
  console.error("[import-venues] fatal:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
