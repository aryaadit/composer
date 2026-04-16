// Shared page header. Composer lockup on the left (always linked to
// home), optional "← Back" affordance on the right. Always render
// inside the same max-width column as the page content so the lockup
// aligns with everything below it.

import Link from "next/link";

interface HeaderProps {
  /** Render a "← Back" link on the right. */
  showBack?: boolean;
  /** Where the back link points. Defaults to home. */
  backHref?: string;
}

export function Header({ showBack = false, backHref = "/" }: HeaderProps) {
  return (
    <header className="flex items-center justify-between py-4">
      <Link href="/" aria-label="Composer — home" className="inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/composer-lockup.svg"
          alt="Composer"
          className="h-8 w-auto"
        />
      </Link>

      {showBack && (
        <Link
          href={backHref}
          className="font-sans text-sm text-muted hover:text-charcoal transition-colors"
        >
          &larr; Back
        </Link>
      )}
    </header>
  );
}
