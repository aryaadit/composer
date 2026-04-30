// Shared page header. Composer lockup on the left (always linked to
// home), arbitrary right slot for back links, profile icons, etc.
//
// Self-contains its padding + max-width wrapper so callers don't need
// to repeat them. Pages that need a wider body (privacy) still get the
// standard-width header — that's intentional, magazine-style.

import Link from "next/link";
import type { ReactNode } from "react";

interface HeaderProps {
  /** Right-aligned slot. Typically a Back link, profile icon, or step-back button. */
  rightSlot?: ReactNode;
}

export function Header({ rightSlot }: HeaderProps) {
  return (
    <div className="px-6 pt-6 max-w-lg w-full mx-auto">
      <header className="flex items-center justify-between py-4">
        <Link href="/" aria-label="Composer — home" className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/composer-lockup.svg"
            alt="Composer"
            className="h-8 w-auto"
          />
        </Link>

        {rightSlot && <div className="flex items-center">{rightSlot}</div>}
      </header>
    </div>
  );
}
