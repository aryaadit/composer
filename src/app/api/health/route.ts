// Diagnostic endpoint — verifies the three layers Composer depends on:
//   1. Supabase connection (venue DB reachable + non-empty)
//   2. Scoring pipeline (hard filters + scorer produce sane output)
//   3. Gemini API (model reachable, round-trip latency)
//
// This is a READ-ONLY endpoint. It does not mutate the DB, does not call
// OpenWeatherMap, and does not run Claude/Gemini copy generation. It
// deliberately returns counts, names, and scores — never raw venue
// contents, never secrets, never full error stacks that could leak config.
//
// Usage: GET /api/health → JSON report. Intended for manual verification
// after deploys and as a quick "is prod healthy?" check.

import { NextResponse } from "next/server";
import { GoogleGenerativeAI, GenerationConfig } from "@google/generative-ai";
import { getSupabase } from "@/lib/supabase";
import { pickBestForRole } from "@/lib/scoring";
import { GEMINI_MODEL } from "@/config/prompts";
import type { QuestionnaireAnswers, Venue } from "@/types";

// Health checks are always dynamic — never cache the report.
export const dynamic = "force-dynamic";
// Max time to wait on the Gemini ping before we call the check failed.
const GEMINI_TIMEOUT_MS = 8000;

// Fixed test input for the scoring check. Chosen to be both common and
// discriminating: first-date + West Village + nice-out + food-forward
// should exercise the full stack of hard filters and produce a reliable
// top venue every time.
const SCORING_TEST_INPUT: QuestionnaireAnswers = {
  occasion: "first-date",
  neighborhoods: ["west-village"],
  budget: "nice-out", // price_tier 2, the slug for the "$$ Nice Out" option
  vibe: "food-forward",
  day: new Date().toISOString().split("T")[0],
  startTime: "18:00",
  endTime: "22:00",
};

interface SupabaseCheck {
  ok: boolean;
  active_venue_count?: number;
  error?: string;
}

interface ScoringCheck {
  ok: boolean;
  input?: QuestionnaireAnswers;
  hard_filtered?: number;
  scored?: number;
  top3?: { name: string; neighborhood: string; price_tier: number; score: number }[];
  error?: string;
}

interface GeminiCheck {
  ok: boolean;
  latency_ms?: number;
  response?: string;
  error?: string;
}

interface HealthReport {
  ok: boolean;
  timestamp: string;
  checks: {
    supabase: SupabaseCheck;
    scoring: ScoringCheck;
    gemini: GeminiCheck;
  };
}

// Count venues that survive the same hard filters the scorer applies for the
// "main" role. Mirrors `lib/scoring.ts` hardFilter intentionally so we can
// report it independently of the scorer's internal state.
function countHardFiltered(venues: Venue[], input: QuestionnaireAnswers): number {
  return venues.filter((v) => {
    if (!v.active) return false;
    if (!v.stop_roles.includes("main")) return false;
    if (
      input.neighborhoods.length > 0 &&
      !input.neighborhoods.includes(v.neighborhood)
    ) {
      return false;
    }
    return true;
  }).length;
}

async function checkSupabase(): Promise<SupabaseCheck> {
  try {
    const supabase = getSupabase();
    const { count, error } = await supabase
      .from("composer_venues")
      .select("*", { count: "exact", head: true })
      .eq("active", true);
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, active_venue_count: count ?? 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

async function checkScoring(): Promise<ScoringCheck> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("composer_venues")
      .select("*")
      .eq("active", true);
    if (error) {
      return { ok: false, error: error.message };
    }
    const venues = (data ?? []) as Venue[];

    const hardFiltered = countHardFiltered(venues, SCORING_TEST_INPUT);

    // Score with the same scorer the production route uses. Weather = null
    // so outdoor_seating isn't filtered out. jitter = 0 for determinism.
    const { scored } = pickBestForRole(
      venues,
      "main",
      SCORING_TEST_INPUT,
      null,
      new Set<string>(),
      null,
      0
    );

    const top3 = scored.slice(0, 3).map((v) => ({
      name: v.name,
      neighborhood: v.neighborhood,
      price_tier: v.price_tier,
      score: Math.round(v.score * 100) / 100,
    }));

    return {
      ok: scored.length > 0,
      input: SCORING_TEST_INPUT,
      hard_filtered: hardFiltered,
      scored: scored.length,
      top3,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

async function checkGemini(): Promise<GeminiCheck> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY not configured" };
  }

  const start = Date.now();
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    // Disable thinking the same way the copy path does — this is a latency
    // check, not a reasoning check. Without this the ping can burn the
    // whole token budget on reasoning tokens.
    const generationConfig = {
      maxOutputTokens: 10,
      thinkingConfig: { thinkingBudget: 0 },
    } as GenerationConfig;

    const resultPromise = model.generateContent({
      contents: [
        { role: "user", parts: [{ text: "Reply with the word OK and nothing else." }] },
      ],
      generationConfig,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${GEMINI_TIMEOUT_MS}ms`)), GEMINI_TIMEOUT_MS)
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);
    const text = result.response.text().trim();
    const latency_ms = Date.now() - start;

    return {
      ok: text.length > 0,
      latency_ms,
      // Truncate defensively in case the model ignores "nothing else" —
      // we never want to return a wall of text from a diagnostic.
      response: text.slice(0, 40),
    };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

export async function GET() {
  const [supabase, scoring, gemini] = await Promise.all([
    checkSupabase(),
    checkScoring(),
    checkGemini(),
  ]);

  const report: HealthReport = {
    ok: supabase.ok && scoring.ok && gemini.ok,
    timestamp: new Date().toISOString(),
    checks: { supabase, scoring, gemini },
  };

  // Return 200 even on partial failure so the body is readable in a browser;
  // callers inspect `ok` + per-check flags to decide whether to page anyone.
  return NextResponse.json(report);
}
