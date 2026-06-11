// Native composability per neighborhood group: how many distinct valid
// itineraries each group supports with every relaxation and fallback
// OFF. This is the data behind the neighborhood-visibility gate (see
// src/config/group-visibility.ts) and the per-tier selectability rule
// in the questionnaire's budget step.
//
// Definition of a valid itinerary (per the gate spec):
//   - default compose shape as shipped: 2 stops, [stop1, main]
//   - stop1 ∈ STOP_1_POOL (opener or closer canonical) → STOP_1_POOL
//     expansion accepts opener/closer/drinks/activity/coffee raw roles
//   - main raw role "main"
//   - same neighborhood group (no cascade neighborhood drop)
//   - Friday evening (17:00–22:00) — strictest common slot
//   - all hard filters active: BUDGET_TIER_MAP membership for the picked
//     tier, venueOpenForWindow for fri evening, business_status not
//     closed permanently/temporarily, walkDistanceKm(main, stop1)
//     ≤ ALGORITHM.distance.maxWalkKmNormal (1.5 km) — no widening,
//     no relaxedFilter, no proximity widening
//   - main ≠ stop1
//
// Counted separately per budget tier (casual, nice_out, splurge),
// matching COMPOSE_BUDGET_SLUGS in src/config/budgets.ts. all_out and
// no_preference are excluded — Phase 1 narrowed the questionnaire
// budget set to those three.
//
// Filter primitives come from canonical modules — the script doesn't
// reimplement role expansion, budget membership, time-window logic,
// haversine, or the proximity cap.
//
// Two output modes:
//   default — human-readable markdown report (decision table + sourcing
//             worklist). Use for analysis and the docs/ artifact.
//   --json  — structured JSON to stdout for the generate-configs.py
//             orchestrator to consume when baking itinerariesByTier
//             into src/config/generated/neighborhoods.ts.
//
// Run:
//   npx tsx scripts/native-composability.ts                  # markdown
//   npx tsx scripts/native-composability.ts --json           # bake feed

import { config as loadEnv } from "dotenv";
// quiet:true suppresses the dotenv banner so --json mode emits a single
// clean JSON line for the generate-configs.py orchestrator to parse.
loadEnv({ path: ".env.local", quiet: true });

import { NEIGHBORHOOD_GROUPS as GEN_GROUPS } from "@/config/generated/neighborhoods";
import { ROLE_EXPANSION } from "@/config/generated/stop-roles";
import { BUDGET_TIER_MAP } from "@/config/budgets";
import { walkDistanceKm } from "@/lib/geo";
import { venueOpenForWindow } from "@/lib/itinerary/time-blocks";
import { STOP_1_POOL } from "@/lib/composer";
import { ALGORITHM } from "@/config/algorithm";

interface VenueRow {
  id: string;
  name: string;
  neighborhood: string;
  price_tier: number | null;
  stop_roles: string[];
  latitude: number;
  longitude: number;
  business_status: string | null;
  time_blocks: string[] | null;
  mon_blocks: string[] | null;
  tue_blocks: string[] | null;
  wed_blocks: string[] | null;
  thu_blocks: string[] | null;
  fri_blocks: string[] | null;
  sat_blocks: string[] | null;
  sun_blocks: string[] | null;
}

const TIERS = ["casual", "nice_out", "splurge"] as const;
type Tier = (typeof TIERS)[number];

const STOP_1_CANONICAL: ReadonlySet<string> = new Set<string>(STOP_1_POOL);
function isStop1Eligible(raw: string[]): boolean {
  return raw.some((r) =>
    (ROLE_EXPANSION[r] ?? []).some((canon) => STOP_1_CANONICAL.has(canon)),
  );
}

function isMainEligible(raw: string[]): boolean {
  return raw.some((r) => (ROLE_EXPANSION[r] ?? []).includes("main"));
}

function tierOf(v: VenueRow): number {
  return v.price_tier ?? 2;
}

function isOperational(v: VenueRow): boolean {
  return (
    v.business_status !== "CLOSED_PERMANENTLY" &&
    v.business_status !== "CLOSED_TEMPORARILY"
  );
}

const FRIDAY_EVENING = { startTime: "17:00", endTime: "22:00" } as const;

function isFridayEveningOpen(v: VenueRow): boolean {
  return venueOpenForWindow(
    {
      time_blocks: v.time_blocks ?? [],
      mon_blocks: v.mon_blocks ?? [],
      tue_blocks: v.tue_blocks ?? [],
      wed_blocks: v.wed_blocks ?? [],
      thu_blocks: v.thu_blocks ?? [],
      fri_blocks: v.fri_blocks ?? [],
      sat_blocks: v.sat_blocks ?? [],
      sun_blocks: v.sun_blocks ?? [],
    },
    "fri_blocks",
    FRIDAY_EVENING,
  );
}

const MAX_WALK_KM = ALGORITHM.distance.maxWalkKmNormal;

function medianPairKm(venues: VenueRow[]): number {
  if (venues.length < 2) return 0;
  const ds: number[] = [];
  for (let i = 0; i < venues.length; i++) {
    for (let j = i + 1; j < venues.length; j++) {
      ds.push(
        walkDistanceKm(
          venues[i].latitude,
          venues[i].longitude,
          venues[j].latitude,
          venues[j].longitude,
        ),
      );
    }
  }
  ds.sort((a, b) => a - b);
  const mid = Math.floor(ds.length / 2);
  const value = ds.length % 2 === 0 ? (ds[mid - 1] + ds[mid]) / 2 : ds[mid];
  return Math.round(value * 100) / 100;
}

interface TierStats {
  mains: number;
  stop1s: number;
  both: number;
  itineraries: number;
}

function countItinerariesForTier(pool: VenueRow[]): TierStats {
  const mains = pool.filter((v) => isMainEligible(v.stop_roles));
  const stop1s = pool.filter((v) => isStop1Eligible(v.stop_roles));
  const mainsSet = new Set(mains.map((v) => v.id));
  const stop1sSet = new Set(stop1s.map((v) => v.id));
  const both = [...mainsSet].filter((id) => stop1sSet.has(id)).length;

  let pairs = 0;
  for (const main of mains) {
    for (const stop1 of stop1s) {
      if (stop1.id === main.id) continue;
      if (
        walkDistanceKm(
          main.latitude,
          main.longitude,
          stop1.latitude,
          stop1.longitude,
        ) <= MAX_WALK_KM
      ) {
        pairs++;
      }
    }
  }
  return { mains: mains.length, stop1s: stop1s.length, both, itineraries: pairs };
}

interface GroupReport {
  groupId: string;
  label: string;
  bakedVenueCount: number;
  liveVenueCount: number;
  medianPairKm: number;
  perTier: Record<Tier, TierStats>;
  itinerariesByTier: Record<Tier, number>;
  survives25Worst: boolean;
  survives25Mid: boolean;
  survives50Worst: boolean;
  survives50Mid: boolean;
  survives100Worst: boolean;
  survives100Mid: boolean;
}

async function fetchVenues(): Promise<VenueRow[]> {
  const { getServiceSupabase } = await import("@/lib/supabase");
  const sb = getServiceSupabase();
  const PAGE_SIZE = 1000;
  const venues: VenueRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from("composer_venues_v2")
      .select(
        "id, name, neighborhood, price_tier, stop_roles, latitude, longitude, business_status, time_blocks, mon_blocks, tue_blocks, wed_blocks, thu_blocks, fri_blocks, sat_blocks, sun_blocks",
      )
      .eq("active", true)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    venues.push(...(data as VenueRow[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  const { count, error: countErr } = await sb
    .from("composer_venues_v2")
    .select("*", { count: "exact", head: true })
    .eq("active", true);
  if (countErr) throw countErr;
  if (count !== venues.length) {
    throw new Error(`aborted: fetched=${venues.length} != count=${count}`);
  }
  console.error(
    `[native-composability] fetched ${venues.length} active venues; count check OK`,
  );
  return venues;
}

async function computeReports(): Promise<GroupReport[]> {
  const venues = await fetchVenues();
  const bySlug = new Map<string, VenueRow[]>();
  for (const v of venues) {
    const arr = bySlug.get(v.neighborhood) ?? [];
    arr.push(v);
    bySlug.set(v.neighborhood, arr);
  }

  const reports: GroupReport[] = [];
  for (const [groupId, group] of Object.entries(GEN_GROUPS)) {
    const groupVenues = group.slugs.flatMap((s) => bySlug.get(s) ?? []);

    const perTier = {} as Record<Tier, TierStats>;
    for (const tier of TIERS) {
      const tierSet = new Set(BUDGET_TIER_MAP[tier] as readonly number[]);
      const pool = groupVenues.filter(
        (v) =>
          tierSet.has(tierOf(v)) &&
          isFridayEveningOpen(v) &&
          isOperational(v),
      );
      perTier[tier] = countItinerariesForTier(pool);
    }

    const counts = TIERS.map((t) => perTier[t].itineraries);
    const sorted = [...counts].sort((a, b) => a - b);
    const worst = sorted[0];
    const mid = sorted[1];

    const itinerariesByTier = TIERS.reduce(
      (acc, t) => {
        acc[t] = perTier[t].itineraries;
        return acc;
      },
      {} as Record<Tier, number>,
    );

    reports.push({
      groupId,
      label: group.label,
      bakedVenueCount: group.venueCount,
      liveVenueCount: groupVenues.length,
      medianPairKm: medianPairKm(groupVenues),
      perTier,
      itinerariesByTier,
      survives25Worst: worst >= 25,
      survives25Mid: mid >= 25,
      survives50Worst: worst >= 50,
      survives50Mid: mid >= 50,
      survives100Worst: worst >= 100,
      survives100Mid: mid >= 100,
    });
  }

  reports.sort((a, b) => {
    const aw = Math.min(...TIERS.map((t) => a.perTier[t].itineraries));
    const bw = Math.min(...TIERS.map((t) => b.perTier[t].itineraries));
    return aw - bw;
  });
  return reports;
}

// ── JSON output mode — for the generate-configs.py orchestrator ──
// Emits a single line of JSON to stdout. Shape:
//   { generatedAt: ISO, groups: [{ groupId, label, venueCount,
//     itinerariesByTier: {casual, nice_out, splurge}, medianPairKm }] }
function emitJson(reports: GroupReport[]): void {
  const out = {
    generatedAt: new Date().toISOString(),
    groups: reports.map((r) => ({
      groupId: r.groupId,
      label: r.label,
      venueCount: r.liveVenueCount,
      itinerariesByTier: r.itinerariesByTier,
      medianPairKm: r.medianPairKm,
    })),
  };
  process.stdout.write(JSON.stringify(out));
}

// ── Markdown output mode — for docs/ inspection ──
function emitMarkdown(reports: GroupReport[]): void {
  const TODAY = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Native composability per neighborhood group — ${TODAY}\n`);
  lines.push(
    `Generated by \`scripts/native-composability.ts\`. Each cell counts the distinct (main, stop1) pairs that satisfy ALL hard filters with NO relaxation, NO cascade, NO widening, NO degradation. Default compose shape (2 stops), Friday evening (17:00–22:00, strictest common slot), per-budget-tier separately. See \`docs/algorithm-relaxation-audit.md\` for which rules are suppressed.\n`,
  );
  lines.push(
    `Bar semantics: **worst-tier rule** requires \`min(casual, nice_out, splurge) ≥ bar\` (the group works at every tier the questionnaire offers). **Mid-tier rule** requires the middle (median) of the three tier counts \`≥ bar\` (the group works at most tiers; relaxes the strictness). The mid-tier @ 25 rule is what's live in \`src/config/group-visibility.ts\`.\n`,
  );

  lines.push(`## Table 1 — decision table\n`);
  lines.push(
    `| group | venues (live / baked) | itineraries casual / mid / splurge | med pair km | 25-worst | 25-mid | 50-worst | 50-mid | 100-worst | 100-mid |`,
  );
  lines.push(
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  );
  for (const r of reports) {
    const venues = `${r.liveVenueCount} / ${r.bakedVenueCount}`;
    const counts = TIERS.map((t) => r.perTier[t].itineraries).join(" / ");
    const tick = (b: boolean) => (b ? "✓" : "✗");
    lines.push(
      `| ${r.label} | ${venues} | ${counts} | ${r.medianPairKm} | ${tick(r.survives25Worst)} | ${tick(r.survives25Mid)} | ${tick(r.survives50Worst)} | ${tick(r.survives50Mid)} | ${tick(r.survives100Worst)} | ${tick(r.survives100Mid)} |`,
    );
  }

  lines.push(`\n## Table 2 — sourcing worklist\n`);
  lines.push(
    `For each group that fails a given bar, the per-tier gap framed in role-sourcing terms. \`+N mains\` means "this tier needs N additional main-role venues in this group" (under the simplifying assumption that the new venues clear the Friday-evening + operational + tier-membership filters AND the proximity cap to enough existing stop1s). \`+N stop1s\` is the analogous count of opener/closer-eligible venues. Whichever role-add is smaller is the cheaper path. **These are lower bounds** — proximity, role overlap, and the strictest-slot assumption all push the real sourcing number up.\n`,
  );
  lines.push(
    `Bars listed: 25-worst, 50-worst, 100-worst (the strictest reading per bar). Mid-tier rule failures are a subset of worst-tier failures by definition.\n`,
  );

  function gapsFor(r: GroupReport, bar: number): string[] {
    const counts = TIERS.map((t) => r.perTier[t].itineraries);
    if (Math.min(...counts) >= bar) return [];
    const rows: string[] = [];
    for (const tier of TIERS) {
      const s = r.perTier[tier];
      if (s.itineraries >= bar) continue;
      if (s.mains === 0 && s.stop1s === 0) {
        rows.push(`| ${r.label} | ${tier} | ${s.itineraries} | ${bar - s.itineraries} | needs mains AND stop1s from scratch |`);
        continue;
      }
      const addMains =
        s.stop1s > 0 ? Math.ceil((bar - s.itineraries) / s.stop1s) : null;
      const addStop1s =
        s.mains > 0 ? Math.ceil((bar - s.itineraries) / s.mains) : null;
      const candidates: string[] = [];
      if (addMains !== null) candidates.push(`+${addMains} mains`);
      if (addStop1s !== null) candidates.push(`+${addStop1s} stop1s`);
      candidates.sort(
        (a, b) =>
          parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10),
      );
      rows.push(
        `| ${r.label} | ${tier} | ${s.itineraries} | ${bar - s.itineraries} | ${candidates.join(" OR ")} |`,
      );
    }
    return rows;
  }

  for (const bar of [25, 50, 100]) {
    lines.push(`### Bar = ${bar} (worst-tier rule)\n`);
    const rows = reports.flatMap((r) => gapsFor(r, bar));
    if (rows.length === 0) {
      lines.push(`_All groups pass._\n`);
      continue;
    }
    lines.push(`| group | failing tier | current | gap | cheapest sourcing |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    rows.forEach((row) => lines.push(row));
    lines.push("");
  }

  process.stdout.write(lines.join("\n"));
}

async function main(): Promise<void> {
  const wantJson = process.argv.includes("--json");
  const reports = await computeReports();
  if (wantJson) emitJson(reports);
  else emitMarkdown(reports);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
