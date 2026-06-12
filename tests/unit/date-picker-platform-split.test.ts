import { describe, expect, it } from "vitest";

// Date picker platform split — 2026-06-12. Coarse pointer (mobile,
// iPad) gets the OS native picker; fine pointer (desktop, including
// touch laptops with a primary fine pointer) keeps the themed custom
// calendar built earlier in the day. A prior attempt at this split
// broke desktop entirely — these contracts are the regression
// tripwire.
//
// Hard rules pinned here at the source level (no jsdom in this
// project, see vitest.config.ts):
//
//   1. NO user-agent sniffing anywhere. Pointer modality is the only
//      branch.
//   2. NO showPicker() calls in either path. The mobile path opens
//      via the platform's tap-to-focus on a real input.
//   3. The native input lives inside the coarse branch ONLY. The
//      ternary uses `=== true` so the SSR / no-matchMedia null
//      default falls to the custom calendar, never the native input.
//   4. Native input has min={todayISO} so the OS UI blocks past
//      dates the same way the custom calendar's `isPast` check does.
//   5. Native input onChange flows through handleDatePicked, which
//      calls setDay — same channel as a day-pill tap, so the
//      Build-my-plan CTA enables identically.

async function readSource() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(
      here,
      "..",
      "..",
      "src",
      "components",
      "questionnaire",
      "WhenStep.tsx",
    ),
    "utf-8",
  );
}

describe("WhenStep — date picker platform split", () => {
  it("uses matchMedia('(pointer: coarse)') — no userAgent sniffing", async () => {
    const src = await readSource();
    expect(src).toMatch(/matchMedia\("\(pointer: coarse\)"\)/);
    // Belt-and-suspenders: a future contributor MUST NOT reach for
    // navigator.userAgent / navigator.platform to make this branch.
    expect(src).not.toMatch(/navigator\.userAgent/);
    expect(src).not.toMatch(/navigator\.platform/);
    expect(src).not.toMatch(/navigator\.vendor/);
    // No "isMobile" / "isIOS" / "isAndroid" boolean tropes that hint
    // at UA sniffing creeping back in.
    expect(src).not.toMatch(/\bisMobile\b/);
    expect(src).not.toMatch(/\bisIOS\b/);
    expect(src).not.toMatch(/\bisAndroid\b/);
  });

  it("uses useSyncExternalStore for hydration-safe pointer detection (no SSR/client mismatch)", async () => {
    const src = await readSource();
    // useSyncExternalStore is the canonical React 18+ pattern: the
    // server snapshot can return null while the client returns the
    // real value, and React handles the post-hydration re-render
    // without a mismatch warning.
    expect(src).toMatch(/useSyncExternalStore/);
    // Server snapshot must return null so the first render is
    // deterministic across server + client.
    expect(src).toMatch(
      /function getCoarsePointerServerSnapshot\(\)[\s\S]*?return null/,
    );
    // Subscribe + getSnapshot wired to matchMedia change events.
    expect(src).toMatch(
      /mql\.addEventListener\("change", callback\)[\s\S]*?return \(\) => mql\.removeEventListener\("change", callback\)/,
    );
  });

  it("branches with `=== true`, never `&&` — null defaults to the custom calendar", async () => {
    const src = await readSource();
    // The ternary must be `isCoarse === true ? ... : ...`. Using a
    // truthy check (`isCoarse ?`) would treat null as falsey and
    // still pick the calendar — same outcome, but `=== true` is
    // explicit about the contract that null defaults to calendar.
    // The actual concrete regression risk is `isCoarse !== false`
    // which would pick the native input on null. Pin the strict
    // equality so a future refactor can't sneak that in.
    expect(src).toMatch(/isCoarse === true \?/);
    expect(src).not.toMatch(/isCoarse !== false/);
    expect(src).not.toMatch(/isCoarse \? \(/); // not a truthy-check
  });

  it("never calls showPicker() in either path", async () => {
    const src = await readSource();
    expect(src).not.toMatch(/showPicker/);
  });

  it("coarse branch renders <input type='date'> with min=todayISO and aria-label", async () => {
    const src = await readSource();
    // The native input lives inside the `isCoarse === true` branch.
    // We use a window match instead of the full ternary so a future
    // reflow doesn't trip this.
    expect(src).toMatch(/isCoarse === true \?[\s\S]*?<input[\s\S]*?type="date"/);
    expect(src).toMatch(
      /<input[\s\S]*?type="date"[\s\S]*?min=\{todayISO\}/,
    );
    expect(src).toMatch(
      /<input[\s\S]*?type="date"[\s\S]*?aria-label="Pick a date"/,
    );
  });

  it("native input change propagates via handleDatePicked → setDay (CTA-enabling channel)", async () => {
    const src = await readSource();
    expect(src).toMatch(
      /const handleDatePicked = \(e: React\.ChangeEvent<HTMLInputElement>\) => \{[\s\S]*?setDay\(value\)/,
    );
    expect(src).toMatch(
      /<input[\s\S]*?onChange=\{handleDatePicked\}/,
    );
    // The input is controlled — its value tracks the same `day`
    // state the pill row uses. customSelected gates between the
    // user's chosen date (when off-pill) and "" (when a pill is
    // selected) so the native picker doesn't preselect a past day
    // pill.
    expect(src).toMatch(/value=\{customSelected \? day : ""\}/);
  });

  it("native input is layout-present (opacity-0 absolute), NOT display:none / visibility:hidden", async () => {
    const src = await readSource();
    // Token-by-token assertions so a future Tailwind class re-order
    // (prettier plugin, etc.) doesn't trip the test. The contract is
    // these classes EXIST on the input — order is incidental.
    const inputBlock = src.match(/<input[\s\S]*?\/>/)?.[0] ?? "";
    expect(inputBlock).toMatch(/\babsolute\b/);
    expect(inputBlock).toMatch(/\binset-0\b/);
    expect(inputBlock).toMatch(/\bw-full\b/);
    expect(inputBlock).toMatch(/\bh-full\b/);
    expect(inputBlock).toMatch(/\bopacity-0\b/);
    // display:none on a date input prevents OS picker from opening
    // on iOS — must never be reintroduced.
    expect(src).not.toMatch(/<input[\s\S]*?type="date"[\s\S]*?hidden/);
    expect(src).not.toMatch(
      /<input[\s\S]*?type="date"[\s\S]*?className="[^"]*display-none/,
    );
    expect(src).not.toMatch(
      /<input[\s\S]*?type="date"[\s\S]*?className="[^"]*\binvisible\b/,
    );
  });

  it("native input zeroes UA defaults (m-0 p-0 border-0) so the date input can't inflate the chip", async () => {
    // Android Chrome's <input type="date"> ships with intrinsic
    // padding, a border, and (sometimes) margin. Even with
    // position:absolute, those UA defaults can paint the visible
    // box outside the parent. Explicit resets pin the input's box
    // to exactly the parent's dimensions.
    const src = await readSource();
    const inputBlock = src.match(/<input[\s\S]*?\/>/)?.[0] ?? "";
    expect(inputBlock).toMatch(/\bm-0\b/);
    expect(inputBlock).toMatch(/\bp-0\b/);
    expect(inputBlock).toMatch(/\bborder-0\b/);
  });

  it("native input uses text-base (16px) — iOS Safari focus-zoom guard", async () => {
    // Safari iOS zooms the viewport when an input with computed
    // font-size < 16px takes focus. The input is invisible, but a
    // focused-but-zoomed viewport is still a layout regression.
    // text-base is Tailwind's 16px primitive.
    const src = await readSource();
    const inputBlock = src.match(/<input[\s\S]*?\/>/)?.[0] ?? "";
    expect(inputBlock).toMatch(/\btext-base\b/);
  });

  it("visible chip span gets inline-block so its box matches sibling <button> day chips", async () => {
    const src = await readSource();
    // Sibling chips are <motion.button> with pillClass — a button is
    // intrinsically inline-block, so its padding contributes to the
    // block-level height. A bare <span> with pillClass is inline by
    // default, so its py-* doesn't lift its block height — the chip
    // renders SHORTER than the row. Adding inline-block here matches
    // the sibling box-model exactly. Same height, same baseline.
    expect(src).toMatch(
      /<span\s+className=\{`\$\{pillClass\(customSelected\)\} inline-block`\}\s+aria-hidden/,
    );
  });

  it("visible chip span uses the SAME pillClass call as sibling day chips (same box recipe)", async () => {
    const src = await readSource();
    // Sibling day chips render `pillClass(isSelected)`; the custom-
    // date chip renders `pillClass(customSelected)`. Both go through
    // the same builder so a future rename of pillClass props
    // doesn't divide the visual language.
    expect(src).toMatch(
      /<motion\.button[\s\S]*?className=\{pillClass\(isSelected\)\}/,
    );
    expect(src).toMatch(
      /<span\s+className=\{`\$\{pillClass\(customSelected\)\}/,
    );
  });

  it("the native input is wrapped in a <label htmlFor=...> so tap-to-focus is the platform default", async () => {
    const src = await readSource();
    // The label association IS the open-picker mechanism — tapping
    // the chip falls through to the input's tap-to-focus, which
    // iOS / Android resolve as "open the date sheet". No JS opens
    // the sheet.
    expect(src).toMatch(
      /<label[\s\S]*?htmlFor="custom-date-input"[\s\S]*?<input[\s\S]*?id="custom-date-input"/,
    );
  });

  it("fine branch (else) renders the custom DatePicker, NOT the native input", async () => {
    const src = await readSource();
    // The DatePicker call must live in the false branch of the
    // ternary — after `: (` — so it's the path the null default
    // reaches.
    expect(src).toMatch(
      /isCoarse === true \?[\s\S]*?\) : \([\s\S]*?<DatePicker\b/,
    );
  });

  it("exactly ONE <input type='date'> in the file — never both paths mounted simultaneously", async () => {
    const src = await readSource();
    const hits = src.match(/type="date"/g) ?? [];
    expect(hits.length).toBe(1);
  });

  it("DatePicker still receives the same min + onChange contract the desktop tests assert", async () => {
    const src = await readSource();
    // Existing date-picker-restore.test.ts asserts these — pin them
    // here too so a stray refactor inside the platform split doesn't
    // silently break desktop. onChange={setDay} is the cardinal
    // contract: a custom pick must flow into the same state channel
    // as a pill tap.
    expect(src).toMatch(
      /<DatePicker[\s\S]*?value=\{customSelected \? day : null\}[\s\S]*?onChange=\{setDay\}[\s\S]*?min=\{todayISO\}/,
    );
  });

  it("subscribe cleans up its matchMedia listener on unmount", async () => {
    const src = await readSource();
    // useSyncExternalStore relies on the subscribe function to
    // return a teardown. Without it, navigating between
    // questionnaire steps would leak listeners.
    expect(src).toMatch(
      /return \(\) => mql\.removeEventListener\("change", callback\)/,
    );
  });
});
