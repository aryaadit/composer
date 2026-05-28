# Date picker desktop regression — fix applied — 2026-05-27

Follow-up to [date-picker-desktop-regression-diagnosis-2026-05-27.md](date-picker-desktop-regression-diagnosis-2026-05-27.md). Diagnosis approved, fix applied exactly as proposed, awaiting QA verification on real iOS device before commit.

## Diff applied

Single hunk in [src/components/questionnaire/WhenStep.tsx](../src/components/questionnaire/WhenStep.tsx). +13 lines, no other modifications.

```diff
diff --git a/src/components/questionnaire/WhenStep.tsx b/src/components/questionnaire/WhenStep.tsx
@@ -121,6 +121,19 @@ export function WhenStep({
             min={todayISO}
             value={customSelected ? day : ""}
             onChange={handleDatePicked}
+            onClick={(e) => {
+              // Desktop browsers don't auto-open the picker on a click that lands
+              // on the input's bounding box (only on the calendar icon, which
+              // appearance:none strips). showPicker() bridges that — requires user
+              // activation, which onClick provides. iOS Safari opens the picker
+              // natively before this fires; the call may then throw or no-op,
+              // either way harmless.
+              try {
+                e.currentTarget.showPicker?.();
+              } catch {
+                // iOS may throw NotAllowedError when picker is already open. Ignore.
+              }
+            }}
             aria-label="Pick a date"
             className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none bg-transparent"
           />
```

## Verification

- ✅ `npx tsc --noEmit` clean
- ✅ `npm run lint` clean — 0 errors, 4 pre-existing warnings (none touch WhenStep). No `react-hooks/purity` complaints, nothing flagged about the inline handler.
- ✅ `npm run build` succeeded

## Manual QA checklist

### DESKTOP (test in browser now)

Start `npm run dev` and navigate to `/compose`. Click through to the "When" step.

- [ ] **Chrome**: click "+ Pick a date" pill → native date picker opens (calendar popup)
- [ ] **Chrome**: pick a date in the picker → pill label updates to e.g. "Fri Jun 12"
- [ ] **Chrome**: click the now-formatted pill again → picker re-opens (this time with the previously-picked date pre-selected — `value={customSelected ? day : ""}`)
- [ ] **Safari** (if on macOS): same three checks
- [ ] **Firefox** (if installed): same three checks
- [ ] **Keyboard**: Tab through the day pills → focus lands on the date input (visible focus ring on the pill) → press Enter → picker opens
- [ ] **Keyboard, after pick**: arrow keys in picker should navigate days; Enter selects; Escape closes. (Standard native behavior — not our code, just verify nothing's broken.)
- [ ] **Console**: open DevTools, no `NotAllowedError` or any unexpected errors when clicking the pill
- [ ] **Built-in date pills still work**: clicking "Today", "Tomorrow", "Tue 3" etc. selects them normally — make sure the layered input didn't intercept clicks meant for sibling pills

### iOS (test on actual iPhone, not simulator)

The simulator's Safari is not a perfect proxy for real iOS — picker behavior especially differs. Use a real device. Point the phone at the dev machine (`http://<machine-lan-ip>:3000` over the same wifi) or push to a Vercel preview.

- [ ] **Safari**: tap "+ Pick a date" pill → native iOS wheel picker slides up from the bottom
- [ ] **Critical — no double-trigger**: picker opens ONCE and stays open. No flicker. No "picker opens then immediately closes" behavior. This is the iOS-specific regression risk from the new `showPicker()` call colliding with iOS's native open.
- [ ] **Critical — no console errors**: enable Safari remote debugging (Settings → Safari → Advanced → Web Inspector, then connect via macOS Safari → Develop menu). Check console for any thrown errors when tapping the pill. If you see a `NotAllowedError`, the catch is handling it (expected) — but verify it's silenced and doesn't surface in any user-visible way.
- [ ] **Pick a date**: scroll wheels to a date, tap "Done" → wheel picker dismisses → pill label updates to the picked date
- [ ] **Re-tap pill** (now showing a formatted date): wheel picker re-opens with the previously-picked date pre-selected
- [ ] **Tap a built-in pill** ("Today", "Tomorrow", etc.) after picking custom: built-in date is selected, custom-date pill returns to "+ Pick a date" label

## What "broken" looks like, so you know what to watch for

- **Picker doesn't open on desktop**: the fix didn't land. Re-check the diff and that the dev server rebuilt.
- **Picker opens then immediately closes on iOS**: the `showPicker()` call is interfering with iOS's native handler. Fix: add platform detection (e.g., skip `showPicker` when `/iPad|iPhone|iPod/.test(navigator.userAgent)`).
- **Picker double-flashes on iOS**: same root cause, slightly different symptom. Same fix.
- **NotAllowedError appears in iOS console**: harmless (it's caught) but worth noting in case behavior changes in a future iOS release.

## Commit plan

Once both buckets pass:

```
fix(when-step): call showPicker() on date-input click — restore desktop picker without re-breaking iOS
```

Single-file, single-hunk commit. Will be a fast-follow on top of the analytics work just pushed to `adit/sandbox-testing`.
