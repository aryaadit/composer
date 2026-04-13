// Canonical stop roles. Drives the TypeScript `StopRole` union type and the
// display labels shown on stop cards.
//
// The three-role structure (Opener → Main → Closer) is locked by product
// decision — adding a role would require reviewing `lib/composer.ts`
// (`planStopMix`) and `lib/scoring.ts` (`pickBestForRole`) since those assume
// Main is the geographic anchor and the rest fan out from it.

export const STOP_ROLES = [
  { slug: "opener", label: "Opener" },
  { slug: "main", label: "Main" },
  { slug: "closer", label: "Closer" },
] as const;

export type StopRoleSlug = (typeof STOP_ROLES)[number]["slug"];

export const ROLE_LABELS: Record<StopRoleSlug, string> = Object.fromEntries(
  STOP_ROLES.map((r) => [r.slug, r.label])
) as Record<StopRoleSlug, string>;
