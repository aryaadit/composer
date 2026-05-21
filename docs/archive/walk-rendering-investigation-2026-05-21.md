# Walk-segment rendering — investigation

**Date:** 2026-05-21
**Trigger:** Adit pushed back on the 2026-05-20 launch recon's claim that walk segments render text-only when `MAPBOX_TOKEN` is missing. Production behavior didn't match.

The recon's literal claim about `WalkConnector` is correct, but the inference that production was rendering text-only was an unverified assumption. Here's the precise picture.

---

## 1. `WalkConnector.tsx` — full render behavior

The component has exactly two render states, both wrapped in the same outer `motion.div`:

**Always renders (regardless of `mapUrl`):**
- Outer `<motion.div>` with `className="flex flex-col items-center gap-2 py-5"` — flex column, centered, `gap-2` between children, `py-5` (~20px) vertical padding
- Fade-in entrance animation (`opacity 0→1`, 0.3s, with `delay: index * 0.15 + 0.1` so stops cascade)
- `<span className="font-sans text-xs text-muted whitespace-nowrap">{walkMinutes} min walk</span>` caption

**Only renders when `mapUrl` is truthy (line 23: `{mapUrl && (...)}`)**:
- `<img>` with `src={mapUrl}`, `alt="${walkMinutes} minute walking route"`, `loading="lazy"`, `width={512}`, `height={120}`, `className="w-full max-w-lg h-[120px] object-cover rounded-lg"`

**When `mapUrl` is null/undefined/empty-string:** the `&&` short-circuits, the `<img>` is not in the tree at all. **No skeleton, no placeholder icon, no neutral background, no "map unavailable" affordance.** Just the caption text centered in the `py-5` wrapper, with surrounding vertical space.

So if the user is seeing **a 512×120 burgundy-route map between each pair of stops**, that's the truthy branch — the map URL is being constructed successfully. The recon was right that there's no fallback UI; it was wrong to assume the fallback branch was active in prod.

---

## 2. `mapbox.ts` — full env + export surface

**Env vars read** (single source, no fallback chain):

| Line | Code | Notes |
|---|---|---|
| 12 | `const TOKEN = process.env.MAPBOX_TOKEN ?? ""` | Server-side only. No `NEXT_PUBLIC_*`. No `MAPBOX_ACCESS_TOKEN` legacy fallback. No second env var anywhere in the file. |

**Exports:**

| Function | Signature | Returns when `MAPBOX_TOKEN` is empty |
|---|---|---|
| `buildWalkMapUrl(fromLat, fromLon, toLat, toLon)` | `Promise<string \| null>` | `null` (logs `[mapbox] MAPBOX_TOKEN not set; walk maps disabled` and short-circuits at line 50 before hitting the API) |

**Internal-only:**
- `fetchWalkingPolyline()` — also returns `null` on non-2xx Directions API response or on any throw

So when the token is missing, `buildWalkMapUrl` returns `null` and `walks[i].map_url` ends up `null` → `WalkConnector` text-only path. There's no second URL builder, no static fallback, no degraded image variant.

---

## 3. Walk-rendering surface count

Grepping all of `src/components/` for `Walk|walk|stroll|route|distance`:

- **`WalkConnector.tsx`** — the only visual walk-segment renderer
- `StepLoading.tsx:24` — `walk_explore: ["Mapping a good route...", ...]` — loading copy dictionary, not visual
- `StopStatusBadge.tsx:7` — `"Walk-in"` — reservation pill, unrelated concept
- `StopCard.tsx:42` — `"Walk-in welcome"` — same, reservation copy

**No second walk-renderer exists.** The grep is conclusive.

---

## 4. `ItineraryView.tsx` — prop wiring

`ItineraryView.tsx:128-134`:
```tsx
{i < stops.length - 1 && walks[i] && (
  <WalkConnector
    walkMinutes={walks[i].walk_minutes}
    index={i}
    mapUrl={walks[i].map_url}
  />
)}
```

`walks[i].map_url` originates server-side. Two construction sites:
- `api/generate/route.ts:297-314` — main generation
- `api/add-stop/route.ts:125` — adding a stop

Both call `buildWalkMapUrl(...)` from `lib/mapbox.ts` directly. **No alternate URL source, no client-side computation, no NEXT_PUBLIC fallback.** The `map_url` field is whatever `buildWalkMapUrl` returned at generation time, frozen into the response.

---

## 5. Static fallback images

`public/` contents:
```
amex-dining.svg     chase-sapphire.svg    composer-lockup.png
composer-lockup.svg composer-mark.svg     file.svg
globe.svg           next.svg              vercel.svg
window.svg
```

All brand/UI assets. **No walk-, route-, or map-related image checked in anywhere.** No fallback image is being served from `public/` to fill the missing-map slot.

---

## What the recon got wrong

The recon stated:
> "Walk segments render as text-only when MAPBOX_TOKEN is missing"

That statement, in isolation, is **accurate** — that's exactly what WalkConnector does in the null branch. But the recon then **inferred** that production was in that state, based on two pieces of indirect evidence:

1. `.env.local` (my local copy) didn't contain `MAPBOX_TOKEN`
2. CLAUDE.md had drift (`MAPBOX_ACCESS_TOKEN` vs the code's `MAPBOX_TOKEN`), so I assumed whoever set up Vercel might have copied the wrong key name

**Neither was sufficient evidence about Vercel's actual state.** Per CLAUDE.md:56 — "every required env var must also be set in the Vercel project" — env mirroring is an operator task Adit handles directly. The codebase has no visibility into the Vercel dashboard. The recon should have flagged this as **"verify in Vercel"**, not asserted prod was degraded.

If the user is seeing the actual Mapbox static maps in production (burgundy-route lines on a light-v11 base style, 512×120, with pin markers at endpoints, rounded corners), then **`MAPBOX_TOKEN` IS set in Vercel and the system is working as designed.** The "broken map placeholder" framing in the recon was the wrong call.

---

## Adjacent finding (not asked, worth flagging)

`/itinerary/saved/[id]/page.tsx` rebuilds walks client-side via `rebuildWalks()` and does **not** call `buildWalkMapUrl` — saved-itinerary `walks[i].map_url` is always `undefined`. So **saved-itinerary views always render text-only walk segments**, regardless of `MAPBOX_TOKEN`. That's a real gap (the user might notice it if they open a saved plan), but it's by design — the saved row doesn't carry `map_url` and rebuilding it would require either persisting it or re-hitting Mapbox at read time. Out of scope for this investigation, but flagging in case it explains a related complaint.
