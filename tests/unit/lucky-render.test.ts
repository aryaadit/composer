import { describe, expect, it } from "vitest";
import { isLuckyItinerary } from "@/lib/itinerary/is-lucky";

// Lucky-itinerary inverted crown — 2026-06-12 Option B. Amends the
// initial banner+wavy+title-die layer that shipped earlier the same
// day. The crown is now a deep-burgundy field wrapping the page
// header + composition header + dice banner. Below the seam the
// itinerary renders byte-identical to a standard non-lucky itinerary.
//
// Daily picks remain NOT lucky — they render as a standard itinerary
// despite having a dedicated entry mode.

describe("isLuckyItinerary — predicate contract (unchanged across Option B)", () => {
  it("returns true only for mode === 'lucky'", () => {
    expect(
      isLuckyItinerary({
        occasion: "date",
        neighborhoods: [],
        budget: "nice_out",
        vibe: "drinks_led",
        day: "2026-06-15",
        startTime: "19:00",
        endTime: "00:00",
        mode: "lucky",
      }),
    ).toBe(true);
  });

  it("returns false for questionnaire / daily / no-mode / undefined / null", () => {
    const base = {
      occasion: "date" as const,
      neighborhoods: [] as string[],
      budget: "nice_out" as const,
      vibe: "drinks_led" as const,
      day: "2026-06-15",
      startTime: "19:00",
      endTime: "00:00",
    };
    expect(isLuckyItinerary({ ...base, mode: "questionnaire" })).toBe(false);
    expect(isLuckyItinerary({ ...base, mode: "daily" })).toBe(false);
    expect(isLuckyItinerary(base)).toBe(false);
    expect(isLuckyItinerary(undefined)).toBe(false);
    expect(isLuckyItinerary(null)).toBe(false);
  });
});

describe("Crown tokens — declared in globals.css with crown-* scope", () => {
  let cssSrc: string;

  async function readCss() {
    if (cssSrc) return;
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    cssSrc = readFileSync(
      join(here, "..", "..", "src", "app", "globals.css"),
      "utf-8",
    );
  }

  it("declares the six crown color tokens", async () => {
    await readCss();
    expect(cssSrc).toMatch(/--color-crown-field:\s*#4A1520/);
    expect(cssSrc).toMatch(/--color-crown-chip:\s*#5E1B29/);
    expect(cssSrc).toMatch(/--color-crown-chip-border:\s*#C98A96/);
    expect(cssSrc).toMatch(/--color-crown-text:\s*#FFF7F2/);
    expect(cssSrc).toMatch(/--color-crown-text-muted:\s*#D9B8B0/);
    expect(cssSrc).toMatch(/--color-crown-ring:\s*#F2D9D2/);
  });

  it("documents the contrast budget alongside the tokens", async () => {
    await readCss();
    // The contrast budget comment pins that the secondary shade was
    // tuned for body-size text on the field (4.5:1).
    expect(cssSrc).toMatch(/4\.5:1/);
    expect(cssSrc).toMatch(/crown-text-muted/);
  });

  it("ships explicit .bg-crown-field / .text-crown-* class rules alongside the @theme block", async () => {
    await readCss();
    // Turbopack's dev cache sometimes doesn't pick up new @theme
    // tokens without a server restart. Explicit class rules
    // alongside the @theme block guarantee the styles apply either
    // way — production already has them via @theme generation, dev
    // gets them via these rules even on a stale cache.
    expect(cssSrc).toMatch(
      /\.bg-crown-field\s*\{\s*background-color:\s*var\(--color-crown-field\)/,
    );
    expect(cssSrc).toMatch(
      /\.bg-crown-chip\s*\{\s*background-color:\s*var\(--color-crown-chip\)/,
    );
    expect(cssSrc).toMatch(
      /\.border-crown-chip-border\s*\{\s*border-color:\s*var\(--color-crown-chip-border\)/,
    );
    expect(cssSrc).toMatch(
      /\.text-crown-text\s*\{\s*color:\s*var\(--color-crown-text\)/,
    );
    expect(cssSrc).toMatch(
      /\.text-crown-text-muted\s*\{\s*color:\s*var\(--color-crown-text-muted\)/,
    );
  });
});

describe("Lucky crown — render contracts (source level)", () => {
  let pageSrc: string;
  let savedSrc: string;
  let shareSrc: string;
  let crownSrc: string;
  let headerSrc: string;
  let composeHeaderSrc: string;
  let bannerSrc: string;
  let viewSrc: string;
  let walkSrc: string;

  async function readSources() {
    if (pageSrc) return;
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const srcRoot = join(here, "..", "..", "src");
    pageSrc = readFileSync(
      join(srcRoot, "app", "itinerary", "page.tsx"),
      "utf-8",
    );
    savedSrc = readFileSync(
      join(srcRoot, "app", "itinerary", "saved", "[id]", "page.tsx"),
      "utf-8",
    );
    shareSrc = readFileSync(
      join(srcRoot, "app", "itinerary", "share", "[id]", "page.tsx"),
      "utf-8",
    );
    crownSrc = readFileSync(
      join(srcRoot, "components", "itinerary", "LuckyCrown.tsx"),
      "utf-8",
    );
    headerSrc = readFileSync(
      join(srcRoot, "components", "Header.tsx"),
      "utf-8",
    );
    composeHeaderSrc = readFileSync(
      join(srcRoot, "components", "itinerary", "CompositionHeader.tsx"),
      "utf-8",
    );
    bannerSrc = readFileSync(
      join(srcRoot, "components", "itinerary", "LuckyBanner.tsx"),
      "utf-8",
    );
    viewSrc = readFileSync(
      join(srcRoot, "components", "itinerary", "ItineraryView.tsx"),
      "utf-8",
    );
    walkSrc = readFileSync(
      join(srcRoot, "components", "ui", "WalkConnector.tsx"),
      "utf-8",
    );
  }

  // ─── Crown renders for mode lucky only ──────────────────────────

  it("all three consumer pages render LuckyCrown ONLY when isLuckyItinerary(inputs) is true", async () => {
    await readSources();
    for (const src of [pageSrc, savedSrc, shareSrc]) {
      // The ternary is the gate. Standard + daily → the else branch
      // renders the original Header + CompositionHeader.
      expect(src).toMatch(
        /isLuckyItinerary\(itinerary\.inputs\) \? \([\s\S]*?<LuckyCrown\b/,
      );
      expect(src).toMatch(
        /import \{ LuckyCrown \} from "@\/components\/itinerary\/LuckyCrown"/,
      );
      // No standalone always-render of LuckyCrown — the gate must
      // wrap every mount.
      const luckyCrownHits = src.match(/<LuckyCrown\b/g) ?? [];
      expect(luckyCrownHits.length).toBe(1);
    }
  });

  it("LuckyCrown wraps content in the full-width crown-field band", async () => {
    await readSources();
    // Full viewport-width burgundy band; content uses the standard
    // column constraint via the inner Header / CompositionHeader.
    expect(crownSrc).toMatch(/w-full bg-crown-field/);
    expect(crownSrc).toMatch(/data-testid="lucky-crown"/);
  });

  it("LuckyCrown mounts Header + CompositionHeader + LuckyBanner with variant='crown'", async () => {
    await readSources();
    expect(crownSrc).toMatch(/<Header[\s\S]*?variant="crown"/);
    expect(crownSrc).toMatch(/<CompositionHeader[\s\S]*?variant="crown"/);
    expect(crownSrc).toMatch(/<LuckyBanner variant="crown"/);
  });

  // ─── Crown variant prop reaches each component ──────────────────

  it("Header accepts variant='crown' and applies the brightness-0 invert lockup + crown-ring", async () => {
    await readSources();
    // Lockup flips light on the dark field; the crown-ring focus
    // token replaces the burgundy/50 ring that would be invisible.
    expect(headerSrc).toMatch(/variant\?: "default" \| "crown"/);
    expect(headerSrc).toMatch(/brightness-0 invert/);
    expect(headerSrc).toMatch(/focus-visible:ring-crown-ring/);
    expect(headerSrc).toMatch(/focus-visible:ring-offset-crown-field/);
  });

  it("CompositionHeader accepts variant='crown' and switches text colors to crown tokens", async () => {
    await readSources();
    expect(composeHeaderSrc).toMatch(/variant\?: "default" \| "crown"/);
    // text-crown-text for the title; text-crown-text-muted for the
    // meta + atmosphere rows.
    expect(composeHeaderSrc).toMatch(/text-crown-text\b/);
    expect(composeHeaderSrc).toMatch(/text-crown-text-muted/);
    // Title die also flips to cream in crown mode (via variant pass).
    expect(composeHeaderSrc).toMatch(
      /<TitleDie variant=\{isCrown \? "crown" : "burgundy"\}/,
    );
  });

  it("LuckyBanner accepts variant='crown' and renders the chip-on-field treatment", async () => {
    await readSources();
    expect(bannerSrc).toMatch(/variant\?: "default" \| "crown"/);
    expect(bannerSrc).toMatch(/bg-crown-chip/);
    expect(bannerSrc).toMatch(/border-crown-chip-border/);
    expect(bannerSrc).toMatch(/text-crown-text/);
    // Same copy as the original layer.
    expect(bannerSrc).toMatch(/The dice did this\./);
    // No em / en dashes.
    const copyLine = bannerSrc.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
    expect(copyLine).not.toMatch(/[—–]/);
  });

  // ─── Light focus ring on crown interactive elements ─────────────

  it("the Back link inside LuckyCrown carries the crown-ring focus token", async () => {
    await readSources();
    // The standard burgundy/40 ring is invisible on the burgundy
    // field — the Back link must use the lighter crown-ring token.
    expect(crownSrc).toMatch(
      /<Link[\s\S]*?focus-visible:ring-crown-ring[\s\S]*?focus-visible:ring-offset-crown-field/,
    );
    expect(crownSrc).toMatch(/text-crown-text/);
  });

  // ─── Below the seam: wavy connectors only; banner not in view ────

  it("ItineraryView takes isLucky ONLY to drive WalkConnector variant (banner stays above the seam)", async () => {
    await readSources();
    // isLucky prop is back, but only for the connector variant. The
    // banner stays owned by LuckyCrown above the seam — never
    // imported or rendered in ItineraryView.
    expect(viewSrc).toMatch(/isLucky\?: boolean/);
    expect(viewSrc).toMatch(
      /<WalkConnector[\s\S]*?variant=\{isLucky \? "wavy" : "default"\}/,
    );
    expect(viewSrc).not.toMatch(/import \{ LuckyBanner \}/);
    expect(viewSrc).not.toMatch(/<LuckyBanner\b/);
  });

  it("WalkConnector has the wavy variant + WavyRule, gated by variant prop", async () => {
    await readSources();
    expect(walkSrc).toMatch(/variant\?: "default" \| "wavy"/);
    expect(walkSrc).toMatch(/if \(variant === "wavy"\)/);
    expect(walkSrc).toMatch(/<WavyRule \/>[\s\S]*?<WavyRule \/>/);
    expect(walkSrc).toMatch(/function WavyRule\(\)/);
    // Wavy rule uses burgundy at /30 alpha, hand-drawn Q+T Bezier
    // curves, aria-hidden — exactly as the original layer shipped it.
    expect(walkSrc).toMatch(/text-burgundy\/30/);
    expect(walkSrc).toMatch(/\bQ\b[\s\S]*?\bT\b/);
    expect(walkSrc).toMatch(/<svg[\s\S]*?aria-hidden/);
  });

  it("all three consumer pages pass isLucky into ItineraryView via the canonical helper", async () => {
    await readSources();
    for (const src of [pageSrc, savedSrc, shareSrc]) {
      expect(src).toMatch(
        /<ItineraryView[\s\S]*?isLucky=\{isLuckyItinerary\(itinerary\.inputs\)\}/,
      );
      // No inline mode checks — keep the gate central.
      expect(src).not.toMatch(/inputs\?\.mode === "lucky"/);
      expect(src).not.toMatch(/inputs\.mode === "lucky"/);
    }
  });

  // ─── Standard + daily render zero crown styles ──────────────────

  it("standard / daily render paths in each consumer page do NOT mount LuckyCrown", async () => {
    await readSources();
    // The else branch of the ternary renders the original Header +
    // CompositionHeader, not the crown. Pin that structurally.
    for (const src of [pageSrc, savedSrc, shareSrc]) {
      expect(src).toMatch(
        /\) : \([\s\S]*?<Header\b[\s\S]*?<CompositionHeader\b/,
      );
    }
  });

  it("non-crown component instances do NOT carry crown classes", async () => {
    await readSources();
    // CompositionHeader's default branch must NOT smuggle in crown
    // text classes — they only apply when variant === "crown" via
    // the titleColor / subtitleColor / metaColor switches.
    expect(composeHeaderSrc).toMatch(
      /const titleColor = isCrown \? "text-crown-text" : "text-charcoal"/,
    );
    expect(composeHeaderSrc).toMatch(
      /const subtitleColor = isCrown \? "text-crown-text-muted" : "text-warm-gray"/,
    );
    expect(composeHeaderSrc).toMatch(
      /const metaColor = isCrown \? "text-crown-text-muted" : "text-muted"/,
    );
    // Header's default branch must keep the burgundy/50 ring intact.
    expect(headerSrc).toMatch(/focus-visible:ring-burgundy\/50/);
  });

  // ─── Title die stays — but is now inside the crown ──────────────

  it("CompositionHeader still renders the title die on lucky itineraries", async () => {
    await readSources();
    expect(composeHeaderSrc).toMatch(
      /import \{ isLuckyItinerary \} from "@\/lib\/itinerary\/is-lucky"/,
    );
    expect(composeHeaderSrc).toMatch(/const isLucky = isLuckyItinerary\(inputs\)/);
    expect(composeHeaderSrc).toMatch(/\{isLucky && \(/);
    expect(composeHeaderSrc).toMatch(/<TitleDie\b/);
  });

  it("title die is aria-hidden — the banner carries the announcement", async () => {
    await readSources();
    const titleDieBlock =
      composeHeaderSrc.match(/function TitleDie\([\s\S]*?^\}/m)?.[0] ?? "";
    expect(titleDieBlock).toMatch(/aria-hidden="true"/);
  });

  // ─── Banner placement contract (UPDATED for crown) ──────────────

  it("banner is rendered by LuckyCrown, NOT by ItineraryView (placement amended for Option B)", async () => {
    await readSources();
    // The banner left ItineraryView and now lives inside the crown
    // band, where it sits beneath the composition header on the
    // burgundy field.
    expect(crownSrc).toMatch(/<LuckyBanner variant="crown"/);
    expect(viewSrc).not.toMatch(/<LuckyBanner\b/);
  });

  // ─── Scope safety: crown unreachable from home / questionnaire ──

  it("crown components are not imported from non-itinerary surfaces", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const srcRoot = join(here, "..", "..", "src");
    // Sample the three surfaces the user explicitly named as
    // "unreachable": home, questionnaire shell, and the standard
    // (compose) entry.
    const homeSrc = readFileSync(
      join(srcRoot, "components", "home", "HomeScreen.tsx"),
      "utf-8",
    );
    const questionnaireSrc = readFileSync(
      join(srcRoot, "components", "questionnaire", "QuestionnaireShell.tsx"),
      "utf-8",
    );
    const composePageSrc = readFileSync(
      join(srcRoot, "app", "compose", "page.tsx"),
      "utf-8",
    );
    for (const src of [homeSrc, questionnaireSrc, composePageSrc]) {
      expect(src).not.toMatch(/LuckyCrown/);
      expect(src).not.toMatch(/bg-crown-field/);
      expect(src).not.toMatch(/text-crown-text/);
    }
  });
});
