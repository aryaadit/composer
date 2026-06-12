// Presentation-only formatting for venue category slugs.
// Data layer stays snake_case — this is called at render time only.

const OVERRIDES: Record<string, string> = {
  bbq: "BBQ",
  les: "LES",
  dim_sum: "Dim Sum",
  soho: "SoHo",
  noho: "NoHo",
};

export function formatCategory(raw: string): string {
  if (!raw) return "";
  if (OVERRIDES[raw]) return OVERRIDES[raw];
  return raw
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// Audit item 21: vibe chips need a separate casing rule from
// categories. Acronyms render uppercase ("IYKYK"); everything else
// renders sentence case ("Late night", "Conversation friendly")
// instead of the Title Case formatCategory applies to categories.
// Keep this list narrow — false positives turn "park" into "PARK".
const ACRONYM_VIBE_TAGS = new Set([
  "iykyk",
  "byob",
  "nyc",
  "bbq",
  "les",
]);

export function formatVibeTag(raw: string): string {
  if (!raw) return "";
  if (ACRONYM_VIBE_TAGS.has(raw)) return raw.toUpperCase();
  const words = raw.split("_");
  const first = words[0];
  const head = first[0].toUpperCase() + first.slice(1);
  const tail = words.slice(1).join(" ");
  return tail ? `${head} ${tail}` : head;
}
