// Live-DB verification for the Phase 1 start_time round-trip fix.
// Uses the service-role client to read/write composer_saved_itineraries
// and runs the actual hydrateSavedItinerary helper against the row —
// the same function the app uses to render saved itineraries.
//
// Usage:
//   npx tsx scripts/verify-fidelity-roundtrip.ts query-latest
//     → fetches the newest composer_saved_itineraries row, prints its
//       columns, then runs hydrateSavedItinerary and prints the
//       resolved inputs.startTime / inputs.endTime. Use this after
//       saving a plan in the UI to confirm what landed on disk and
//       how it hydrates.
//
//   npx tsx scripts/verify-fidelity-roundtrip.ts legacy-fixture
//     → inserts a synthetic legacy row (start_time NULL, time_block
//       "afternoon"), runs hydrate, asserts startTime "13:00" /
//       endTime "18:00", then deletes the row. Borrows user_id from
//       the newest real save so the FK holds; that means at least
//       one real save must exist first.
//
// The service-role key never leaves the script — only row contents
// are logged.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { hydrateSavedItinerary } from "../src/lib/itinerary/saved-hydration";
import type { SavedItinerary } from "../src/types";

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
  }
  return createClient(url, key);
}

function printRow(label: string, row: SavedItinerary) {
  console.log("");
  console.log(`── ${label} ──────────────────────────────────────────`);
  console.log("id:           ", row.id);
  console.log("user_id:      ", row.user_id);
  console.log("day:          ", row.day);
  console.log("start_time:   ", JSON.stringify(row.start_time));
  console.log("time_block:   ", JSON.stringify(row.time_block));
  console.log("created_at:   ", row.created_at);
  console.log("stop count:   ", (row.stops ?? []).length);
}

function printHydrated(label: string, row: SavedItinerary) {
  const hydrated = hydrateSavedItinerary(row);
  console.log("");
  console.log(`── ${label} ──────────────────────────────────────────`);
  console.log("inputs.startTime:", hydrated.inputs.startTime);
  console.log("inputs.endTime:  ", hydrated.inputs.endTime);
  return hydrated;
}

async function queryLatest() {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("composer_saved_itineraries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }
  if (!data) {
    console.error("No rows found in composer_saved_itineraries.");
    process.exit(1);
  }

  const row = data as SavedItinerary;
  printRow("ROW (latest composer_saved_itineraries)", row);
  printHydrated("HYDRATED (hydrateSavedItinerary)", row);
  console.log("");
}

async function legacyFixture() {
  const supabase = getClient();

  const { data: anchor, error: anchorErr } = await supabase
    .from("composer_saved_itineraries")
    .select("user_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (anchorErr) {
    console.error("Anchor query failed:", anchorErr.message);
    process.exit(1);
  }
  if (!anchor) {
    console.error(
      "No anchor row found. Save at least one real itinerary first so the fixture can borrow a valid user_id.",
    );
    process.exit(1);
  }

  const fixture = {
    user_id: anchor.user_id,
    title: "fidelity-test legacy fixture",
    subtitle: "synthetic — safe to delete",
    occasion: "date",
    neighborhoods: ["west_village"],
    budget: "nice_out",
    vibe: "food_forward",
    day: "2026-06-09",
    start_time: null,
    time_block: "afternoon",
    stops: [],
    walking: null,
    weather: null,
  };

  console.log("Inserting synthetic legacy row (start_time NULL, time_block 'afternoon')…");
  const { data: inserted, error: insertErr } = await supabase
    .from("composer_saved_itineraries")
    .insert(fixture)
    .select("*")
    .single();
  if (insertErr || !inserted) {
    console.error("Insert failed:", insertErr?.message ?? "no row returned");
    process.exit(1);
  }

  const row = inserted as SavedItinerary;
  printRow("ROW (synthetic legacy)", row);
  const hydrated = printHydrated("HYDRATED", row);

  const expectedStart = "13:00";
  const expectedEnd = "18:00";
  const passed =
    row.start_time === null &&
    row.time_block === "afternoon" &&
    hydrated.inputs.startTime === expectedStart &&
    hydrated.inputs.endTime === expectedEnd;

  console.log("");
  console.log(`Expected: startTime ${expectedStart} / endTime ${expectedEnd}`);
  console.log(`Got:      startTime ${hydrated.inputs.startTime} / endTime ${hydrated.inputs.endTime}`);

  console.log("");
  console.log("Cleaning up fixture row…");
  const { error: deleteErr } = await supabase
    .from("composer_saved_itineraries")
    .delete()
    .eq("id", row.id);
  if (deleteErr) {
    console.error(`Delete FAILED — row id ${row.id} remains in DB:`, deleteErr.message);
    process.exit(2);
  }
  console.log(`Deleted row ${row.id}.`);

  console.log("");
  console.log(passed ? "PASS — legacy fallback intact." : "FAIL — see above.");
  process.exit(passed ? 0 : 1);
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "query-latest":
      await queryLatest();
      break;
    case "legacy-fixture":
      await legacyFixture();
      break;
    default:
      console.error("Usage:");
      console.error("  npx tsx scripts/verify-fidelity-roundtrip.ts query-latest");
      console.error("  npx tsx scripts/verify-fidelity-roundtrip.ts legacy-fixture");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
