// AUTO-GENERATED — DO NOT EDIT
// Source: Google Sheet 1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg
// Generated: 2026-05-01T10:19:33.444051+00:00

export interface BudgetTier {
  label: string;
  tiers: number[];
}

export const BUDGET_TIERS: Record<string, BudgetTier> = {
  casual: {
    label: "Casual ($)",
    tiers: [1],
  },
  nice_out: {
    label: "Nice Out ($$)",
    tiers: [2],
  },
  splurge: {
    label: "Splurge ($$$)",
    tiers: [3],
  },
  all_out: {
    label: "All Out ($$$$)",
    tiers: [4],
  },
  no_preference: {
    label: "No Preference",
    tiers: [1, 2, 3, 4],
  },
};
