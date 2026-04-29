/**
 * Weighted random selection by rank.
 *
 * Used by `pickBestForRole` to sample from the top-N scored candidates
 * instead of always returning top-1. Adds variety while preserving
 * quality — higher-ranked items are more likely to be picked.
 *
 * Weights are positional: `weights[0]` applies to `items[0]` (the
 * highest-scored candidate). Weights are normalized internally, so
 * only relative magnitudes matter. Default weights from algorithm.ts
 * are `[5,4,3,2,1]` — #1 is 5x more likely than #5.
 *
 * @param items   - Candidates in rank order (best first).
 * @param weights - Rank-based weights. Defaults to 1 for any missing index.
 * @param random  - Seeded PRNG for deterministic selection.
 * @returns One item sampled according to the weight distribution.
 */
export function weightedPickByRank<T>(
  items: readonly T[],
  weights: readonly number[],
  random: () => number
): T {
  const w = items.map((_, i) => weights[i] ?? 1);
  const total = w.reduce((s, v) => s + v, 0);
  let r = random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= w[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
