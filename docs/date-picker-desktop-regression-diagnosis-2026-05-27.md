# Date picker desktop regression — diagnosis — 2026-05-27

Diagnosis of a regression in [src/components/questionnaire/WhenStep.tsx](../src/components/questionnaire/WhenStep.tsx): the iOS date picker fix (commit `dd75cf0`, "make date input the tappable element so iOS Safari opens the native picker") broke desktop browsers. Clicking the "+ Pick a date" pill on desktop no longer opens the native date picker.

## Current implementation

[src/components/questionnaire/WhenStep.tsx:101-127](../src/components/questionnaire/WhenStep.tsx#L101):

```tsx
{/* Custom date pill — the <input type="date"> is layered on top
    of the visual pill at opacity 0 so a direct tap lands on the
    input itself. iOS Safari opens the native picker only on a
    trusted gesture on a real date input; proxying via a button
    and showPicker()/click() does not work there. */}
<motion.label
  key="custom-date"
  htmlFor="custom-date-input"
  className="relative inline-block cursor-pointer"
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, delay: days.length * 0.03 }}
  whileTap={{ scale: 0.97 }}
>
  <span className={pillClass(customSelected)} aria-hidden>
    {customSelected ? formatCustomDate(day) : "+ Pick a date"}
  </span>
  <input
    id="custom-date-input"
    type="date"
    min={todayISO}
    value={customSelected ? day : ""}
    onChange={handleDatePicked}
    aria-label="Pick a date"
    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none bg-transparent"
  />
</motion.label>
```

Notable: `motion.label` is `position: relative`, the span is normal-flow, the input is `position: absolute inset-0 w-full h-full opacity-0 appearance-none`. No `pointer-events: none` on either child, no explicit z-index. `htmlFor` ↔ `id` association is wired.

## Diagnosis

**Root cause: `appearance: none` strips the desktop calendar icon, which IS the picker-opening affordance on desktop browsers.**

The two platforms have fundamentally different interaction models for `<input type="date">`:

| Platform | What opens the picker |
|---|---|
| iOS Safari | **Any tap** on the input element (no separate affordance — the whole input is the trigger). This is why the transparent overlay works on iOS. |
| Desktop Chrome / Edge / Firefox | A click on the **calendar icon** (the small ▼ or 📅 affordance at the right edge of the rendered input). A click anywhere ELSE in the input only focuses it. |
| Desktop Safari | A click on the input typically opens the picker (more iOS-like), but `appearance: none` may suppress that too. |

When we added `appearance-none` to the transparent input:
- On iOS: no effect — iOS doesn't have a calendar icon to strip in the first place. ✓
- On desktop: the calendar icon is gone. With no affordance to click, the click just focuses the (invisible) input. No picker. ✗

**Even removing `appearance-none` wouldn't fully fix desktop**, because the user clicks the visual pill (the whole bounding box) — they have no idea where the calendar icon "would be." The probability of the click hitting the right-edge icon region by accident is low.

This is hypothesis (a) from the report: the transparent input intercepts clicks correctly; desktop just expects a different interaction model than iOS provides natively.

## What desktop expects: `showPicker()`

`HTMLInputElement.showPicker()` is the documented modern API for opening pickers programmatically. Support:

- Chrome 99+, Edge 99+, Firefox 101+, Safari 16+, iOS Safari 16.4+
- Requires user activation (a click handler is one)
- Throws `NotAllowedError` if called without user activation, or on some browsers when the picker is already open

### Will calling `showPicker()` onClick re-break iOS?

No, with one guardrail. Trace through every platform:

| Platform | Sequence |
|---|---|
| Modern desktop | click → onClick fires → `showPicker()` → picker opens ✓ |
| iOS Safari 16.4+ | tap → native handler opens picker → onClick fires → `showPicker()` called on an already-open picker → may throw → caught by try/catch → ✓ |
| iOS Safari <16.4 | tap → native handler opens picker → onClick fires → `showPicker` is undefined → optional chain no-ops → ✓ |
| Older desktop (Chrome <99, Firefox <101) | click → onClick fires → `showPicker` undefined → no-op → ✗ (user sees nothing) |

The only regression surface is browsers older than ~4 years. Acceptable.

## Proposed fix

Single change to [WhenStep.tsx:118-126](../src/components/questionnaire/WhenStep.tsx#L118): add an `onClick` to the transparent input that calls `showPicker()` defensively.

```tsx
<input
  id="custom-date-input"
  type="date"
  min={todayISO}
  value={customSelected ? day : ""}
  onChange={handleDatePicked}
  onClick={(e) => {
    // Desktop browsers don't auto-open the picker on a click that lands
    // on the input's bounding box (only on the calendar icon, which
    // appearance:none strips). showPicker() bridges that — requires user
    // activation, which onClick provides. iOS Safari opens the picker
    // natively before this fires; the call may then throw or no-op,
    // either way harmless.
    try {
      e.currentTarget.showPicker?.();
    } catch {
      // iOS may throw NotAllowedError when picker is already open. Ignore.
    }
  }}
  aria-label="Pick a date"
  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none bg-transparent"
/>
```

Net change: +9 lines (8 actual + 1 close brace). No JSX restructuring, no other element changes.

## Alternatives considered and rejected

1. **Drop `appearance-none`.** Restores the calendar icon visually, but it's still hidden by `opacity: 0`. Users still wouldn't know to click the right edge. Half a fix.

2. **Move `showPicker` to a button overlay (revert iOS fix).** Re-breaks iOS — the original bug.

3. **Use `onFocus` instead of `onClick`.** Some browsers fire focus on keyboard tab without intent to open the picker. Could fire spuriously on tab-through. `onClick` is the safer trigger.

4. **Set `colorScheme` on the input and skip the overlay entirely.** Doesn't address either bug.

## Edge cases worth flagging

- **Keyboard activation** (tab to the pill, press Enter): on most browsers, Enter on a focused input dispatches a synthetic click, so `onClick` fires and `showPicker()` runs. ✓ Same path as mouse click.
- **`min={todayISO}` enforcement**: unchanged. Browsers will reject earlier dates in the picker UI. The picker still opens.
- **The label's `htmlFor` association** stays useful — clicks on the visual span propagate to the input, which then fires onClick, which calls showPicker. Without `htmlFor`, clicks on the span wouldn't reach the input on platforms where the absolute overlay doesn't fully cover the span (it does in this layout, but defense-in-depth).

## Manual QA list (when approved)

- Desktop Chrome: click pill → native date picker opens
- Desktop Safari: click pill → native date picker opens
- Desktop Firefox: click pill → native date picker opens
- iOS Safari (>= 16.4): tap pill → native wheel picker opens, no double-trigger
- iOS Safari (< 16.4): tap pill → native picker opens (showPicker undefined, no-op)
- Keyboard: Tab to pill, press Enter → picker opens
- After picking a date: pill label updates to formatted date (existing behavior, untouched)

## Status

Awaiting greenlight to apply the fix.
