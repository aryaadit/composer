// Test itinerary generation with availability enrichment.
// Runs 5 scenarios and outputs a summary table.
//
// Usage: npx tsx scripts/test-itinerary-availability.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import type { ItineraryResponse, StopAvailability } from "../src/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BASE_URL = "http://localhost:3000";

function nextDay(daysFromNow: number, weekday?: number): string {
  const d = new Date();
  if (weekday !== undefined) {
    // Find next occurrence of weekday (0=Sun, 6=Sat)
    const current = d.getDay();
    const diff = (weekday - current + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
  } else {
    d.setDate(d.getDate() + daysFromNow);
  }
  return d.toISOString().split("T")[0];
}

interface TestResult {
  scenario: string;
  stops: {
    venue: string;
    status: string;
    slotCount: number;
    swapped: boolean;
  }[];
  latencyMs: number;
  error?: string;
}

async function generateItinerary(
  body: Record<string, unknown>
): Promise<{ data: ItineraryResponse | null; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    // Use Supabase auth to get a session for the API call
    // Since this is a test script, we'll call the generate endpoint directly
    // with the service role key in the auth header
    const res = await fetch(`${BASE_URL}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "", // No auth cookie in test — the route will work without prefs
      },
      body: JSON.stringify(body),
    });
    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { data: null, latencyMs, error: (err as { error: string }).error };
    }

    const data = (await res.json()) as ItineraryResponse;
    return { data, latencyMs };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

function formatResult(scenario: string, data: ItineraryResponse | null, latencyMs: number, error?: string): TestResult {
  if (!data || error) {
    return { scenario, stops: [], latencyMs, error };
  }

  return {
    scenario,
    stops: data.stops.map((s) => {
      const avail: StopAvailability | undefined = s.availability;
      return {
        venue: s.venue.name,
        status: avail?.status ?? "no_availability_field",
        slotCount: avail?.slots?.length ?? 0,
        swapped: avail?.swapped ?? false,
      };
    }),
    latencyMs,
  };
}

function printTable(results: TestResult[]) {
  console.log("\n" + "=".repeat(90));
  console.log(
    "Scenario".padEnd(25) +
      "Stop".padEnd(6) +
      "Venue".padEnd(30) +
      "Status".padEnd(20) +
      "Slots".padEnd(8) +
      "Swapped"
  );
  console.log("-".repeat(90));

  for (const r of results) {
    if (r.error) {
      console.log(`${r.scenario.padEnd(25)} ERROR: ${r.error} (${r.latencyMs}ms)`);
      continue;
    }
    r.stops.forEach((s, i) => {
      const label = i === 0 ? `${r.scenario} (${r.latencyMs}ms)` : "";
      console.log(
        label.padEnd(25) +
          `#${i + 1}`.padEnd(6) +
          s.venue.substring(0, 28).padEnd(30) +
          s.status.padEnd(20) +
          String(s.slotCount).padEnd(8) +
          (s.swapped ? "YES" : "")
      );
    });
  }
  console.log("=".repeat(90));
}

async function main() {
  console.log("Testing itinerary availability enrichment...\n");
  console.log("Make sure the dev server is running: npm run dev\n");

  const results: TestResult[] = [];

  // Scenario 1: Evening, next Saturday, West Village, party 2
  console.log("1. Evening itinerary — next Saturday, West Village...");
  const r1 = await generateItinerary({
    occasion: "dating",
    neighborhoods: ["west_village"],
    budget: "nice_out",
    vibe: "food_forward",
    day: nextDay(0, 6), // next Saturday
    timeBlock: "evening",
  });
  results.push(formatResult("Evening / WV / Sat", r1.data, r1.latencyMs, r1.error));

  // Scenario 2: Late night, next Friday, party 4 — mostly walk-in expected
  console.log("2. Late night itinerary — next Friday, East Village...");
  const r2 = await generateItinerary({
    occasion: "friends",
    neighborhoods: ["east_village"],
    budget: "casual",
    vibe: "drinks_led",
    day: nextDay(0, 5), // next Friday
    timeBlock: "late_night",
  });
  results.push(formatResult("Late Night / EV / Fri", r2.data, r2.latencyMs, r2.error));

  // Scenario 3: Morning — expect no_slots_in_block or walk_in
  console.log("3. Morning itinerary — next Saturday, SoHo...");
  const r3 = await generateItinerary({
    occasion: "couple",
    neighborhoods: ["soho_nolita"],
    budget: "splurge",
    vibe: "walk_explore",
    day: nextDay(0, 6),
    timeBlock: "morning",
  });
  results.push(formatResult("Morning / SoHo / Sat", r3.data, r3.latencyMs, r3.error));

  // Scenario 4: Afternoon — mixed results expected
  console.log("4. Afternoon itinerary — tomorrow, Chelsea...");
  const r4 = await generateItinerary({
    occasion: "solo",
    neighborhoods: ["chelsea"],
    budget: "casual",
    vibe: "walk_explore",
    day: nextDay(1),
    timeBlock: "afternoon",
  });
  results.push(formatResult("Afternoon / Chelsea", r4.data, r4.latencyMs, r4.error));

  // Scenario 5: Evening same params as #1 — check consistency
  console.log("5. Evening repeat — same as #1, check latency...");
  const r5 = await generateItinerary({
    occasion: "dating",
    neighborhoods: ["west_village"],
    budget: "nice_out",
    vibe: "food_forward",
    day: nextDay(0, 6),
    timeBlock: "evening",
  });
  results.push(formatResult("Evening repeat", r5.data, r5.latencyMs, r5.error));

  // Summary
  printTable(results);

  // Stats
  const allStops = results.flatMap((r) => r.stops);
  const hasSlots = allStops.filter((s) => s.status === "has_slots");
  const walkIn = allStops.filter((s) => s.status === "walk_in");
  const noSlots = allStops.filter((s) => s.status === "no_slots_in_block");
  const unconfirmed = allStops.filter((s) => s.status === "unconfirmed");
  const swapped = allStops.filter((s) => s.swapped);
  const avgSlots = hasSlots.length > 0
    ? (hasSlots.reduce((s, v) => s + v.slotCount, 0) / hasSlots.length).toFixed(1)
    : "N/A";

  console.log(`\nTotal stops: ${allStops.length}`);
  console.log(`  has_slots:         ${hasSlots.length} (avg ${avgSlots} slots)`);
  console.log(`  walk_in:           ${walkIn.length}`);
  console.log(`  no_slots_in_block: ${noSlots.length}`);
  console.log(`  unconfirmed:       ${unconfirmed.length}`);
  console.log(`  swapped:           ${swapped.length}`);
  console.log(`\nAvg latency: ${Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)}ms`);
}

main().catch(console.error);
