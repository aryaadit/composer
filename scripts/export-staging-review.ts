// Export venue_reservation_staging to CSV for manual review.
// Output: /tmp/reservation_staging_review.csv
//
// Usage: npx tsx scripts/export-staging-review.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function escapeCsv(val: string | null | undefined): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const { data: rows, error } = await supabase
    .from("venue_reservation_staging")
    .select("*, composer_venues!inner(venue_id, latitude, longitude, reservation_platform)")
    .order("confidence", { ascending: true })
    .order("venue_name", { ascending: true });

  if (error || !rows) {
    console.error("Failed to load staging:", error?.message);
    process.exit(1);
  }

  const header = [
    "venue_id",
    "venue_db_id",
    "venue_name",
    "current_platform",
    "proposed_platform",
    "proposed_resy_slug",
    "proposed_resy_venue_id",
    "proposed_reservation_url",
    "confidence",
    "source",
    "notes",
    "google_maps_link",
    "resy_preview_link",
    "approved",
  ].join(",");

  const csvRows = rows.map((row) => {
    const v = row.composer_venues as {
      venue_id: string;
      latitude: number;
      longitude: number;
      reservation_platform: string | null;
    };

    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${v.latitude},${v.longitude}`;
    const resyLink = row.resy_slug
      ? `https://resy.com/cities/ny/venues/${row.resy_slug}`
      : "";

    return [
      escapeCsv(v.venue_id),
      escapeCsv(row.venue_id),
      escapeCsv(row.venue_name),
      escapeCsv(v.reservation_platform),
      escapeCsv(row.platform),
      escapeCsv(row.resy_slug),
      escapeCsv(row.resy_venue_id?.toString()),
      escapeCsv(row.reservation_url),
      escapeCsv(row.confidence),
      escapeCsv(row.source),
      escapeCsv(row.notes),
      escapeCsv(mapsLink),
      escapeCsv(resyLink),
      "",
    ].join(",");
  });

  const csv = [header, ...csvRows].join("\n");
  const outPath = "/tmp/reservation_staging_review.csv";
  fs.writeFileSync(outPath, csv, "utf-8");

  console.log(`Exported ${rows.length} rows to ${outPath}`);

  // Summary
  const byConfidence: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  for (const row of rows) {
    byConfidence[row.confidence] = (byConfidence[row.confidence] || 0) + 1;
    const p = row.platform || "none";
    byPlatform[p] = (byPlatform[p] || 0) + 1;
  }

  console.log("\nBy confidence:");
  for (const [k, v] of Object.entries(byConfidence).sort())
    console.log(`  ${k}: ${v}`);
  console.log("\nBy platform:");
  for (const [k, v] of Object.entries(byPlatform).sort())
    console.log(`  ${k}: ${v}`);
}

main().catch(console.error);
