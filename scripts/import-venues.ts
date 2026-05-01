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
//   npm run import-venues -- history                  # last 10 runs
//   npm run import-venues -- history --limit 20
//   npm run import-venues -- history --status aborted
//   npm run import-venues -- history --since 2026-04-01
//
//   npm run import-venues -- show <id>                # full run detail
//
// Phase 4: dry-run + apply + audit trail (history/show). Phase 5 will
// cut the admin route over to the new module and delete the legacy paths.

import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

loadEnv({ path: ".env.local" });

import { LargeChangeError } from "../src/lib/venues/apply";
import { getRun, listRuns, shortId } from "../src/lib/venues/audit";
import { VENUE_SHEET_TAB } from "../src/lib/venues/config";
import {
  applyPrepared,
  prepareApply,
  recordAssertionsAbort,
  runDryRun,
  type ApplyPreparation,
  type DryRunResult,
} from "../src/lib/venues/import";
import type {
  ApplyResult,
  AssertionResult,
  DiffPayload,
  FieldChange,
  ImportRun,
  ImportRunStatus,
  ImportRunSummary,
  ModifiedVenue,
  SkippedRow,
  VenueCellValue,
} from "../src/lib/venues/types";

// ─── Argv ──────────────────────────────────────────────────────────────

type Command = "dry-run" | "apply" | "history" | "show";

interface Args {
  command: Command;

  // dry-run
  json: boolean;
  out: string | null;

  // apply
  yes: boolean;
  confirmLargeChange: boolean;
  skipAssertions: boolean;

  // history
  limit: number | null;
  status: ImportRunStatus | null;
  since: Date | null;

  // show
  id: string | null;
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const command = (args[0] ?? "dry-run") as Command;

  const out: Args = {
    command,
    json: false,
    out: null,
    yes: false,
    confirmLargeChange: false,
    skipAssertions: false,
    limit: null,
    status: null,
    since: null,
    id: null,
  };

  // Show takes one positional after the command.
  let positionalConsumed = 1;
  if (command === "show" && args[1] && !args[1].startsWith("-")) {
    out.id = args[1];
    positionalConsumed = 2;
  }

  for (let i = positionalConsumed; i < args.length; i++) {
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
    } else if (a === "--limit") {
      out.limit = parsePositiveInt(args[i + 1], "--limit");
      i++;
    } else if (a.startsWith("--limit=")) {
      out.limit = parsePositiveInt(a.slice("--limit=".length), "--limit");
    } else if (a === "--status") {
      out.status = parseStatus(args[i + 1]);
      i++;
    } else if (a.startsWith("--status=")) {
      out.status = parseStatus(a.slice("--status=".length));
    } else if (a === "--since") {
      out.since = parseDateArg(args[i + 1]);
      i++;
    } else if (a.startsWith("--since=")) {
      out.since = parseDateArg(a.slice("--since=".length));
    } else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }

  if (!["dry-run", "apply", "history", "show"].includes(command)) {
    console.error(`Unknown command: ${command}.`);
    process.exit(2);
  }
  return out;
}

function parsePositiveInt(raw: string | undefined, label: string): number {
  if (!raw) {
    console.error(`${label} requires a value.`);
    process.exit(2);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`${label} must be a positive integer (got "${raw}").`);
    process.exit(2);
  }
  return n;
}

function parseStatus(raw: string | undefined): ImportRunStatus {
  if (raw === "success" || raw === "failed" || raw === "aborted") return raw;
  console.error(`--status must be one of: success, failed, aborted (got "${raw}").`);
  process.exit(2);
}

function parseDateArg(raw: string | undefined): Date {
  if (!raw) {
    console.error("--since requires a value (ISO date or YYYY-MM-DD).");
    process.exit(2);
  }
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) {
    console.error(`--since: unparseable date "${raw}".`);
    process.exit(2);
  }
  return d;
}

/**
 * Reconstruct the trigger source string for the audit row from the
 * effective flags. The source field is searchable, so a stable, parseable
 * shape is more useful than a free-form note.
 */
function buildTriggerSource(args: Args): string {
  const parts: string[] = [`cli:${args.command}`];
  if (args.yes) parts.push("--yes");
  if (args.confirmLargeChange) parts.push("--confirm-large-change");
  if (args.skipAssertions) parts.push("--skip-assertions");
  return parts.join(" ");
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

function fmtTimestamp(d: Date | null): string {
  if (!d) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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
  // Order intentionally most→least destructive.
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
  // Wall-clock timer covers everything from prepare → apply so the audit
  // row's duration matches what the operator perceived.
  const startedAt = new Date();
  const triggerSource = buildTriggerSource(args);

  const prep = await prepareApply();
  printApplyReport(prep);

  // Layer 2: assertions block unless explicitly overridden.
  if (prep.assertions.blocked) {
    console.log("");
    if (!args.skipAssertions) {
      // System-side block — record and exit.
      await recordAssertionsAbort(prep, triggerSource, startedAt);
      console.log("Apply blocked by failed assertions. Use --skip-assertions to override (not recommended).");
      process.exit(1);
    }
    console.log(
      "WARNING: --skip-assertions bypasses sanity checks designed to prevent\ndestructive imports against the wrong sheet."
    );
    const ok = await promptForLiteral("Type 'OVERRIDE' to continue:", "OVERRIDE");
    if (!ok) {
      // Operator declined the override — not a system event, no audit row.
      console.log("Override not confirmed. Aborting.");
      process.exit(1);
    }
  }

  const totalChanges =
    prep.diff.add.length + prep.diff.modify.length + prep.diff.deactivate.length;

  // Confirmation prompt (unless --yes or no changes to confirm).
  if (totalChanges > 0 && !args.yes) {
    console.log("");
    const ok = await promptYesNo(
      `Apply ${fmtNum(totalChanges)} change${totalChanges === 1 ? "" : "s"}? [y/N]`
    );
    if (!ok) {
      // Operator choice — no audit row.
      console.log("Aborted.");
      process.exit(1);
    }
  }

  if (totalChanges > 0) {
    console.log("");
    console.log("Applying...");
  }

  let result: ApplyResult;
  try {
    result = await applyPrepared(prep, {
      confirmLargeChange: args.confirmLargeChange,
      triggerSource,
      startedAt,
    });
  } catch (err) {
    if (err instanceof LargeChangeError) {
      // applyPrepared already recorded the abort/threshold row.
      console.error("");
      console.error(err.message);
      console.error("");
      console.error("Re-run with --confirm-large-change to proceed.");
      process.exit(1);
    }
    throw err;
  }

  if (totalChanges === 0) {
    // applyPrepared still ran (records the no-op as success with all
    // zero counts). Operator-facing message stays tight.
    console.log("");
    console.log("No changes to apply. (sheet and DB are in sync)");
    return;
  }

  const seconds = (result.durationMs / 1000).toFixed(1);
  console.log(
    `✓ Inserted ${fmtNum(result.inserted)}, updated ${fmtNum(result.updated)}, deactivated ${fmtNum(result.deactivated)} in ${seconds}s`
  );
}

// ─── history ───────────────────────────────────────────────────────────

function fmtHistoryRow(r: ImportRunSummary): string {
  const pad = (s: string, n: number) => s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
  const id = pad(shortId(r.id), 9);
  const started = pad(fmtTimestamp(r.startedAt).replace(" UTC", ""), 19);
  const status = pad(r.status, 9);
  const dash = (n: number | null) => (r.status === "success" ? fmtNum(n ?? 0) : "—");
  const a = pad(dash(r.added), 4);
  const m = pad(dash(r.modified), 4);
  const d = pad(dash(r.deactivated), 4);
  const dur = pad(fmtDuration(r.durationMs), 7);
  let detail = "";
  if (r.status === "aborted") {
    detail = r.abortReason ? `${r.abortReason}${r.errorMessage ? `: ${r.errorMessage.split("\n")[0]}` : ""}` : "—";
  } else if (r.status === "failed") {
    detail = r.errorMessage?.split("\n")[0] ?? "—";
  } else {
    const empty = (r.added ?? 0) + (r.modified ?? 0) + (r.deactivated ?? 0) === 0;
    detail = `"${r.sheetTitle ?? "?"}"${empty ? " (no changes)" : ""}`;
  }
  return `${id}  ${started}  ${status}  ${a}  ${m}  ${d}  ${dur}  ${detail}`;
}

async function handleHistory(args: Args): Promise<void> {
  const runs = await listRuns({
    limit: args.limit ?? 10,
    status: args.status ?? undefined,
    since: args.since ?? undefined,
  });

  if (runs.length === 0) {
    console.log("No import runs found.");
    return;
  }

  const header = [
    "ID       ",
    " STARTED            ",
    " STATUS    ",
    "A     ",
    "M     ",
    "D     ",
    "DUR     ",
    "DETAIL",
  ].join(" ");
  console.log(header);
  for (const r of runs) {
    console.log(fmtHistoryRow(r));
  }
}

// ─── show ──────────────────────────────────────────────────────────────

function fmtPayloadValue(v: VenueCellValue): string {
  if (v == null) return "null";
  if (Array.isArray(v)) return `[${v.map((x) => `"${x}"`).join(", ")}]`;
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

function fmtPayloadModification(m: DiffPayload["modify"][number]): string {
  const fields = Object.keys(m.after);
  const top = fields
    .slice(0, 2)
    .map((f) => `${f} ${fmtPayloadValue(m.before[f])} → ${fmtPayloadValue(m.after[f])}`)
    .join("; ");
  const overflow = fields.length > 2 ? ` (+${fields.length - 2} more field${fields.length - 2 === 1 ? "" : "s"})` : "";
  return `    - ${m.venue_id}: ${top}${overflow}`;
}

function printRunDetail(run: ImportRun): void {
  const lines: string[] = [];
  lines.push(`=== Import Run ${shortId(run.id)} (${run.id}) ===`);
  lines.push("");
  lines.push(`Status:        ${run.status}${run.abortReason ? ` (${run.abortReason})` : ""}`);
  lines.push(`Started:       ${fmtTimestamp(run.startedAt)}`);
  lines.push(`Finished:      ${fmtTimestamp(run.finishedAt)}`);
  lines.push(`Duration:      ${fmtDuration(run.durationMs)}`);
  lines.push(`Triggered by:  ${run.triggeredBy}${run.triggerSource ? ` (${run.triggerSource})` : ""}`);
  if (run.errorMessage) {
    lines.push("");
    lines.push("Error");
    run.errorMessage.split("\n").forEach((l) => lines.push(`  ${l}`));
  }
  lines.push("");
  lines.push("Source");
  lines.push(`  Sheet:    "${run.sheetTitle ?? "(unknown)"}"`);
  lines.push(`  ID:       ${run.sheetId}`);
  lines.push(
    `  Modified: ${run.sheetModifiedTime ? fmtTimestamp(run.sheetModifiedTime) : "(unavailable)"}`
  );
  lines.push("");
  lines.push("Counts");
  lines.push(`  Added:        ${fmtNum(run.addedCount)}`);
  lines.push(`  Modified:     ${fmtNum(run.modifiedCount)}`);
  lines.push(`  Deactivated:  ${fmtNum(run.deactivatedCount)}`);
  lines.push(`  Unchanged:    ${fmtNum(run.unchangedCount)}`);
  lines.push(`  Skipped:      ${fmtNum(run.skippedCount)}`);

  if (run.assertions && run.assertions.length > 0) {
    const allPassed = run.assertions.every((a) => a.passed);
    lines.push("");
    lines.push(`Assertions ${allPassed ? "(all passed)" : "(blocked — see detail)"}`);
    run.assertions.forEach((a) => lines.push(fmtAssertion(a)));
  }

  if (run.diffPayload) {
    lines.push("");
    lines.push("Diff payload");
    if (run.diffPayload.add.length > 0) {
      lines.push(`  Added (${run.diffPayload.add.length}): ${run.diffPayload.add.slice(0, 20).join(", ")}${run.diffPayload.add.length > 20 ? ", ..." : ""}`);
    }
    if (run.diffPayload.modify.length > 0) {
      lines.push(`  Modified (${run.diffPayload.modify.length}):`);
      run.diffPayload.modify.slice(0, 10).forEach((m) => lines.push(fmtPayloadModification(m)));
      if (run.diffPayload.modify.length > 10) {
        lines.push(`    [...${run.diffPayload.modify.length - 10} more]`);
      }
    }
    if (run.diffPayload.deactivate.length > 0) {
      lines.push(`  Deactivated (${run.diffPayload.deactivate.length}): ${run.diffPayload.deactivate.slice(0, 20).join(", ")}${run.diffPayload.deactivate.length > 20 ? ", ..." : ""}`);
    }
  }

  process.stdout.write(lines.join("\n") + "\n");
}

async function handleShow(args: Args): Promise<void> {
  if (!args.id) {
    console.error("Usage: import-venues show <id>");
    console.error("       id may be the full UUID or the short form from `history` (e.g., 'a1b2-3c4d').");
    process.exit(2);
  }
  const run = await getRun(args.id);
  if (!run) {
    console.error(`No run found for id "${args.id}".`);
    process.exit(1);
  }
  printRunDetail(run);
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  switch (args.command) {
    case "apply":
      await handleApply(args);
      break;
    case "history":
      await handleHistory(args);
      break;
    case "show":
      await handleShow(args);
      break;
    default:
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
