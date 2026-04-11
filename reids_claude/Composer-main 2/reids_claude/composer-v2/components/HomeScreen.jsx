'use client';

import { useState, useEffect } from 'react';
import { Plus, MapPin, Clock } from 'lucide-react';
import PlanFlow from './PlanFlow';

export default function HomeScreen({ userName, userPrefs, justOnboarded }) {
  const [isPlanning, setIsPlanning] = useState(false);
  const [savedPlans, setSavedPlans] = useState([]);
  const [showCoachmark, setShowCoachmark] = useState(false);

  useEffect(() => {
    if (justOnboarded && savedPlans.length === 0) {
      setShowCoachmark(true);
    }
  }, [justOnboarded, savedPlans.length]);

  if (isPlanning) {
    return (
      <PlanFlow
        userName={userName}
        userPrefs={userPrefs}
        onBack={() => setIsPlanning(false)}
        onSavePlan={(plan) => {
          setSavedPlans((prev) => [plan, ...prev]);
          setIsPlanning(false);
        }}
      />
    );
  }

  const greet = getGreeting();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white relative">
      {/* Header */}
      <div className="pt-14 px-6 pb-6">
        <div className="text-sm text-[var(--muted)]">{greet},</div>
        <div className="serif text-3xl mt-1">{userName || 'friend'}</div>
      </div>

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
                    {plan.itinerary?.stops?.[0]?.place?.name || 'Date plan'}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--muted)] mt-1">
                    <span className="flex items-center gap-1">
                      <MapPin size={12} />
                      {plan.meta?.neighborhoods?.[0] || 'NYC'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {plan.itinerary?.startTime || ''}
                    </span>
                    <span>{plan.itinerary?.totalStops} stops</span>
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
