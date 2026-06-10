// AUTO-GENERATED — DO NOT EDIT
// Source: Google Sheet 1ZH8CniJglou0A72e7U4b3nvtsa7tDRVMIAzNqMqEck8
// Generated: 2026-06-10T03:33:30.555839+00:00

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
    tiers: [1, 2],
  },
  splurge: {
    label: "Splurge ($$$)",
    tiers: [2, 3],
  },
  all_out: {
    label: "All Out ($$$$)",
    tiers: [3, 4],
  },
  no_preference: {
    label: "No Preference",
    tiers: [1, 2, 3, 4],
  },
};
