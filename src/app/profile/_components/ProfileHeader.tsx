"use client";

interface ProfileHeaderProps {
  name: string;
  email: string;
  onSignOut: () => Promise<void> | void;
}

export function ProfileHeader({ name, email, onSignOut }: ProfileHeaderProps) {
  // Name + email are read-only identity info — stacked on two lines
  // with the name slightly weightier than the email so the eye lands
  // on the person, then the handle. `text-charcoal` is the project's
  // `gray-800` equivalent (primary body color); `text-muted` is the
  // `gray-400` secondary.
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="font-serif text-2xl font-normal text-charcoal leading-tight">
          Your Profile
        </h1>
        <p className="font-sans text-base font-medium text-charcoal mt-2">
          {name}
        </p>
        <p className="font-sans text-sm text-muted mt-0.5">{email}</p>
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
