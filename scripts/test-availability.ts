// End-to-end test for the Resy availability pipeline.
// Tests against Bibliotheque (resy_venue_id: 69589).
//
// Usage: npx tsx scripts/test-availability.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { getResyAvailability } from "../src/lib/availability/resy";
import { buildResyBookingUrl } from "../src/lib/availability/booking-url";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function formatDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

async function runTest(
  label: string,
  resyVenueId: number,
  date: string,
  partySize: number
) {
  console.log(`\n── ${label} ──`);
  console.log(`   Date: ${date}, Party: ${partySize}`);

  const start = performance.now();
  try {
    const slots = await getResyAvailability(resyVenueId, date, partySize);
    const latency = Math.round(performance.now() - start);
    console.log(`   Slots: ${slots.length} (${latency}ms)`);
    if (slots[0]) {
      console.log(`   First: ${slots[0].time} — ${slots[0].type}`);
      console.log(`   Token: ${slots[0].token.substring(0, 60)}...`);
    }
    return { slots, latency };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    console.log(
      `   ERROR (${latency}ms): ${err instanceof Error ? err.message : err}`
    );
    return { slots: [], latency };
  }
}

async function main() {
  // Load test venue
  const { data: venue, error } = await supabase
    .from("composer_venues")
    .select("id, name, resy_venue_id, resy_slug, reservation_platform")
    .eq("resy_venue_id", 69589)
    .maybeSingle();

  if (error || !venue) {
    console.error("Could not load test venue:", error?.message);
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log(`Test venue: ${venue.name}`);
  console.log(`Platform: ${venue.reservation_platform}`);
  console.log(`Resy ID: ${venue.resy_venue_id} / Slug: ${venue.resy_slug}`);
  console.log("=".repeat(60));

  const tomorrow = formatDate(1);
  const weekOut = formatDate(7);
  const monthOut = formatDate(30);
  const yesterday = formatDate(-1);

  // Test 1: Tomorrow, party 2
  await runTest("Tomorrow, party 2", 69589, tomorrow, 2);

  // Test 2: 7 days out, party 2
  await runTest("7 days out, party 2", 69589, weekOut, 2);

  // Test 3: 7 days out, party 6
  await runTest("7 days out, party 6", 69589, weekOut, 6);

  // Test 4: 30 days out, party 2
  await runTest("30 days out, party 2", 69589, monthOut, 2);

  // Test 5: Yesterday — should return empty (Resy won't have past slots)
  await runTest("Yesterday (should be empty)", 69589, yesterday, 2);

  // Test 6: Back-to-back latency comparison
  console.log("\n── Back-to-back latency test ──");
  const r1 = await runTest("Call 1", 69589, tomorrow, 2);
  const r2 = await runTest("Call 2 (same params)", 69589, tomorrow, 2);
  console.log(
    `\n   Latency delta: ${Math.abs(r1.latency - r2.latency)}ms (${r1.latency}ms vs ${r2.latency}ms)`
  );
  if (r2.latency < r1.latency * 0.5) {
    console.log("   → Resy may be caching server-side");
  }

  // Test booking URL
  console.log("\n── Booking URL ──");
  const url = buildResyBookingUrl(venue.resy_slug!, tomorrow, 2);
  console.log(`   ${url}`);

  console.log("\n" + "=".repeat(60));
  console.log("Done.");
}

main().catch(console.error);
