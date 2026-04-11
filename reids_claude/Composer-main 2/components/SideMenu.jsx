'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  ChevronRight,
  ChevronLeft,
  User as UserIcon,
  Sliders,
  Bell,
  HelpCircle,
  LogOut,
  Mail,
  Phone,
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { ALL_NEIGHBORHOODS, BUDGET_TIERS } from '@/lib/constants';

/**
 * SideMenu — right-anchored drawer modeled after Beli's hamburger menu.
 *
 * Open/close is controlled by the parent. Internally the drawer holds a
 * tiny view stack: "menu" lists the sections; picking one swaps in the
 * detail view for that section. Back button returns to the menu.
 */
export default function SideMenu({ open, onClose }) {
  const [view, setView] = useState('menu');
  const { user, signOut } = useAuth();
  const router = useRouter();

  // Reset to the top-level menu any time the drawer is re-opened.
  useEffect(() => {
    if (open) setView('menu');
  }, [open]);

  // Lock body scroll when the drawer is visible.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (e) {
      console.warn('sign out failed', e);
    }
    onClose();
    router.replace('/sign-in');
  };

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-[fadeIn_150ms_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 bottom-0 w-[86%] max-w-sm bg-white z-50 shadow-2xl flex flex-col animate-[slideInRight_220ms_ease-out]"
        role="dialog"
        aria-label="Menu"
      >
        {view === 'menu' && (
          <MenuView
            user={user}
            onClose={onClose}
            onPick={setView}
            onSignOut={handleSignOut}
          />
        )}
        {view === 'profile' && (
          <ProfileView onBack={() => setView('menu')} user={user} />
        )}
        {view === 'preferences' && (
          <PreferencesView onBack={() => setView('menu')} user={user} />
        )}
        {view === 'notifications' && (
          <NotificationsView onBack={() => setView('menu')} user={user} />
        )}
        {view === 'help' && <HelpView onBack={() => setView('menu')} />}
      </aside>

      {/* Scoped keyframes so this component is self-contained */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}

// ---------- top-level menu -------------------------------------------------

function MenuView({ user, onClose, onPick, onSignOut }) {
  const items = [
    {
      id: 'profile',
      icon: UserIcon,
      label: 'Your account',
      sub: 'Name, phone, email',
    },
    {
      id: 'preferences',
      icon: Sliders,
      label: 'Preferences',
      sub: 'Neighborhoods, budget, walk time',
    },
    {
      id: 'notifications',
      icon: Bell,
      label: 'Notifications',
      sub: 'Departure + weather alerts',
    },
    {
      id: 'help',
      icon: HelpCircle,
      label: 'Help & FAQ',
      sub: 'Get in touch with us',
    },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-10 pb-4 border-b border-[#ececec]">
        <div className="serif text-2xl">Menu</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="w-9 h-9 rounded-full bg-[#f5f5f5] flex items-center justify-center hover:bg-[#eaeaea]"
        >
          <X size={16} />
        </button>
      </div>

      {/* Profile chip */}
      <div className="px-5 py-4 flex items-center gap-3 border-b border-[#ececec]">
        {user?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-[var(--mango-soft)] text-[var(--mango-dark)] flex items-center justify-center serif text-xl">
            {(user?.displayName || user?.email || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="font-semibold truncate">
            {user?.displayName || 'Signed in'}
          </div>
          <div className="text-xs text-[var(--muted)] truncate">
            {user?.email || ''}
          </div>
        </div>
      </div>

      {/* Items */}
      <nav className="flex-1 overflow-y-auto">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onPick(it.id)}
              className="w-full flex items-center gap-4 px-5 py-4 border-b border-[#f3f3f3] hover:bg-[#fafafa] text-left"
            >
              <div className="w-9 h-9 rounded-full bg-[var(--mango-soft)] text-[var(--mango-dark)] flex items-center justify-center flex-shrink-0">
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{it.label}</div>
                <div className="text-xs text-[var(--muted)] truncate">
                  {it.sub}
                </div>
              </div>
              <ChevronRight size={16} className="text-[var(--muted)]" />
            </button>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-5 py-5 border-t border-[#ececec]">
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-700"
        >
          <LogOut size={16} /> Log out
        </button>
      </div>
    </div>
  );
}

// ---------- detail: profile ------------------------------------------------

function ProfileView({ onBack, user }) {
  return (
    <DetailShell title="Your account" onBack={onBack}>
      <div className="flex flex-col items-center pt-2 pb-6">
        {user?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            className="w-20 h-20 rounded-full object-cover mb-3"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-[var(--mango-soft)] text-[var(--mango-dark)] flex items-center justify-center serif text-3xl mb-3">
            {(user?.displayName || user?.email || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="serif text-xl">{user?.displayName || '—'}</div>
      </div>

      <div className="space-y-3">
        <ReadonlyRow
          icon={Mail}
          label="Email"
          value={user?.email || 'Not set'}
        />
        <ReadonlyRow
          icon={Phone}
          label="Phone"
          value={user?.phoneNumber || 'Not set'}
        />
      </div>

      <p className="text-xs text-[var(--muted)] mt-6 leading-relaxed">
        Your account details are tied to the Google account you signed in with.
        To change your name or email, update your Google profile and sign in
        again.
      </p>
    </DetailShell>
  );
}

function ReadonlyRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#ececec]">
      <Icon size={16} className="text-[var(--muted)] flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-widest text-[var(--muted)]">
          {label}
        </div>
        <div className="text-sm truncate">{value}</div>
      </div>
    </div>
  );
}

// ---------- detail: preferences -------------------------------------------

function PreferencesView({ onBack, user }) {
  const [prefs, setPrefs] = useState(null);
  const [savedAt, setSavedAt] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (cancelled) return;
        const stored = snap.exists() ? snap.data().preferences : null;
        setPrefs(
          stored || {
            neighborhoods: [],
            budget: 'solid',
            maxWalkMinutes: 12,
            notifications: { departureAlerts: true, weatherAlerts: true },
          }
        );
      } catch (e) {
        console.warn('load prefs failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  const save = async (next) => {
    setPrefs(next);
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { preferences: next, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setSavedAt(Date.now());
    } catch (e) {
      console.error('save prefs failed', e);
    } finally {
      setSaving(false);
    }
  };

  const toggleHood = (name) => {
    const set = new Set(prefs.neighborhoods || []);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    save({ ...prefs, neighborhoods: [...set] });
  };

  return (
    <DetailShell
      title="Preferences"
      onBack={onBack}
      status={saving ? 'Saving…' : savedAt ? 'Saved ✓' : ''}
    >
      {!prefs ? (
        <div className="text-sm text-[var(--muted)]">Loading…</div>
      ) : (
        <div className="space-y-7">
          <Section title="Favorite neighborhoods">
            <div className="flex flex-wrap gap-2">
              {(ALL_NEIGHBORHOODS || []).map((n) => {
                const name = n.name;
                const active = (prefs.neighborhoods || []).includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleHood(name)}
                    className={
                      'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                      (active
                        ? 'bg-[var(--mango)] text-white border-[var(--mango)]'
                        : 'border-[#ececec] text-[var(--muted)] hover:border-gray-300')
                    }
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Default budget">
            <div className="flex flex-wrap gap-2">
              {(BUDGET_TIERS || []).map((b) => {
                const id = b.id;
                const label = `${b.emoji || ''} ${b.name} ${b.symbol || ''}`.trim();
                const active = prefs.budget === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => save({ ...prefs, budget: id })}
                    className={
                      'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                      (active
                        ? 'bg-[var(--mango)] text-white border-[var(--mango)]'
                        : 'border-[#ececec] text-[var(--muted)] hover:border-gray-300')
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Max walk between stops">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={5}
                max={25}
                step={1}
                value={prefs.maxWalkMinutes}
                onChange={(e) =>
                  save({ ...prefs, maxWalkMinutes: Number(e.target.value) })
                }
                className="flex-1"
              />
              <div className="text-sm w-16 text-right">
                {prefs.maxWalkMinutes} min
              </div>
            </div>
          </Section>
        </div>
      )}
    </DetailShell>
  );
}

// ---------- detail: notifications -----------------------------------------

function NotificationsView({ onBack, user }) {
  const [prefs, setPrefs] = useState(null);
  const [savedAt, setSavedAt] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (cancelled) return;
        const stored = snap.exists() ? snap.data().preferences : null;
        setPrefs(
          stored || {
            neighborhoods: [],
            budget: 'solid',
            maxWalkMinutes: 12,
            notifications: { departureAlerts: true, weatherAlerts: true },
          }
        );
      } catch (e) {
        console.warn('load prefs failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  const save = async (next) => {
    setPrefs(next);
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { preferences: next, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setSavedAt(Date.now());
    } catch (e) {
      console.error('save notif prefs failed', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailShell
      title="Notifications"
      onBack={onBack}
      status={saving ? 'Saving…' : savedAt ? 'Saved ✓' : ''}
    >
      {!prefs ? (
        <div className="text-sm text-[var(--muted)]">Loading…</div>
      ) : (
        <div className="space-y-1">
          <ToggleRow
            label="Departure alerts"
            description="Remind me when it's time to leave for the next stop."
            value={!!prefs.notifications?.departureAlerts}
            onChange={(v) =>
              save({
                ...prefs,
                notifications: {
                  ...prefs.notifications,
                  departureAlerts: v,
                },
              })
            }
          />
          <ToggleRow
            label="Weather alerts"
            description="Suggest indoor alternates when rain is in the forecast."
            value={!!prefs.notifications?.weatherAlerts}
            onChange={(v) =>
              save({
                ...prefs,
                notifications: {
                  ...prefs.notifications,
                  weatherAlerts: v,
                },
              })
            }
          />
        </div>
      )}
    </DetailShell>
  );
}

// ---------- detail: help ---------------------------------------------------

function HelpView({ onBack }) {
  return (
    <DetailShell title="Help & FAQ" onBack={onBack}>
      <div className="space-y-4 text-sm text-[var(--muted)] leading-relaxed">
        <div>
          <div className="font-semibold text-black mb-1">
            How does Composer pick places?
          </div>
          <p>
            We pull venues from Google Places and re-rank them based on your
            neighborhoods, budget, and walking distance before the final
            itinerary is assembled.
          </p>
        </div>
        <div>
          <div className="font-semibold text-black mb-1">
            Can I edit a saved plan?
          </div>
          <p>
            Tap any saved plan on the home screen to view its stops. In-place
            editing is coming soon — for now you can save a new plan.
          </p>
        </div>
        <div>
          <div className="font-semibold text-black mb-1">
            Is my data private?
          </div>
          <p>
            Yes. Your plans and preferences are stored in your own Firebase
            profile and are never shown to anyone else.
          </p>
        </div>
        <div className="pt-4 border-t border-[#ececec]">
          <div className="font-semibold text-black mb-1">Still stuck?</div>
          <p>
            Email{' '}
            <a
              href="mailto:hello@composer.nyc"
              className="text-[var(--mango-dark)] underline"
            >
              hello@composer.nyc
            </a>{' '}
            and we&apos;ll get back to you.
          </p>
        </div>
      </div>
    </DetailShell>
  );
}

// ---------- shared layout pieces ------------------------------------------

function DetailShell({ title, onBack, status, children }) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-10 pb-4 border-b border-[#ececec]">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-[#f5f5f5] flex items-center justify-center hover:bg-[#eaeaea]"
          aria-label="Back"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="serif text-lg">{title}</div>
        <div className="w-9 h-9" aria-hidden="true" />
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      <div className="px-5 pb-4 text-xs text-[var(--muted)] h-5">
        {status || ''}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-[var(--mango-dark)] font-semibold mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-[#f3f3f3] last:border-b-0">
      <div className="pr-4 min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-[var(--muted)] mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={
          'w-11 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ' +
          (value ? 'bg-[var(--mango)]' : 'bg-[#e5e5e5]')
        }
      >
        <div
          className={
            'w-5 h-5 bg-white rounded-full shadow transition-transform ' +
            (value ? 'translate-x-5' : 'translate-x-0')
          }
        />
      </button>
    </div>
  );
}
