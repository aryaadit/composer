// Promote approved staging rows to composer_venues.
//
// Two modes:
//   --from-staging          Read approved rows directly from DB staging table
//   /path/to/reviewed.csv   Read from a reviewed CSV with 'approved' column
//
// Add --commit to apply changes (default is dry-run).
//
// Usage:
//   npx tsx scripts/promote-staging-to-venues.ts --from-staging
//   npx tsx scripts/promote-staging-to-venues.ts --from-staging --commit
//   npx tsx scripts/promote-staging-to-venues.ts /path/to/reviewed.csv --commit

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const commit = process.argv.includes("--commit");
const fromStaging = process.argv.includes("--from-staging");

interface PromoteRow {
  venueDbId: string;
  name: string;
  platform: string | null;
  resySlug: string | null;
  resyVenueId: number | null;
  reservationUrl: string | null;
}

// ─── From staging table ───────────────────────────────────────

async function loadFromStaging(): Promise<PromoteRow[]> {
  const { data, error } = await supabase
    .from("venue_reservation_staging")
    .select("venue_id, venue_name, platform, resy_slug, resy_venue_id, reservation_url")
    .eq("approved", true);

  if (error) {
    console.error("Failed to load staging:", error.message);
    process.exit(1);
  }

  return (data ?? []).map((r) => ({
    venueDbId: r.venue_id,
    name: r.venue_name,
    platform: r.platform,
    resySlug: r.resy_slug,
    resyVenueId: r.resy_venue_id,
    reservationUrl: r.reservation_url,
  }));
}

// ─── From CSV ─────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function isApproved(val: string): boolean {
  const v = val.trim().toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}

function loadFromCsv(csvPath: string): PromoteRow[] {
  const csv = fs.readFileSync(csvPath, "utf-8");
  const lines = csv.split("\n").filter((l) => l.trim());

  const header = parseCsvLine(lines[0]);
  const approvedIdx = header.indexOf("approved");
  const dbIdIdx = header.indexOf("venue_db_id");
  const platformIdx = header.indexOf("proposed_platform");
  const slugIdx = header.indexOf("proposed_resy_slug");
  const venueIdIdx = header.indexOf("proposed_resy_venue_id");
  const urlIdx = header.indexOf("proposed_reservation_url");
  const nameIdx = header.indexOf("venue_name");

  if (approvedIdx < 0 || dbIdIdx < 0) {
    console.error("CSV must have 'approved' and 'venue_db_id' columns");
    process.exit(1);
  }

  const rows: PromoteRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (!isApproved(fields[approvedIdx] ?? "")) continue;
    const venueDbId = fields[dbIdIdx];
    if (!venueDbId) continue;

    rows.push({
      venueDbId,
      name: fields[nameIdx] || "?",
      platform: fields[platformIdx] || null,
      resySlug: fields[slugIdx] || null,
      resyVenueId: fields[venueIdIdx]
        ? parseInt(fields[venueIdIdx], 10)
        : null,
      reservationUrl: fields[urlIdx] || null,
    });
  }
  return rows;
}

// ─── Promote ──────────────────────────────────────────────────

async function main() {
  let rows: PromoteRow[];

  if (fromStaging) {
    rows = await loadFromStaging();
    console.log(`Loaded ${rows.length} approved rows from staging table\n`);
  } else {
    const csvPath = process.argv.find(
      (a) => !a.startsWith("--") && a.endsWith(".csv")
    );
    if (!csvPath) {
      console.error(
        "Usage: npx tsx scripts/promote-staging-to-venues.ts --from-staging [--commit]"
      );
      console.error(
        "   or: npx tsx scripts/promote-staging-to-venues.ts <csv-path> [--commit]"
      );
      process.exit(1);
    }
    rows = loadFromCsv(csvPath);
    console.log(`Loaded ${rows.length} approved rows from CSV\n`);
  }

  let updated = 0;

  for (const row of rows) {
    const update: Record<string, unknown> = {
      reservation_platform: row.platform || "none",
      reservation_url: row.reservationUrl,
    };
    if (row.platform === "resy") {
      update.resy_venue_id = row.resyVenueId;
      update.resy_slug = row.resySlug;
    }

    if (commit) {
      const { error } = await supabase
        .from("composer_venues")
        .update(update)
        .eq("id", row.venueDbId);
      if (error) {
        console.log(`✗ ${row.name}: ${error.message}`);
      } else {
        console.log(`✓ ${row.name}: ${row.platform} ${row.resySlug ?? ""}`);
        updated++;
      }
    } else {
      console.log(
        `[dry-run] ${row.name}: platform=${row.platform} slug=${row.resySlug} venueId=${row.resyVenueId}`
      );
      updated++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${commit ? "Updated" : "Would update"}: ${updated}`);
  if (!commit) {
    console.log("\nRun with --commit to apply changes.");
  }
}

main().catch(console.error);
