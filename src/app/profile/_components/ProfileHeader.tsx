"use client";

interface ProfileHeaderProps {
  email: string;
  onSignOut: () => Promise<void> | void;
}

export function ProfileHeader({ email, onSignOut }: ProfileHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-10">
      <div>
        <h1 className="font-serif text-2xl font-normal text-charcoal leading-tight">
          Your Profile
        </h1>
        <p className="font-sans text-sm text-muted mt-1">{email}</p>
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
