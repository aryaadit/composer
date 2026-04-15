export const AWARD_LABELS: Record<string, string> = {
  michelin_3_star: "Michelin ★★★",
  michelin_2_star: "Michelin ★★",
  michelin_1_star: "Michelin ★",
  michelin_bib: "Michelin Bib Gourmand",
  michelin_recommended: "Michelin Recommended",
  james_beard: "James Beard Award",
  james_beard_nominee: "James Beard Nominee",
  nyt_top_100: "NYT Top 100",
  nyt_critics_pick: "NYT Critic's Pick",
  worlds_50_best: "World's 50 Best",
  ny_mag_best: "NY Mag Best",
};

export function awardLabel(slug: string): string {
  return AWARD_LABELS[slug] ?? slug;
}
