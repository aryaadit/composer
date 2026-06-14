import { describe, expect, it } from "vitest";
import { isComposeFailure, composeFailure } from "@/lib/itinerary/compose-failure";
import { STORAGE_KEYS } from "@/config/storage";

// When /api/generate returns 422 (or any non-OK) on the questionnaire
// submit, the user must not see a stale itinerary from a prior compose
// painting on /itinerary. The honest path is: the questionnaire writes
// the typed ComposeFailure body (or composeFailure("system") for
// non-422) to a dedicated sessionStorage key, CLEARS the current
// itinerary, then navigates. The itinerary page reads + consumes that
// key on mount before any other hydration branch and renders the
// failure title + suggestion with a primary "Change your picks" CTA.
//
// No jsdom in this project (see vitest.config.ts). Pin the contract at
// the source level so a future refactor of either side can't silently
// reintroduce the stale-render bug.

async function readSources() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..", "..");
  const srcRoot = join(repoRoot, "src");
  return {
    shell: readFileSync(
      join(srcRoot, "components", "questionnaire", "QuestionnaireShell.tsx"),
      "utf-8",
    ),
    page: readFileSync(
      join(srcRoot, "app", "itinerary", "page.tsx"),
      "utf-8",
    ),
    storage: readFileSync(
      join(srcRoot, "config", "storage.ts"),
      "utf-8",
    ),
  };
}

describe("composer_compose_failure storage key", () => {
  it("is declared on STORAGE_KEYS.session as composer_compose_failure", () => {
    // Single source of truth — the questionnaire writer and the
    // itinerary reader both go through this constant. A literal
    // string mismatch on either side would silently re-introduce
    // the stale-itinerary bug.
    expect(STORAGE_KEYS.session.composeFailure).toBe(
      "composer_compose_failure",
    );
  });

  it("storage.ts documents why the key exists (failure handoff, not user state)", async () => {
    const { storage } = await readSources();
    // The CLAUDE.md guidance is "no localStorage for user state;
    // sessionStorage is page-to-page in-tab bridge only." This
    // comment block is what lets a future reader confirm the key
    // belongs in the session bridge and not in Supabase.
    expect(storage).toMatch(
      /composeFailure: "composer_compose_failure"/,
    );
    expect(storage).toMatch(
      /Page-to-page handoff for a failed \/api\/generate from the\s*\*\s*compose submit/,
    );
  });
});

describe("QuestionnaireShell — submit failure path", () => {
  it("imports the ComposeFailure primitives, not a hand-rolled shape", async () => {
    const { shell } = await readSources();
    // composeFailure / isComposeFailure / ComposeFailure are the
    // canonical primitives. Any drift to inline failure objects is
    // a sign someone reinvented the registry copy locally.
    expect(shell).toMatch(/from "@\/lib\/itinerary\/compose-failure"/);
    expect(shell).toMatch(/composeFailure,\s*\n\s*isComposeFailure,/);
    expect(shell).toMatch(/type ComposeFailure/);
  });

  it("non-OK response writes the failure key AND clears the current itinerary", async () => {
    const { shell } = await readSources();
    // The two writes must travel together. If a future edit drops
    // the removeItem, /itinerary will read the stale plan from the
    // previous compose and paint it as fresh — the original bug.
    expect(shell).toMatch(
      /sessionStorage\.setItem\(\s*STORAGE_KEYS\.session\.composeFailure,\s*JSON\.stringify\(failure\),?\s*\)/,
    );
    expect(shell).toMatch(
      /sessionStorage\.removeItem\(STORAGE_KEYS\.session\.currentItinerary\)/,
    );
  });

  it("422 path parses the typed ComposeFailure body via isComposeFailure", async () => {
    const { shell } = await readSources();
    // The 422 body carries title + suggestion already filled from
    // the per-stage registry. Bypassing isComposeFailure would lose
    // the zeroingStage discriminator on a malformed payload.
    expect(shell).toMatch(/if \(res\.status === 422\)/);
    expect(shell).toMatch(
      /const body = await res\.json\(\)\.catch\(\(\) => null\);[\s\S]*?if \(isComposeFailure\(body\)\)/,
    );
  });

  it("non-422 non-OK and catch branches both fall back to composeFailure(\"system\")", async () => {
    const { shell } = await readSources();
    // The system stage is the registry's neutral "Something went
    // wrong / Give it a moment" copy. Two sites land on it: any
    // status that isn't 422-with-a-typed-body, and a network throw.
    // Both must route through the same routeFailure helper to keep
    // the side effects (clear currentItinerary, write failure key,
    // navigate) in lockstep.
    const systemHits = shell.match(/composeFailure\("system"\)/g) ?? [];
    expect(systemHits.length).toBeGreaterThanOrEqual(2);
    expect(shell).toMatch(
      /} catch \{[\s\S]*?routeFailure\(composeFailure\("system"\)\);[\s\S]*?\}/,
    );
  });

  it("the success path's stale-itinerary write happens only INSIDE the success branch", async () => {
    const { shell } = await readSources();
    // composer_itinerary must only be set when we have a real
    // response from /api/generate. Any rewrite that moves the
    // setItem above the !res.ok check would re-introduce the leak.
    expect(shell).toMatch(
      /const data = await res\.json\(\);[\s\S]*?sessionStorage\.setItem\(\s*STORAGE_KEYS\.session\.currentItinerary,/,
    );
  });
});

describe("/itinerary — failure hydration", () => {
  it("reads composer_compose_failure FIRST in the load() useEffect", async () => {
    const { page } = await readSources();
    // The ordering is load-bearing: this branch must beat both the
    // URL-params decode AND the sessionStorage currentItinerary
    // rehydrate. A 422 in the questionnaire combined with a stale
    // currentItinerary will otherwise render the stale plan.
    expect(page).toMatch(
      /const pendingFailure = sessionStorage\.getItem\(\s*STORAGE_KEYS\.session\.composeFailure,?\s*\);[\s\S]*?decodeParamsToInputs\(searchParams\)/,
    );
  });

  it("consumes (removeItem) the failure key after reading so back-button revisits don't re-fire", async () => {
    const { page } = await readSources();
    // The failure surface is meant to be a one-shot. Without
    // removeItem, history.back() to /itinerary after dismissing
    // would re-paint the same failure indefinitely.
    expect(page).toMatch(
      /sessionStorage\.removeItem\(STORAGE_KEYS\.session\.composeFailure\)/,
    );
  });

  it("validates the parsed payload via isComposeFailure before rendering", async () => {
    const { page } = await readSources();
    // A malformed value in the storage slot (truncation, downgrade,
    // hand edit) must NOT crash the page. The predicate narrows the
    // type and lets the catch fall through to the normal hydration.
    expect(page).toMatch(
      /JSON\.parse\(pendingFailure\)[\s\S]*?if \(isComposeFailure\(parsed\)\)/,
    );
  });

  it("renders the failure title + suggestion + primary back-to-/compose CTA", async () => {
    const { page } = await readSources();
    // The failure surface reads the title + suggestion from the
    // registry-driven ComposeFailure object directly — no inline
    // copy duplication. The single CTA routes to /compose so the
    // user can change their picks without retyping everything.
    expect(page).toMatch(
      /if \(composeFailureState\) \{[\s\S]*?\{composeFailureState\.title\}[\s\S]*?\{composeFailureState\.suggestion\}[\s\S]*?Button href="\/compose"/,
    );
  });

  it("the failure copy stays in sentence case via the registry (no inline hand-rolled strings)", () => {
    // Every stage's title starts with a capital, ends with no
    // terminal punctuation; every suggestion is one sentence
    // ending with a period. Pin a representative pair from the
    // registry so a copy edit that breaks the convention gets
    // caught here, not at QA. No em dashes, no exclamation marks.
    const f = composeFailure("neighborhood");
    expect(isComposeFailure(f)).toBe(true);
    expect(f.title).not.toMatch(/[.!?]$/);
    expect(f.title).not.toMatch(/[—–]/);
    expect(f.suggestion).toMatch(/\.$/);
    expect(f.suggestion).not.toMatch(/[—–!]/);
  });
});
