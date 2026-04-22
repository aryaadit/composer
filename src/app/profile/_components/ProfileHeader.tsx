"use client";

interface ProfileHeaderProps {
  name: string;
  /** Email if set, otherwise null (phone-only users). */
  email: string | null;
  /** Phone in E.164 format if present. */
  phone: string | null;
  onSignOut: () => Promise<void> | void;
}

function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const local = digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return e164;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

export function ProfileHeader({
  name,
  email,
  phone,
  onSignOut,
}: ProfileHeaderProps) {
  const identifier = email || (phone ? formatPhone(phone) : "");

  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="font-serif text-2xl font-normal text-charcoal leading-tight">
          Your Profile
        </h1>
        <p className="font-sans text-base font-medium text-charcoal mt-2">
          {name}
        </p>
        {identifier && (
          <p className="font-sans text-sm text-muted mt-0.5">{identifier}</p>
        )}
      </div>
      <button
        onClick={() => void onSignOut()}
        className="font-sans text-xs tracking-wide uppercase text-muted hover:text-charcoal transition-colors mt-1"
      >
        Sign out
      </button>
    </div>
  );
}
