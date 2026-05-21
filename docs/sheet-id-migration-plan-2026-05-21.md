# Sheet ID migration — plan + reference inventory

**Date:** 2026-05-21
**Trigger:** Switching venue sheet source.

- **OLD:** `1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg`
- **NEW:** `1ZH8CniJglou0A72e7U4b3nvtsa7tDRVMIAzNqMqEck8`

This doc captures Step 1 (reference inventory) and Step 2 (proposed diff). The actual file edits are gated on approval before Step 3.

---

## Step 1 — Reference inventory

### Files containing the OLD sheet ID

15 files total. Categorized:

**Code to update** (live behavior depends on these):
- `scripts/generate-configs.py:33` — hardcoded `SHEET_ID = "1EdJqv…"`. Does NOT read from env.
- `scripts/scrape_resy_v2.py:30` — hardcoded `SHEET_ID = "1EdJqv…"`. Does NOT read from env. One-off Resy scraping script.

**Auto-regenerated** (will update themselves on `npm run generate-configs`):
- `src/config/generated/budgets.ts:2`
- `src/config/generated/categories.ts:2`
- `src/config/generated/neighborhoods.ts:2`
- `src/config/generated/occasions.ts:2`
- `src/config/generated/stop-roles.ts:2`
- `src/config/generated/vibes.ts:2`

(All six just have `// Source: Google Sheet 1EdJqv…` in the AUTO-GENERATED comment header. They'll be rewritten by Step 4.)

**Authoritative root-level docs** (operator-facing):
- `CLAUDE.md:477` — "Current sheet ID: `1EdJqv…`"
- `README.md:156` — narrative
- `README.md:216` — `.env.local` example block: `GOOGLE_SHEET_ID=1EdJqv…`

**Archive / historical** (per saved-memory rule "skip docs/archive in audits"):
- `docs/archive/handoff-2026-05-01.md`
- `docs/archive/new-sheet-audit.md`
- `docs/archive/new-sheet-completeness.md`
- `docs/archive/import-workflow-audit.md`
- `docs/archive/venue-data-flow-audit-2026-05-21.md`

→ Recommend leaving archive untouched. These are point-in-time snapshots.

**Debug doc with pre-existing stale ID:**
- `docs/debug/admin-section-audit.md:19` already documents an even older ID (`14SGRyQ…`) as the "old" sheet. Leave alone.

### Files referencing `GOOGLE_SHEET_ID` (the env var name)

- `.env.example:12` — value is already the placeholder `your-venue-sheet-id-here`, no actual ID
- `.env.local` — has the OLD ID as the value (needs the value swap; no name change)
- `src/lib/venues/sheet.ts:38-40` — reads from env, throws if unset. ✅ No change needed.
- `src/lib/venues/config.ts:13` — JSDoc reference. ✅ No change.
- `src/app/api/admin/sync-venues/route.ts:21` — comment about validation pattern. ✅ No change.
- `src/app/profile/_components/syncCopy.ts:92` — admin error copy. ✅ No change.
- `README.md`, `CLAUDE.md`, archive docs — already covered above.

---

## Step 2 — Planned diff (BEFORE making any changes)

### (A) `.env.local` — value swap

```diff
-GOOGLE_SHEET_ID=1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg
+GOOGLE_SHEET_ID=1ZH8CniJglou0A72e7U4b3nvtsa7tDRVMIAzNqMqEck8
```

(Will preserve surrounding lines exactly; same backup pattern as the prior `.env.local.bak` flow if desired.)

### (B) `.env.example` — **no change**

The current value is already `your-venue-sheet-id-here` (a placeholder, no real ID). Spec said "keep it as a placeholder" and "don't put the real ID in .env.example" — so no edit needed.

### (C) `scripts/generate-configs.py:33`

```diff
-SHEET_ID = "1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg"
+SHEET_ID = "1ZH8CniJglou0A72e7U4b3nvtsa7tDRVMIAzNqMqEck8"
```

⚠️ Side note: this script hardcodes the ID and **does not consult `GOOGLE_SHEET_ID`** from env at all. This is the long-running known issue from the import-workflow-audit ("Sheet ID is hardcoded in 3 places"). The clean fix would be to make it read from env with the hardcoded value as a fallback. For this migration, simplest is just the value swap — but flag the structural issue.

### (D) `scripts/scrape_resy_v2.py:30`

```diff
-SHEET_ID = "1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg"
+SHEET_ID = "1ZH8CniJglou0A72e7U4b3nvtsa7tDRVMIAzNqMqEck8"
```

⚠️ This is the Resy venue-ID scraper — a one-off ops script, not run by `npm run generate-configs` or any test path. Updating means the **next time someone runs it**, it'll scrape against the new sheet. If that's intended, fine. If preferred to leave this pointing at the old sheet until actively re-run, skip this file.

### (E) `CLAUDE.md:477` — operator-facing current-state note

```diff
-**Current sheet ID:** `1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg` (referenced in `.env.local` and Vercel env vars only — there are no longer hardcoded copies in code).
+**Current sheet ID:** `1ZH8CniJglou0A72e7U4b3nvtsa7tDRVMIAzNqMqEck8` (referenced in `.env.local` and Vercel env vars only — Python scripts still hold a hardcoded copy each, kept in sync manually).
```

Wording fixed to also retract the "no longer hardcoded copies in code" claim — that was inaccurate given `generate-configs.py:33` + `scrape_resy_v2.py:30`.

### (F) `README.md` — two spots

```diff
-Venues are managed in a Google Sheet (current ID: `1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg`) and synced to Supabase…
+Venues are managed in a Google Sheet (current ID: `1ZH8CniJglou0A72e7U4b3nvtsa7tDRVMIAzNqMqEck8`) and synced to Supabase…
```

```diff
-GOOGLE_SHEET_ID=1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg
+GOOGLE_SHEET_ID=1ZH8CniJglou0A72e7U4b3nvtsa7tDRVMIAzNqMqEck8
```

### (G) `src/config/generated/*.ts` — **no manual edit**

These six files will be regenerated in Step 4 by `npm run generate-configs`. After regen the comment header will be `// Source: Google Sheet 1ZH8…` automatically.

---

## Summary of file change list

| File | Type | Action |
|---|---|---|
| `.env.local` | gitignored env | value swap |
| `.env.example` | template | **no change** (already placeholder) |
| `scripts/generate-configs.py` | Python | hardcoded value swap |
| `scripts/scrape_resy_v2.py` | Python | hardcoded value swap — **confirm intent** |
| `CLAUDE.md` | doc | sheet ID + wording fix |
| `README.md` | doc | sheet ID in 2 spots |
| `src/config/generated/*.ts` (6 files) | auto-gen | regenerated in Step 4 |
| `docs/archive/*` (5 files) | archive | leave alone |
| `docs/debug/admin-section-audit.md` | debug | leave alone |
| `src/lib/venues/sheet.ts` + sibling code | code | no change (reads from env) |

---

## Open decisions before Step 3

1. **`scrape_resy_v2.py` (D)** — update or skip? Skipping leaves it pointing at the dead sheet on next run; updating changes its target without an active sync action.
2. **`CLAUDE.md` + `README.md` doc updates (E + F)** — in scope for this commit, or do separately?
