"use client";

// Shared skeleton primitive for the venue sync UI.
//
// Rendered inside the same panel components that show real data — the
// loading-mode and ready-mode share layout so there's no jump when the
// skeleton swaps for content. Width is set by Tailwind class so callers
// can match each placeholder to typical content width (a `1,310 venues`
// skeleton should be the width of `1,310 venues`, not 50% wider).
//
// `aria-hidden` because per the panel spec we put `aria-busy` on the
// container — making each bar individually announceable would just
// produce screen-reader noise.

interface SkeletonBarProps {
  /** Tailwind width class, e.g. "w-32" or "w-48". */
  width?: string;
  /** Tailwind height class. Defaults to h-3 (matches text-xs leading). */
  height?: string;
  className?: string;
}

export function SkeletonBar({
  width = "w-24",
  height = "h-3",
  className = "",
}: SkeletonBarProps) {
  return (
    <span
      aria-hidden
      className={`inline-block ${width} ${height} bg-border rounded animate-pulse align-middle ${className}`}
    />
  );
}
