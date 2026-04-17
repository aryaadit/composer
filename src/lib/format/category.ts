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
