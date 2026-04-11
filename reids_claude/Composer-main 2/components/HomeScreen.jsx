'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Plus, MapPin, Clock, Menu as MenuIcon } from 'lucide-react';
import PlanFlow from './PlanFlow';
import NextUpWidget from './NextUpWidget';
import SideMenu from './SideMenu';
import { useAuth } from '@/lib/AuthContext';
import { useSavedPlans } from '@/lib/useSavedPlans';

// NycMap depends on leaflet (window-only) — load client-side only.
const NycMap = dynamic(() => import('./NycMap'), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-[#ececec] bg-[#fafafa] h-[280px] animate-pulse" />
  ),
});

export default function HomeScreen({ userName, userPrefs, justOnboarded }) {
  const [isPlanning, setIsPlanning] = useState(false);
  const [showCoachmark, setShowCoachmark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();
  const { plans: savedPlans, savePlan } = useSavedPlans();

  useEffect(() => {
    if (justOnboarded && savedPlans.length === 0) {
      setShowCoachmark(true);
    }
  }, [justOnboarded, savedPlans.length]);

  // Only pull in the dashboard widgets once the user has at least one saved
  // plan — before that the home screen should look like its original clean
  // minimal self. IMPORTANT: these memos must be declared above any early
  // return so React sees the same hook order every render.
  const hasPlans = savedPlans.length > 0;

  const hasUpcoming = useMemo(() => {
    if (!hasPlans) return false;
    const now = Date.now();
    return savedPlans.some((p) => {
      const dateStr = p?.meta?.date;
      if (!dateStr) return false;
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!y || !m || !d) return false;
      return new Date(y, m - 1, d, 23, 59, 59).getTime() >= now;
    });
  }, [savedPlans, hasPlans]);

  if (isPlanning) {
    return (
      <PlanFlow
        userName={userName}
        userPrefs={userPrefs}
        onBack={() => setIsPlanning(false)}
        onSavePlan={async (plan) => {
          try {
            await savePlan(plan);
          } catch (e) {
            console.error('savePlan failed', e);
          }
          setIsPlanning(false);
        }}
      />
    );
  }

  const greet = getGreeting();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white relative">
      {/* Header */}
      <div className="pt-14 px-6 pb-6 flex items-start justify-between">
        <div>
          <div className="text-sm text-[var(--muted)]">{greet},</div>
          <div className="serif text-3xl mt-1">{userName || 'friend'}</div>
        </div>
        {/* Hamburger → opens the right-side drawer menu (Beli-style). */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="mt-2 w-10 h-10 rounded-full border border-[#ececec] flex items-center justify-center hover:bg-gray-50 transition-colors overflow-hidden"
          aria-label="Open menu"
          title="Menu"
        >
          {user?.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt=""
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <MenuIcon size={18} className="text-[var(--muted)]" />
          )}
        </button>
      </div>

      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Hero CTA card */}
      <div className="px-6">
        <button
          className="home-card"
          onClick={() => {
            setShowCoachmark(false);
            setIsPlanning(true);
          }}
        >
          <div className="text-xs font-semibold tracking-widest opacity-80 mb-2">
            PLAN A DATE
          </div>
          <div className="serif text-2xl mb-1">New date plan</div>
          <div className="text-sm opacity-90">
            Pick a vibe, a neighborhood, and a time — we&apos;ll handle the rest.
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs opacity-80">~60 seconds</div>
            <div className="w-10 h-10 bg-white rounded-full text-[var(--mango)] text-xl font-semibold flex items-center justify-center">
              →
            </div>
          </div>
        </button>
      </div>

      {/* Dashboard widgets — only once there's at least one plan. */}
      {hasUpcoming && (
        <div className="px-6 mt-6">
          <NextUpWidget plans={savedPlans} />
        </div>
      )}

      {hasPlans && (
        <div className="px-6 mt-6">
          <NycMap plans={savedPlans} />
        </div>
      )}

      {/* Your plans */}
      <div className="px-6 mt-8 flex-1">
        <div className="text-xs font-semibold tracking-widest text-[var(--muted)] mb-3">
          YOUR PLANS
        </div>
        {savedPlans.length === 0 ? (
          <div className="border border-dashed border-[#e5e5e5] rounded-2xl p-6 text-center text-[var(--muted)] text-sm">
            No plans yet. Create your first one!
          </div>
        ) : (
          <div className="space-y-3">
            {savedPlans.map((plan, i) => (
              <div
                key={i}
                className="p-4 rounded-2xl border border-[#ececec] flex items-center gap-4"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: 'var(--mango-soft)' }}
                >
                  {plan.vibeEmoji || '✨'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {Array.isArray(plan.itinerary) && plan.itinerary[0]?.name
                      ? plan.itinerary[0].name
                      : 'Date plan'}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--muted)] mt-1">
                    <span className="flex items-center gap-1">
                      <MapPin size={12} />
                      {plan.meta?.neighborhoods?.[0] || 'NYC'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {plan.meta?.startTime || ''}
                    </span>
                    <span>
                      {Array.isArray(plan.itinerary) ? plan.itinerary.length : 0} stops
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* First-run coachmark pointing to the hero card */}
      {showCoachmark && (
        <>
          <div className="dim-overlay" onClick={() => setShowCoachmark(false)} />
          <div className="coachmark" style={{ top: 305, right: 24 }}>
            <div className="font-semibold mb-1">Tap here to start</div>
            <div className="text-sm opacity-90 mb-3">
              In 3 quick steps you&apos;ll have a full date plan with reservations ready to
              copy-paste.
            </div>
            <button
              className="text-sm font-semibold bg-white text-black rounded-full px-4 py-1.5"
              onClick={() => setShowCoachmark(false)}
            >
              Got it
            </button>
          </div>
          <div
            className="absolute right-6 rounded-full bg-white flex items-center justify-center text-[var(--mango)] text-2xl font-light z-[58]"
            style={{
              top: 238,
              width: 52,
              height: 52,
              boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            }}
          >
            <Plus size={22} />
          </div>
        </>
      )}
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
