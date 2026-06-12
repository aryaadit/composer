import { describe, expect, it } from "vitest";

// Regression tripwire for the 2026-06-12 lucky-revisit fix.
//
// composer_saved_itineraries stores inputs as decomposed typed columns
// (not as a JSONB blob), so any future field-by-field refactor of the
// INSERT in save.ts will silently drop new fields on inputs unless they
// get their own column AND get listed in the .insert(...) payload.
// `mode` was the casualty that broke lucky-revisit theming; this test
// pins that the write path keeps it.
//
// We grep the source rather than mocking Supabase because that's the
// pattern other tests in this repo use (failure-block-clearing,
// home-redesign, lucky-render, swap-undo-slot) — and the failure mode
// here is structural: a missing key on a literal object, exactly what
// source-grep catches reliably.

async function readSource(path: string) {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, "..", "..", "src");
  return readFileSync(join(srcRoot, ...path.split("/")), "utf-8");
}

describe("save.ts — INSERT must carry inputs.mode", () => {
  it("the INSERT payload includes a mode field sourced from inputs.mode", async () => {
    const src = await readSource("lib/itinerary/save.ts");
    // The save path destructures inputs and then INSERTs an explicit
    // column literal. Pin that `mode: inputs.mode ?? null` is in the
    // payload — without it the field silently drops on every save
    // because there's no JSONB column to absorb unmodeled keys.
    expect(src).toMatch(
      /\.insert\(\{[\s\S]*?mode:\s*inputs\.mode\s*\?\?\s*null[\s\S]*?\}\)/,
    );
  });

  it("destructures inputs (so a typo on inputs.mode would surface in code review)", async () => {
    const src = await readSource("lib/itinerary/save.ts");
    expect(src).toMatch(/const \{ inputs[\s\S]*?\} = itinerary/);
  });
});

describe("SavedItinerary type — declares the mode column", () => {
  it("includes a nullable mode field with the canonical mode union", async () => {
    const src = await readSource("types/index.ts");
    // The SavedItinerary interface must carry the mode field so
    // TypeScript catches save.ts / saved-hydration.ts drift before
    // it ships. Nullable for legacy rows.
    expect(src).toMatch(
      /export interface SavedItinerary[\s\S]*?mode\?:\s*"questionnaire" \| "lucky" \| "daily" \| null/,
    );
  });
});

describe("Migration — 20260612_add_mode_to_saved_itineraries.sql exists", () => {
  it("ships the migration that adds the mode column", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const migrationPath = join(
      here,
      "..",
      "..",
      "supabase",
      "migrations",
      "20260612_add_mode_to_saved_itineraries.sql",
    );
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf-8");
    // The migration MUST add the mode column to the saved table.
    // ADD COLUMN IF NOT EXISTS makes it safe to re-run.
    expect(sql).toMatch(
      /ALTER TABLE composer_saved_itineraries\s+ADD COLUMN IF NOT EXISTS mode TEXT/,
    );
    // Nullable per design (legacy rows). No NOT NULL constraint.
    expect(sql).not.toMatch(/mode TEXT NOT NULL/);
  });
});
