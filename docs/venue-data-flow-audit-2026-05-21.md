# Venue / neighborhood data flow audit

**Date:** 2026-05-21
**Trigger:** Need to understand what reads from what before deciding where to apply data fixes for orphan slugs like `midtown` and `nyc`.

## 1. `scripts/generate-configs.py` — every external read

The script has **exactly two external data sources**: a single Google Sheet (one tab), and Supabase (one table). Everything else is hand-written constants in the same Python file.

### Read A — Google Sheet `Master Reference` tab

- **Source identity:** Sheet ID hardcoded at `scripts/generate-configs.py:33` — `"1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg"`. Auth via `GOOGLE_SHEETS_CLIENT_EMAIL` + `GOOGLE_SHEETS_PRIVATE_KEY` or fallback service-account JSON (`docs/palate-composer-67baf1d883e3.json`). `generate-configs.py:42-77`
- **Tab + range:** All reads go through `read_sheet_column()` (`generate-configs.py:121-138`) which fetches `Master Reference!{col}3:{col}` — a single column from row 3 down. Row 1 is a note, row 2 is column headers, row 3+ is values.
- **Columns pulled** (column letters mapped to taxonomy at `generate-configs.py:351-354`):

| Sheet column | Reader function | Produces |
|---|---|---|
| `Master Reference!A` | `read_neighborhoods()` L356-359 | `ALL_NEIGHBORHOODS` in `src/config/generated/neighborhoods.ts` |
| `Master Reference!B` | `read_categories()` L362-365 | `CATEGORIES` in `categories.ts` |
| `Master Reference!D` | `read_vibe_tags()` L368-371 | partition into `SCORED_VIBE_TAGS` / `CROSS_CUTTING_VIBE_TAGS` in `vibes.ts` |
| `Master Reference!E` | `read_occasions()` L374-377 | `OCCASIONS` in `occasions.ts` |
| `Master Reference!F` | `read_stop_roles()` L380-383 | _read but **not** consumed by the emitter_ (the script's `ALL_STOP_ROLES` comes from the hand-curated Python constant `STOP_ROLE_EXPANSION` keys at L337-344, not the sheet) |

Each reader filters through `is_slug()` (`generate-configs.py:145-147`) — `re.fullmatch(r"[a-z0-9_]+", s)` — so display labels in the sheet are dropped but any lowercase-snake-case string survives. **No taxonomy-shape validation** beyond the regex.

### Read B — Supabase `composer_venues_v2` table

- **Function:** `fetch_venue_counts_by_neighborhood()` at `generate-configs.py:96-118`
- **Query:** `composer_venues_v2.select("neighborhood").eq("active", true)` — paginated 1000 rows at a time
- **Aggregation:** count rows per `neighborhood` slug value
- **Consumer:** the per-group `venueCount` baked into `NEIGHBORHOOD_GROUPS` at emit time (L462 — `sum(counts.get(s, 0) for s in g["slugs"])`)

### Outputs produced

`OUTPUTS` table at `generate-configs.py:534-541` — 6 files in `src/config/generated/`:

| File | Emitter | Sources |
|---|---|---|
| `vibes.ts` | `emit_vibes` | sheet col D + `VIBE_SCORING_MATRIX` constant |
| `neighborhoods.ts` | `emit_neighborhoods` | sheet col A + `NEIGHBORHOOD_GROUPS` constant + Supabase venue counts |
| `stop-roles.ts` | `emit_stop_roles` | **`STOP_ROLE_EXPANSION` Python constant only** — does not read the sheet despite `read_stop_roles()` existing |
| `budgets.ts` | `emit_budgets` | `BUDGET_TIERS` Python constant only |
| `occasions.ts` | `emit_occasions` | sheet col E |
| `categories.ts` | `emit_categories` | sheet col B |

---

## 2. `ALL_NEIGHBORHOODS` — literal source

Chain backwards from the generated file:

1. **Generated file:** `src/config/generated/neighborhoods.ts:165` — `export const ALL_NEIGHBORHOODS: string[] = [...]`.
2. **Emitter:** `emit_neighborhoods()` at `generate-configs.py:442-476`, specifically line 474: `lines.append(emit_string_array("ALL_NEIGHBORHOODS", all_hoods))`. Here `all_hoods = read_neighborhoods(service)` at line 443.
3. **Reader:** `read_neighborhoods()` at `generate-configs.py:356-359`:
   ```python
   def read_neighborhoods(service) -> list[str]:
       """All neighborhood slugs from column A."""
       raw = read_sheet_column(service, "Master Reference", "A")
       return [v for v in raw if is_slug(v)]
   ```
4. **Underlying call:** `read_sheet_column(service, "Master Reference", "A")` at `generate-configs.py:121-138` hits `spreadsheets.values.get(spreadsheetId=SHEET_ID, range="Master Reference!A3:A")`.

**Confirmed source:** Google Sheet `1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg` → tab `Master Reference` → range `A3:A` → filtered to lowercase-snake-case strings only. No Supabase involvement in the slug list itself (Supabase only contributes the per-group `venueCount` numbers, not the slug membership).

---

## 3. Venue sync code path

Completely separate file tree from `generate-configs.py`. Lives in `src/lib/venues/` — the consolidated TS importer module.

- **Entry point:** `src/lib/venues/sheet.ts:75` — `readSheetRows()`. Auth via the same env-var pattern as the Python script.
- **Sheet ID:** Read from `process.env.GOOGLE_SHEET_ID` at `sheet.ts:38-43` — not hardcoded. Throws immediately if unset.
- **Tab + range:** `src/lib/venues/config.ts:15` — `VENUE_SHEET_TAB = "NYC Venues"`. Headers from `A2:CD2` (config.ts:25), data from `A3:CD` (config.ts:28). Composed into the request at `sheet.ts:28-29` as `"NYC Venues!A2:CD2"` and `"NYC Venues!A3:CD"`.
- **Does NOT touch Master Reference.** Verified via `grep -rn 'Master Reference' src/lib/venues/` — zero hits.

The importer's only contact with Master Reference data is **indirect**: at `src/lib/venues/import.ts:24` it imports `ALL_NEIGHBORHOODS` from the already-generated `src/config/generated/neighborhoods.ts`, used in `assertions.ts:128-165` as the canonical-set the `"Canonical neighborhoods"` Layer-2 assertion checks against. So the assertion's "canonical" set is whatever Master Reference column A said at the last `npm run generate-configs` run.

---

## 4. "Master Reference" references — every hit in the repo

`grep -rni 'master.reference\|master_reference'` (excluding `node_modules`, `.next/`):

| File:line | What |
|---|---|
| `scripts/generate-configs.py:5`, L10, L122, L348-354, L358, L364, L370, L376, L382 | The script that reads it |
| `CLAUDE.md:176`, L521, L524, L548 | Docs telling operators to edit Master Reference |
| `CODING_STANDARDS.md:96` | "Synced from sheet, do not hardcode" rule |
| `README.md:172`, L247 | Run-book entry |
| `docs/archive/*` (5 files) | Historical research only |
| `docs/debug/venue-sheet-phase2-report.md`, `venue-v1-to-v2-diff.md` | Historical debug docs |

**Conclusion:** The ONLY code path that reads Master Reference is `scripts/generate-configs.py`. The TS importer, the Next.js app, the questionnaire, and the scoring pipeline never read it directly — they all consume the snapshot files in `src/config/generated/` that `generate-configs.py` emits. So Master Reference is effectively a **build-time taxonomy whitelist that gets baked into compiled config**.

---

## 5. Tracing `midtown` and `nyc` backwards

`grep -oE '"(midtown|nyc|hells_kitchen)"' src/config/generated/neighborhoods.ts` confirms both `"midtown"` and `"nyc"` appear in the `ALL_NEIGHBORHOODS` array at `generated/neighborhoods.ts:165` (positions 41 and 49 in the array — `"midtown", "midtown_east", "midtown_west"` and `"noho", "nolita", "nomad", "nyc", "park_slope"`).

Chain backwards:

1. They're in `ALL_NEIGHBORHOODS` because `read_neighborhoods()` returned them at the last regeneration (2026-05-01 per the file header).
2. That function reads `Master Reference!A3:A` directly with no transformation beyond the snake-case regex filter. Both `midtown` and `nyc` pass `is_slug()` (lowercase, alphanumeric+underscore).
3. So **a curator (Reid or Adit) typed `midtown` and `nyc` into column A of the `Master Reference` tab** at some point. The script faithfully passed them through.

**Consequences:**
- The TS importer's Layer-2 assertion at `assertions.ts:128-165` accepts venues with `neighborhood = "midtown"` or `"nyc"` as **canonical** — they're in the set (`config.ts:53-55` requires ≥95% in the canonical set; `midtown`/`nyc` venues pass).
- **`NEIGHBORHOOD_GROUPS` (the hand-written Python constant at `generate-configs.py:164-318`) does NOT reference either slug.** Specifically:
  - `midtown_west` (L208-213) has `slugs: ["midtown_west"]` — no `"midtown"`
  - `midtown_east` (L214-219) has `slugs: ["midtown_east"]` — no `"midtown"`
  - No group anywhere references `"nyc"` or `"hells_kitchen"`
- Net effect: venues with `neighborhood = "midtown"` or `"nyc"` (or `"Hell's Kitchen"`, which wasn't even snake_case so it presumably comes from a curator typo) exist in `composer_venues_v2`, pass the import canonical-coverage check, but are **orphaned from the picker** — no NEIGHBORHOOD_GROUPS entry has them in its `slugs` array, so no UI group ever surfaces them, and selecting any group never includes them in the expanded slug set.
- These orphan venues are still scored when a user picks no neighborhoods (the no-filter path), so they can land in itineraries — just not via the neighborhood-picker route.

To fix `midtown` and `nyc`: either reassign those venues in the `NYC Venues` tab to a specific snake_case slug (e.g., `midtown_west` / `midtown_east`), then run an import; or extend a `NEIGHBORHOOD_GROUPS` entry's `slugs` array to absorb them, then run `npm run generate-configs`. The Master Reference tab itself can also be cleaned by removing the stray `midtown` / `nyc` entries — but that's only effective if no venue row still uses them.

---

## 6. Final summary (one paragraph)

When a curator types a row into the **`NYC Venues`** tab of Google Sheet `1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg`, the `npm run import-venues` flow (`src/lib/venues/sheet.ts` → `transform.ts` → `apply.ts`) reads `NYC Venues!A2:CD` and upserts into the Supabase table `composer_venues_v2`, gated by Layer-2 assertions including a ≥95% check that each row's `neighborhood` value appears in the canonical set `ALL_NEIGHBORHOODS`; that canonical set is the *snapshot* baked into `src/config/generated/neighborhoods.ts` the last time `npm run generate-configs` ran, and that script (`scripts/generate-configs.py`) builds the snapshot by reading **a different tab in the same sheet — `Master Reference!A3:A` — plus per-slug counts from Supabase**. The picker's `NEIGHBORHOOD_GROUPS` mapping that bundles raw slugs into the 25 UI groups is **NOT derived from either sheet**; it's a hand-written Python constant inside `generate-configs.py` at L164-318 that the script emits verbatim. So a venue tagged with a slug that exists in Master Reference but isn't listed in any `NEIGHBORHOOD_GROUPS[].slugs` array (current orphans: `midtown`, `nyc`, plus the literal `"Hell's Kitchen"` which shouldn't even pass `is_slug`) lands cleanly in the DB, passes the importer's canonical-coverage assertion, but never reaches the picker UI — fixable by either changing the venue's `neighborhood` cell in the sheet, or by extending the Python `NEIGHBORHOOD_GROUPS` constant to absorb the orphan slug and regenerating.
