import { describe, expect, it } from "vitest";

// The custom date picker was restored 2026-06-12 after the visual-audit
// batch initially removed it. "Fix" meant theme, not delete — past
// the 7-day pill horizon users still need to plan.  The native
// <input type="date"> was replaced with a themed popover calendar
// (src/components/ui/DatePicker.tsx) so no browser-blue leaks into the
// design system.
//
// These tests pin three contracts at the source level:
//   1. WhenStep restores the custom-date affordance.
//   2. Selecting a custom date flows into the same `setDay` channel
//      the built-in pills use, so the Build-my-plan CTA enables on
//      a date pick the same way it does on a pill tap.
//   3. Past dates are unselectable — DatePicker is passed
//      `min={todayISO}` AND the DatePicker source applies an
//      explicit past-date disabled path.
//
// We use grep tripwires rather than a render harness because the
// project doesn't ship jsdom/happy-dom (see vitest.config.ts).

async function readSources() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, "..", "..", "src");
  return {
    whenStep: readFileSync(
      join(srcRoot, "components", "questionnaire", "WhenStep.tsx"),
      "utf-8",
    ),
    datePicker: readFileSync(
      join(srcRoot, "components", "ui", "DatePicker.tsx"),
      "utf-8",
    ),
  };
}

describe("Custom date picker — restored + themed", () => {
  it("WhenStep imports and renders the themed DatePicker", async () => {
    const { whenStep } = await readSources();
    expect(whenStep).toMatch(
      /import \{ DatePicker \} from "@\/components\/ui\/DatePicker"/,
    );
    expect(whenStep).toMatch(/<DatePicker\b/);
  });

  it("WhenStep restores the symbols the integration relies on", async () => {
    const { whenStep } = await readSources();
    // The custom-date pill needs these to derive its label + selected
    // state from the underlying day string.
    expect(whenStep).toMatch(/function formatCustomDate\(/);
    expect(whenStep).toMatch(/const builtInDates = useMemo/);
    expect(whenStep).toMatch(/const customSelected = !builtInDates\.has\(day\)/);
    expect(whenStep).toMatch(/const todayISO = days\[0\]\.date/);
  });

  it("Selecting a custom date flows into setDay (CTA-enabling channel)", async () => {
    const { whenStep } = await readSources();
    // DatePicker.onChange must wire to setDay so a custom pick is
    // indistinguishable from a pill tap downstream — the same `day`
    // state drives the Build-my-plan CTA.
    expect(whenStep).toMatch(/<DatePicker[\s\S]*?onChange=\{setDay\}/);
    // The trigger label honors the custom-vs-builtin split so the
    // pill reads "+ Pick a date" until a non-built-in date is chosen.
    expect(whenStep).toMatch(
      /triggerLabel=\{\s*customSelected \? formatCustomDate\(day\) : "\+ Pick a date"/,
    );
  });

  it("Past dates are unselectable — min is wired from todayISO", async () => {
    const { whenStep, datePicker } = await readSources();
    // Integration: WhenStep passes todayISO as the lower bound.
    expect(whenStep).toMatch(/<DatePicker[\s\S]*?min=\{todayISO\}/);
    // Contract: DatePicker enforces it. The cell-render branch must
    // mark cells before minDate as disabled, and the prev-month
    // navigation must refuse to cross below the min month.
    expect(datePicker).toMatch(/const isPast = minDate !== null && cellStart < minDate/);
    expect(datePicker).toMatch(/const isDisabled = isPast \|\| isFuture/);
    expect(datePicker).toMatch(/disabled=\{isDisabled\}/);
    expect(datePicker).toMatch(/canGoBack/);
  });

  it("DatePicker themes every visual state to design tokens (no blue)", async () => {
    const { datePicker } = await readSources();
    // Selected, today, hover, disabled — explicit token classes per
    // the audit's "zero blue in any state" acceptance criterion.
    expect(datePicker).toMatch(/bg-burgundy text-cream font-medium/);
    expect(datePicker).toMatch(/text-burgundy font-medium ring-1 ring-burgundy/);
    expect(datePicker).toMatch(/hover:bg-burgundy-tint/);
    expect(datePicker).toMatch(/text-muted pointer-events-none/);
    // No accidental native-blue leaks.
    expect(datePicker).not.toMatch(/\bbg-blue-/);
    expect(datePicker).not.toMatch(/\btext-blue-/);
    expect(datePicker).not.toMatch(/\bborder-blue-/);
    expect(datePicker).not.toMatch(/\baccent-blue-/);
  });

  it("DatePicker honors the a11y contract the audit batch enforced", async () => {
    const { datePicker } = await readSources();
    // Esc closes + returns focus to trigger.
    expect(datePicker).toMatch(/e\.key === "Escape"/);
    expect(datePicker).toMatch(/triggerRef\.current\?\.focus\(\)/);
    // Trigger announces popup semantics.
    expect(datePicker).toMatch(/aria-haspopup="dialog"/);
    expect(datePicker).toMatch(/aria-expanded=\{open\}/);
    // Nav buttons are labelled.
    expect(datePicker).toMatch(/aria-label="Previous month"/);
    expect(datePicker).toMatch(/aria-label="Next month"/);
    // Day cells expose their full date + today/selected semantics.
    expect(datePicker).toMatch(/aria-current=\{isToday \? "date" : undefined\}/);
    expect(datePicker).toMatch(/aria-pressed=\{isSelected \|\| undefined\}/);
    // Tap target is at least 40px (h-10 = 2.5rem = 40px); matches
    // the audit's "comfortable tap size" line and nav arrows clear
    // the 44px bar (h-11 = 2.75rem).
    expect(datePicker).toMatch(/\bh-10 w-10\b/);
    expect(datePicker).toMatch(/\bh-11 w-11\b/);
  });

  it("DatePicker popover fits a 375px viewport", async () => {
    const { datePicker } = await readSources();
    // 18rem = 288px nominal width; the max-w guard clamps the
    // popover to viewport - 1.5rem so it can't overflow on small
    // screens even if the trigger sits near the edge.
    expect(datePicker).toMatch(/\bw-\[18rem\]/);
    expect(datePicker).toMatch(/max-w-\[calc\(100vw-1\.5rem\)\]/);
  });
});
