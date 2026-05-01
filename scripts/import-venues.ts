// CLI wrapper for src/lib/venues/import.ts.
//
// Usage:
//   npm run import-venues -- dry-run                  # default, formatted stdout
//   npm run import-venues -- dry-run --json           # JSON to stdout
//   npm run import-venues -- dry-run --out diff.json  # JSON to file
//
//   npm run import-venues -- apply                    # interactive [y/N] prompt
//   npm run import-venues -- apply --yes              # skip prompt
//   npm run import-venues -- apply --confirm-large-change
//   npm run import-venues -- apply --skip-assertions  # OVERRIDE confirmation
//
// Phase 3: dry-run + apply (with orphan deactivation). Phase 4 will add
// the audit trail.

import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

loadEnv({ path: ".env.local" });

import { LargeChangeError } from "../src/lib/venues/apply";
import {
  applyPrepared,
  prepareApply,
  runDryRun,
  type ApplyPreparation,
  type DryRunResult,
} from "../src/lib/venues/import";
import { VENUE_SHEET_TAB } from "../src/lib/venues/config";
import type {
  ApplyResult,
  AssertionResult,
  FieldChange,
  ModifiedVenue,
  SkippedRow,
} from "../src/lib/venues/types";

// ─── Argv ──────────────────────────────────────────────────────────────

interface Args {
  command: "dry-run" | "apply";
  json: boolean;
  out: string | null;
  yes: boolean;
  confirmLargeChange: boolean;
  skipAssertions: boolean;
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const command = (args[0] ?? "dry-run") as Args["command"];

  const out: Args = {
    command,
    json: false,
    out: null,
    yes: false,
    confirmLargeChange: false,
    skipAssertions: false,
  };

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") {
      out.json = true;
    } else if (a === "--out") {
      out.out = args[i + 1] ?? null;
      i++;
    } else if (a.startsWith("--out=")) {
      out.out = a.slice("--out=".length);
    } else if (a === "--yes" || a === "-y") {
      out.yes = true;
    } else if (a === "--confirm-large-change") {
      out.confirmLargeChange = true;
    } else if (a === "--skip-assertions") {
      out.skipAssertions = true;
    } else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  if (command !== "dry-run" && command !== "apply") {
    console.error(`Unknown command: ${command}. Expected "dry-run" or "apply".`);
    process.exit(2);
  }
  return out;
}

// ─── Formatters ────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

function fmtModifiedTime(iso: string | undefined, by: string | undefined): string {
  if (!iso) return "(unavailable — Drive API not enabled)";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  const age = relativeAge(iso);
  const tail = [age && `(${age})`, by && `by ${by}`].filter(Boolean).join(" ");
  return tail ? `${stamp} ${tail}` : stamp;
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

function fmtAssertion(a: AssertionResult): string {
  const mark = a.passed ? "✓" : "✗";
  const tail = !a.passed && a.severity === "block" ? " [BLOCKED]" : "";
  return `  ${mark} ${a.name}: ${a.detail}${tail}`;
}

/**
 * Project ref from the Supabase URL — `uivpcwacqsqhbpisvmun` from
 * `https://uivpcwacqsqhbpisvmun.supabase.co`. Falls back to the full host
 * when the URL doesn't have the standard shape.
 */
function dbEnvLabel(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url) return "unknown";
  try {
    const host = new URL(url).host;
    const ref = host.split(".")[0];
    return ref || host;
  } catch {
    return "unknown";
  }
}

// ─── Source/Target/Diff blocks (shared between dry-run and apply) ──────

function sourceLines(meta: DryRunResult["sheet"]): string[] {
  return [
    "Source",
    `  Sheet:        "${meta.title}"`,
    `  ID:           ${meta.spreadsheetId}`,
    `  Modified:     ${fmtModifiedTime(meta.modifiedTime, meta.modifiedBy)}`,
    `  Tab:          ${VENUE_SHEET_TAB}`,
    `  Rows in tab:  ${fmtNum(meta.rowCount)}`,
    `  Sample neighborhoods: ${
      meta.sampleNeighborhoods.length > 0
        ? meta.sampleNeighborhoods.join(", ")
        : "(none)"
    }`,
  ];
}

function targetLines(db: DryRunResult["db"]): string[] {
  return [
    "Target",
    `  Database:     composer_venues_v2 (${dbEnvLabel()})`,
    `  Active rows:  ${fmtNum(db.active)}`,
    `  Inactive:     ${fmtNum(db.inactive)}`,
  ];
}

function diffLines(diff: DryRunResult["diff"]): string[] {
  // Order intentionally most→least destructive (add is also "destructive"
  // in the sense that new rows appear in itineraries, but deactivation is
  // the most user-visible removal).
  const lines: string[] = [
    "Diff",
    `  Add:        ${fmtNum(diff.add.length)} venues`,
    `  Modify:     ${fmtNum(diff.modify.length)} venues`,
    `  Deactivate: ${fmtNum(diff.deactivate.length)} venues`,
    `  Unchanged:  ${fmtNum(diff.unchanged)} venues`,
    `  Skipped:    ${fmtNum(diff.skipped.length)} sheet rows (validation failures)`,
  ];

  if (diff.modify.length > 0) {
    lines.push("");
    lines.push(`Sample modifications (first ${Math.min(5, diff.modify.length)}):`);
    diff.modify.slice(0, 5).forEach((m) => lines.push(summarizeMod(m)));
  }
  if (diff.deactivate.length > 0) {
    lines.push("");
    lines.push(`Sample deactivations (first ${Math.min(5, diff.deactivate.length)}):`);
    diff.deactivate.slice(0, 5).forEach((d) => {
      lines.push(`  - ${d.venue_id}: "${d.name}" (no longer in sheet)`);
    });
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
  if (diff.skipped.length > 0) {
    lines.push("");
    lines.push(`Skipped rows (first ${Math.min(20, diff.skipped.length)}):`);
    diff.skipped.slice(0, 20).forEach((s) => lines.push(fmtSkipped(s)));
    if (diff.skipped.length > 20) {
      lines.push(`  ... and ${diff.skipped.length - 20} more`);
    }
  }
  return lines;
}

function printDryRunReport(result: DryRunResult): void {
  const lines: string[] = ["=== Venue Import Dry Run ===", ""];
  lines.push(...sourceLines(result.sheet), "");
  lines.push(...targetLines(result.db), "");
  lines.push(...diffLines(result.diff));
  if (result.diff.skipped.length === 0) {
    lines.push("");
    lines.push("Skipped rows: none");
  }
  lines.push("");
  lines.push("(read-only — no changes applied)");
  process.stdout.write(lines.join("\n") + "\n");
}

function printApplyReport(prep: ApplyPreparation): void {
  const lines: string[] = ["=== Venue Import: Apply ===", ""];
  lines.push(...sourceLines(prep.sheet), "");
  lines.push(...targetLines(prep.db), "");
  lines.push("Sanity Assertions");
  prep.assertions.results.forEach((a) => lines.push(fmtAssertion(a)));
  lines.push("");
  lines.push(...diffLines(prep.diff));
  process.stdout.write(lines.join("\n") + "\n");
}

// ─── readline prompts ──────────────────────────────────────────────────

async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) =>
      rl.question(`${question} `, resolve)
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function promptForLiteral(question: string, expected: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) =>
      rl.question(`${question} `, resolve)
    );
    return answer.trim() === expected;
  } finally {
    rl.close();
  }
}

// ─── Subcommand handlers ───────────────────────────────────────────────

async function handleDryRun(args: Args): Promise<void> {
  const result = await runDryRun();

  if (args.out) {
    const target = path.resolve(process.cwd(), args.out);
    fs.writeFileSync(target, JSON.stringify(result, null, 2) + "\n", "utf8");
    if (!args.json) {
      printDryRunReport(result);
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
  printDryRunReport(result);
}

async function handleApply(args: Args): Promise<void> {
  const prep = await prepareApply();
  printApplyReport(prep);

  // Layer 2: assertions block unless explicitly overridden.
  if (prep.assertions.blocked) {
    console.log("");
    if (!args.skipAssertions) {
      console.log("Apply blocked by failed assertions. Use --skip-assertions to override (not recommended).");
      process.exit(1);
    }
    console.log(
      "WARNING: --skip-assertions bypasses sanity checks designed to prevent\ndestructive imports against the wrong sheet."
    );
    const ok = await promptForLiteral("Type 'OVERRIDE' to continue:", "OVERRIDE");
    if (!ok) {
      console.log("Override not confirmed. Aborting.");
      process.exit(1);
    }
  }

  const totalChanges =
    prep.diff.add.length + prep.diff.modify.length + prep.diff.deactivate.length;

  if (totalChanges === 0) {
    console.log("");
    console.log("No changes to apply. (sheet and DB are in sync)");
    return;
  }

  // Confirmation prompt (unless --yes).
  if (!args.yes) {
    console.log("");
    const ok = await promptYesNo(
      `Apply ${fmtNum(totalChanges)} change${totalChanges === 1 ? "" : "s"}? [y/N]`
    );
    if (!ok) {
      console.log("Aborted.");
      process.exit(1);
    }
  }

  console.log("");
  console.log("Applying...");
  let result: ApplyResult;
  try {
    result = await applyPrepared(prep, { confirmLargeChange: args.confirmLargeChange });
  } catch (err) {
    if (err instanceof LargeChangeError) {
      console.error("");
      console.error(err.message);
      console.error("");
      console.error("Re-run with --confirm-large-change to proceed.");
      process.exit(1);
    }
    throw err;
  }

  const seconds = (result.durationMs / 1000).toFixed(1);
  console.log(
    `✓ Inserted ${fmtNum(result.inserted)}, updated ${fmtNum(result.updated)}, deactivated ${fmtNum(result.deactivated)} in ${seconds}s`
  );
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.command === "apply") {
    await handleApply(args);
  } else {
    await handleDryRun(args);
  }
}

main().catch((err) => {
  console.error("[import-venues] fatal:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
