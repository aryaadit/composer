// Promote approved staging rows to composer_venues.
// Reads a CSV with an 'approved' column (TRUE/true/yes/1).
//
// Usage:
//   npx tsx scripts/promote-staging-to-venues.ts /path/to/reviewed.csv
//   npx tsx scripts/promote-staging-to-venues.ts /path/to/reviewed.csv --commit

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/promote-staging-to-venues.ts <csv-path> [--commit]");
    process.exit(1);
  }

  const commit = process.argv.includes("--commit");
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

  let wouldUpdate = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (!isApproved(fields[approvedIdx] ?? "")) {
      skipped++;
      continue;
    }

    const venueDbId = fields[dbIdIdx];
    const platform = fields[platformIdx] || null;
    const resySlug = fields[slugIdx] || null;
    const resyVenueId = fields[venueIdIdx]
      ? parseInt(fields[venueIdIdx], 10)
      : null;
    const reservationUrl = fields[urlIdx] || null;
    const name = fields[nameIdx] || "?";

    if (!venueDbId) continue;

    const update: Record<string, unknown> = {
      reservation_platform: platform || "none",
      reservation_url: reservationUrl,
    };
    if (platform === "resy") {
      update.resy_venue_id = resyVenueId;
      update.resy_slug = resySlug;
    }

    if (commit) {
      const { error } = await supabase
        .from("composer_venues")
        .update(update)
        .eq("id", venueDbId);
      if (error) {
        console.log(`✗ ${name}: ${error.message}`);
      } else {
        console.log(`✓ ${name}: ${platform} ${resySlug ?? ""}`);
      }
    } else {
      console.log(
        `[dry-run] ${name}: would set platform=${platform} slug=${resySlug} venueId=${resyVenueId}`
      );
    }
    wouldUpdate++;
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${commit ? "Updated" : "Would update"}: ${wouldUpdate}`);
  console.log(`Skipped (not approved): ${skipped}`);
  if (!commit) {
    console.log("\nRun with --commit to apply changes.");
  }
}

main().catch(console.error);
