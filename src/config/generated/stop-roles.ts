// AUTO-GENERATED — DO NOT EDIT (except `activity` row, see below)
// Source: Google Sheet 139gp-s2sBbEZbi4-6mrsMlhKykpoGWvuQdboMaAt20o
// Generated: 2026-04-27T07:22:41.113581+00:00
//
// NOTE: The `activity` row was manually edited (2026-04-28) to allow
// activities as Main. The sheet's Stop Roles tab MUST be updated with
// the same change before the next `npm run generate-configs` run, or
// this edit will revert.

export const ROLE_EXPANSION: Record<string, string[]> = {
  opener: ["opener"],
  main: ["main"],
  closer: ["closer"],
  drinks: ["opener", "closer"],
  activity: ["opener", "main"],
  coffee: ["opener"],
};

export const ALL_STOP_ROLES = ["opener", "main", "closer", "drinks", "activity", "coffee"] as const;
