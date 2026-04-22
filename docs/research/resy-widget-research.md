# Resy Widget Research Report

## Summary

We can replicate Corner's booking flow exactly — no Resy partnership, no API key, no domain lock needed. Users tap a time slot in our UI and get Resy's "Complete your reservation" screen inline.

## How It Works

Corner's approach (confirmed via Proxyman network capture):

1. **Fetch availability** from Resy's API server-side (we already do this via `POST /4/find`)
2. **Show slots in their own UI** (we already built this in Phase 3a-3)
3. **Open `widgets.resy.com`** with a `#/reservation-details` hash route that includes the full reservation config as a URL-encoded JSON param

### The URL format

```
https://widgets.resy.com/#/reservation-details
  ?reservation={JSON config}
  &date=2026-04-22
  &seats=2
  &tableConfigId={rgs://token}
  &venueId=69589
  &ref=https://resy.com/cities/new-york-ny/venues/{slug}
  &src=resy.com-venue-details
```

Key details:
- **No apiKey param needed** — the `#/reservation-details` route doesn't require one
- **ref is set to resy.com** — Corner pretends to be resy.com, bypassing any domain check
- **reservation param** is a JSON object containing: token, time, venue name, type, payment info, template ID
- **No authentication required** — widget shows "Login" button; user logs into their Resy account within the widget

### The reservation JSON

```json
{
  "venueName": "Bibliotheque",
  "featureRecaptcha": false,
  "templateId": 2518396,
  "time": "2026-04-22 17:00:00",
  "token": "rgs://resy/69589/2518396/2/2026-04-22/2026-04-22/17:00:00/2/1",
  "type": "Lounge",
  "payment": { "is_paid": false, ... },
  "allow_bypass_payment_method": 1,
  "isEligible": true,
  "hasAddOns": false,
  "hasMenus": false,
  "serviceTypeName": "dinner"
}
```

Most of these fields come directly from the `/4/find` API response — we already have them.

## What We Tested

| Test | Result |
|------|--------|
| Widget loads without apiKey | Yes |
| Date pre-filled | Yes |
| Seats pre-filled | Yes |
| Time slot pre-selected | Yes — goes straight to "Complete reservation" |
| Works across venues (LELABAR, Bibliotheque) | Yes |
| Works in iframe | Yes |
| Works in new tab | Yes |
| Mobile rendering | Full-height, scrollable, clean |
| User can complete booking | Yes (needs Resy login within widget) |

## What Didn't Work (Dead Ends)

1. **embed.js `openModal()`** — domain-locked via apiKey, requires Resy partnership
2. **Widget iframe with query params** — widget ignores date/seats/time in query string
3. **postMessage config injection** — widget doesn't listen for config via postMessage
4. **`#/account/reservations-and-notify/{token}`** — requires authenticated Resy session
5. **`#/venues/{venueId}` with params** — loads venue page but ignores all pre-fill params

## Recommendation

**Integrate the `#/reservation-details` approach into the itinerary page.** Replace the current "Book on Resy" redirect with an inline iframe/modal that opens the widget with the slot token pre-loaded. User flow:

1. Generate itinerary → see available time slots per stop
2. Tap a time → "Book 7:30 PM on Resy" button appears
3. Tap button → Resy widget opens inline with "Complete your reservation"
4. User logs into Resy (if needed) and confirms

This is the same UX Corner provides, implemented as a web modal instead of a native webview.

## Files

- `src/app/widget-test/page.tsx` — throwaway test page (delete after integration)
- `src/app/api/resy-proxy/route.ts` — throwaway CORS proxy (delete after integration)
- `widget-test-report.md` — this report
