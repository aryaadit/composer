// Canonical stop roles. Drives the TypeScript `StopRole` union type and the
// display label + color class used by `StopCard`.
//
// The three-role structure (Opener → Main → Closer) is locked by product
// decision — adding a role would require reviewing `lib/composer.ts`
// (`planStopMix`) and `lib/scoring.ts` (`pickBestForRole`) since those assume
// Main is the geographic anchor and the rest fan out from it.

export const STOP_ROLES = [
  {
    slug: "opener",
    label: "Opener",
    colorClass: "bg-forest/10 text-forest",
  },
  {
    slug: "main",
    label: "Main",
    colorClass: "bg-burgundy/10 text-burgundy",
  },
  {
    slug: "closer",
    label: "Closer",
    colorClass: "bg-charcoal/10 text-charcoal",
  },
] as const;

export type StopRoleSlug = (typeof STOP_ROLES)[number]["slug"];

export const ROLE_LABELS: Record<StopRoleSlug, string> = Object.fromEntries(
  STOP_ROLES.map((r) => [r.slug, r.label])
) as Record<StopRoleSlug, string>;

export const ROLE_COLOR_CLASSES: Record<StopRoleSlug, string> = Object.fromEntries(
  STOP_ROLES.map((r) => [r.slug, r.colorClass])
) as Record<StopRoleSlug, string>;
