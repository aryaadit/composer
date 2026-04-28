/**
 * Deterministic seeded random for itinerary generation.
 *
 * Same request inputs → same seed → same jitter → same itinerary.
 * Uses FNV-1a 32-bit hash + Mulberry32 PRNG — both well-known, zero
 * dependencies, fast, and produce good distribution for this use case.
 */

import type { GenerateRequestBody } from "@/types";

/**
 * Compute a deterministic 32-bit seed from the request body.
 *
 * Hashes scoring-relevant fields: occasion, vibe, budget, timeBlock,
 * day, neighborhoods (sorted), and excludeVenueIds (sorted). Arrays
 * are sorted before hashing so field order doesn't affect the seed.
 *
 * Fields excluded from hash: partySize (hardcoded to 2), drinks/dietary
 * (per-user profile, not request-specific).
 *
 * @param body - The POST request body from /api/generate.
 * @returns A 32-bit unsigned integer seed for createSeededRandom().
 */
export function computeRequestSeed(body: GenerateRequestBody): number {
  const parts = [
    body.occasion,
    body.vibe,
    body.budget,
    body.timeBlock,
    body.day,
    ...[...(body.neighborhoods ?? [])].sort(),
    ...[...(body.excludeVenueIds ?? [])].sort(),
  ];
  return fnv1a32(parts.join("|"));
}

/**
 * Create a seeded PRNG function (Mulberry32 algorithm).
 *
 * Each call to the returned function produces the next value in [0, 1),
 * same interface as Math.random() but deterministic given the seed.
 *
 * @param seed - 32-bit integer seed from computeRequestSeed().
 * @returns A function that produces the next pseudo-random number on each call.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash. */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
