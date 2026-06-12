import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";
import { EVENTS } from "@/lib/analytics/events";

// PII contract (founder spec, 2026-06-11 audit):
//   1. No EventSchemas entry may carry a key named "email", "phone",
//      or "name". These are free-text or PII-class fields that should
//      never reach PostHog under any event payload.
//   2. No PostHog person-property setter (setPersonProperties / Once,
//      $set / $set_once direct calls) may pass an email / phone / name
//      key — captured via grep across src/.
//   3. Free-text fields like reason_text travel via the
//      mirrorOnlyProps mechanism in track() / trackEngagement, not as
//      regular payload keys. See swap-reason.ts buildSubmittedProps.
//
// Why a grep test instead of a stricter type check: the denylist is
// also about person properties (loose object shape) and about the
// schema FILE TEXT — a key gets added to events.ts as a literal, and
// the test should fail fast on that literal even before downstream
// code references it.

const PII_KEYS = ["email", "phone", "name"] as const;
const REPO_ROOT = join(__dirname, "..", "..");
const SRC_ROOT = join(REPO_ROOT, "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Generated files mirror the sheet — they don't ship analytics
      // and would false-positive on the literal "name" in
      // NeighborhoodGroup.
      if (entry === "generated" || entry === "node_modules") continue;
      out.push(...walk(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("analytics PII denylist", () => {
  it("EventSchemas declaration has no email/phone/name keys", () => {
    // Read the schema file as text and scan the EventSchemas interface
    // body — we want to catch a developer adding `email: string` to a
    // schema entry, which would compile fine but leak PII.
    const eventsTs = readFileSync(
      join(SRC_ROOT, "lib", "analytics", "events.ts"),
      "utf-8",
    );
    const schemaStart = eventsTs.indexOf("export interface EventSchemas");
    expect(schemaStart, "EventSchemas interface not found").toBeGreaterThan(0);
    const schemaEnd = eventsTs.indexOf(
      "_EventSchemaCoverageCheck",
      schemaStart,
    );
    const schemaBody = eventsTs.slice(schemaStart, schemaEnd);

    for (const key of PII_KEYS) {
      // Match `email:` / `phone:` / `name:` (a real property declaration).
      // Allow "name" inside venue_name / from_venue_name — those are
      // intentionally denormalized public venue names, not PII.
      const re = new RegExp(`(^|[^a-zA-Z_])${key}\\s*[?:]`, "g");
      const allowed = ["venue_name", "from_venue_name", "to_venue_name"];
      let match: RegExpExecArray | null;
      while ((match = re.exec(schemaBody)) !== null) {
        const offset = match.index + match[1].length;
        const slice = schemaBody.slice(Math.max(0, offset - 20), offset + 10);
        const ok = allowed.some((tok) => slice.includes(tok));
        if (!ok) {
          throw new Error(
            `PII key "${key}" appears in EventSchemas at "${slice.trim()}". ` +
              "Free-text PII goes to the Supabase mirror via mirrorOnlyProps, " +
              "never to a PostHog payload.",
          );
        }
      }
    }
  });

  it("no event name itself contains email/phone/name", () => {
    for (const [key, value] of Object.entries(EVENTS)) {
      for (const pii of PII_KEYS) {
        if (key === "USER_SIGNED_UP" || key === "USER_SIGNED_IN") continue;
        // Allow "name" only inside venue_name in any future event — but
        // EVENT NAMES themselves should never reference user PII.
        expect(
          value.includes(pii) && !value.includes("venue_name"),
          `EVENTS.${key} = "${value}" references PII key "${pii}"`,
        ).toBe(false);
      }
    }
  });

  it("no setPersonProperties call passes an email/phone/name key", () => {
    // Person properties land in PostHog's person object and are queryable
    // by anyone with project access — the spec is "signup_at and
    // signup_source only, never PII." Grep the source.
    const files = walk(SRC_ROOT);
    const violations: string[] = [];
    const setterRe =
      /(setPersonProperties|setPersonPropertiesOnce|\$set|\$set_once)\s*\(([^)]+)\)/g;
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      let m: RegExpExecArray | null;
      while ((m = setterRe.exec(text)) !== null) {
        const args = m[2];
        for (const pii of PII_KEYS) {
          const piiRe = new RegExp(`["']?${pii}["']?\\s*:`, "g");
          if (piiRe.test(args)) {
            violations.push(
              `${relative(REPO_ROOT, file)}: ${m[1]}(…${pii}…)`,
            );
          }
        }
      }
    }
    expect(
      violations,
      `Person-property setters pass PII keys:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
