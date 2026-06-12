"use client";

import { motion } from "motion/react";

interface ButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  /** Size scale — added 2026-06-12 so the five high-traffic primary
   *  CTAs that used to hand-roll their own padding can route through
   *  this primitive at pixel-parity.
   *    "sm"  — inline / modal-footer submits (px-5 py-2.5 text-sm)
   *    "md"  — default body button (px-8 py-3.5 text-base)
   *    "lg"  — block hero CTAs like HomeScreen "New plan"
   *            (px-5 py-5 text-sm tracking-wide)
   *    "xl"  — sticky-bar hero CTAs like itinerary "Looks Good"
   *            (px-6 py-4 text-base). Full-width hero variants
   *            should also pass className="w-full". */
  size?: "sm" | "md" | "lg" | "xl";
  onClick?: () => void;
  href?: string;
  /** Anchor target — only honored when `href` is set. Use "_blank" for
   *  external/reservation links; the primitive auto-adds
   *  rel="noopener noreferrer" for that case so callers can't forget. */
  target?: string;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  /** Optional explicit aria-label — needed for icon-only buttons. */
  "aria-label"?: string;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  onClick,
  href,
  target,
  className = "",
  disabled = false,
  type = "button",
  "aria-label": ariaLabel,
}: ButtonProps) {
  // focus-visible (not :focus) so mouse clicks don't leave a stuck
  // ring; matches the audit's launch-blocker recommendation and is the
  // pattern the input fields are migrating to as well.
  // disabled:opacity-40 is the CANONICAL disabled treatment for the
  // app (CLAUDE.md "Design System → Disabled state"). SwapReasonModal
  // Submit and any other button-shaped affordance MUST go through
  // this primitive rather than rolling its own opacity / cursor.
  const base =
    "inline-flex items-center justify-center rounded-full font-sans font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-burgundy/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40";

  const variants = {
    primary: "bg-burgundy text-cream hover:bg-burgundy-light",
    secondary:
      "bg-transparent text-burgundy border border-burgundy hover:bg-burgundy hover:text-cream",
  };

  const sizes = {
    // "sm" matches both StopAvailability's slot-specific reserve pill
    // AND SwapReasonModal's Submit at pixel-parity — both used the
    // same "px-5 py-2.5 text-sm font-medium" recipe before this
    // migration. VenueDetailModal Reserve's slightly different
    // "px-4 py-3" still routes through size="sm" via a className
    // override at the call site (documented in the migration commit).
    sm: "px-5 py-2.5 text-sm",
    md: "px-8 py-3.5 text-base",
    // "lg" matches HomeScreen's "py-5 px-5 ... text-sm font-medium
    // tracking-wide" recipe so the hero CTA can route through this
    // primitive without visual delta.
    lg: "px-5 py-5 text-sm tracking-wide",
    // "xl" matches the itinerary-page sticky "Looks Good" hero. Added
    // 2026-06-12 (adversarial review of the visual-audit batch) so the
    // call site no longer leans on non-important className overrides
    // beating size="md" on the same property — same-utility collisions
    // resolve by CSS source order, not class-attribute order, which is
    // not contractually guaranteed in Tailwind v4.
    xl: "px-6 py-4 text-base",
  };

  const classes = `${base} ${variants[variant]} ${sizes[size]} ${className}`;

  if (href) {
    const isExternal = target === "_blank";
    return (
      <motion.a
        href={href}
        target={target}
        // Auto-attach rel when opening in a new tab so external Reserve
        // links can't leak window.opener references.
        rel={isExternal ? "noopener noreferrer" : undefined}
        onClick={onClick}
        className={classes}
        aria-label={ariaLabel}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button
      type={type}
      onClick={onClick}
      className={classes}
      disabled={disabled}
      aria-label={ariaLabel}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.button>
  );
}
