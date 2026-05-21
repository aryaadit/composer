# Runtime reads of `GOOGLE_SHEET_ID` — what executes on Vercel

**Date:** 2026-05-21
**Trigger:** About to swap the venue sheet source on Vercel; need to know exactly which Vercel env vars and code paths depend on `GOOGLE_SHEET_ID` so the update is scoped correctly.

## Hit-by-hit classification

### ✅ Runtime reads (will execute on Vercel)

**`src/lib/venues/sheet.ts:38`** — **the only actual `process.env.GOOGLE_SHEET_ID` read in the entire `src/` tree:**

```ts
export function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) {
    throw new Error("GOOGLE_SHEET_ID is required. Set it in .env.local.");
  }
  return id;
}
```

Also reads two paired credentials at runtime (`sheet.ts:49-50`):

```ts
client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, "\n"),
```

**Call chain into Vercel:**

```
POST /api/admin/sync-venues   ← Vercel runtime
  src/app/api/admin/sync-venues/route.ts
  ↓ imports { prepareApply, runApply, runApplySingleVenue, runPreflight, ... }
  src/lib/venues/import.ts
  ↓ imports { readSheetRows, fetchSheetMetadata, fetchTabNames } from "./sheet"
  src/lib/venues/sheet.ts  ← reads process.env.GOOGLE_SHEET_ID
```

So **one runtime surface** triggers the env read: the `/api/admin/sync-venues` endpoint. Every action it accepts (`preflight`, `preview`, `apply`, `sync_single`) eventually hits `getSheetId()`. The endpoint is admin-gated by `is_admin = true` on `composer_users`, and gates auth via the cookie session.

### ✅ Static-text mentions (NOT a runtime env read)

Three string-literal mentions of the var name — they don't cause `process.env` access:

- `src/app/api/admin/sync-venues/route.ts:21` — comment explaining the validation pattern.
- `src/app/profile/_components/syncCopy.ts:92` — admin error-recovery copy displayed when sanity assertions fail. Renders to the operator browser; the string contains the variable name as user-facing instruction text but does not read the env.
- `src/lib/venues/config.ts:13` — JSDoc reference.

### ❌ Local-only scripts (do NOT execute on Vercel)

These are not part of the Next.js build output and won't run in production:

- `scripts/generate-configs.py:33` — Python; runs via `npm run generate-configs` locally only. Doesn't even consult `GOOGLE_SHEET_ID` — has its own hardcoded `SHEET_ID = "1EdJqv..."`.
- `scripts/scrape_resy_v2.py:30` — Python; local-only one-off scraper. Same hardcoded `SHEET_ID`.
- `scripts/import-venues.ts` — tsx CLI; only invoked locally via `npm run import-venues`. Runs the same `src/lib/venues/import.ts` orchestrators but from the local shell, not from Vercel. (This one DOES read `GOOGLE_SHEET_ID` from env — via the same `sheet.ts` path — but only when the operator runs it manually.)

### ❌ No other Google Sheets API users

`rg "googleapis" src/` returned only:

- `src/lib/google-places.ts` — uses **Google Places API** (`places.googleapis.com`), not Sheets. Reads `GOOGLE_PLACES_API_KEY`, unrelated to `GOOGLE_SHEET_ID`.
- `src/lib/venues/sheet.ts` — the one already identified.

No other module imports `googleapis`. No other code anywhere in src/ calls Sheets API endpoints. The route at `/api/admin/venue/route.ts` is **DB-only** (queries `composer_venues_v2` for admin name-search) — never touches the sheet.

---

## Bottom line for the Vercel env update

**You only need ONE Vercel env var swap for runtime correctness:**

```
GOOGLE_SHEET_ID
  old: 1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg
  new: 1ZH8CniJglou0A72e7U4b3nvtsa7tDRVMIAzNqMqEck8
```

**Plus verify these auth vars are still set** (no change needed — same service account credentials work for the new sheet **only if you've shared the new sheet with the service account**):

- `GOOGLE_SHEETS_CLIENT_EMAIL` — same value
- `GOOGLE_SHEETS_PRIVATE_KEY` — same value

⚠️ **Operational gotcha worth confirming before redeploy:** the service account email from `GOOGLE_SHEETS_CLIENT_EMAIL` must have read access to the NEW sheet. If you created the new sheet from scratch, you'll need to "Share" it with the service account email (look at the Sheet's Share dialog → add the `*.iam.gserviceaccount.com` email as Viewer). Otherwise the first `/api/admin/sync-venues?action=preflight` call after redeploy will fail at sheet-fetch with a 403, which surfaces in the route's catch as a "preflight failed" error.

**You do NOT need to update on Vercel:**

- Any other env var
- Any code (the runtime read pulls from env, not from a baked constant)

**You DO still need on the local side (separate from Vercel):**

- `.env.local` value (the sheet-id-migration-plan covers this)
- `scripts/generate-configs.py:33` hardcoded value (or it'll read the wrong sheet on next `npm run generate-configs`)
- `scripts/scrape_resy_v2.py:30` if/when you re-run it

Nothing else in the codebase reads `GOOGLE_SHEET_ID` at runtime.
