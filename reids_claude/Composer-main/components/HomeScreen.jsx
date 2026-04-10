'use client';

import { useState } from 'react';
import { Plus, Calendar, Clock, MapPin } from 'lucide-react';
import PlanFlow from './PlanFlow';

export default function HomeScreen({ userName, userContext }) {
  const [isPlanning, setIsPlanning] = useState(false);
  const [savedPlans, setSavedPlans] = useState([]);

  if (isPlanning) {
    return (
      <PlanFlow
        userName={userName}
        onBack={() => setIsPlanning(false)}
        onSavePlan={(plan) => {
          setSavedPlans((prev) => [plan, ...prev]);
          setIsPlanning(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="px-6 pt-14 pb-6">
        <p className="text-gray-500 text-sm mb-1">
          {getGreeting()}, {userName}
        </p>
        <h1 className="text-3xl font-bold font-display">
          Plan a date
        </h1>
      </div>

      {/* Main CTA */}
      <div className="px-6 mb-8">
        <button
          onClick={() => setIsPlanning(true)}
          className="w-full p-6 rounded-2xl text-white text-left relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #ff7a11 0%, #ff9838 50%, #ffbe71 100%)',
          }}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Plus size={22} />
              </div>
              <span className="font-bold text-lg font-display">New Date Plan</span>
            </div>
            <p className="text-white/90 text-sm">
              Pick a vibe, a neighborhood, and a time — we&apos;ll handle the rest.
            </p>
          </div>
          {/* Decorative circle */}
          <div
            className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          />
        </button>
      </div>

      {/* Saved plans */}
      <div className="px-6 flex-1">
        <h2 className="text-lg font-bold font-display mb-4">Your plans</h2>
        {savedPlans.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Calendar size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No plans yet. Create your first one!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {savedPlans.map((plan, i) => (
              <div
                key={i}
                className="p-4 rounded-xl border border-gray-200 flex items-center gap-4"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: '#fff8ed' }}
                >
                  {plan.vibeEmoji || '✨'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {plan.itinerary?.stops?.[0]?.place?.name || 'Date plan'}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {plan.meta?.neighborhoods?.[0] || 'NYC'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {plan.itinerary?.startTime || ''}
                    </span>
                    <span>{plan.itinerary?.totalStops} stops</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="px-6 py-6 border-t border-gray-100 mt-auto">
        <div className="flex justify-around text-center">
          <div>
            <div className="text-2xl font-bold font-display" style={{ color: 'var(--brand-primary)' }}>
              {savedPlans.length}
            </div>
            <div className="text-xs text-gray-500">Plans made</div>
          </div>
          <div>
            <div className="text-2xl font-bold font-display" style={{ color: 'var(--brand-primary)' }}>
              {savedPlans.reduce((sum, p) => sum + (p.itinerary?.totalStops || 0), 0)}
            </div>
            <div className="text-xs text-gray-500">Places found</div>
          </div>
          <div>
            <div className="text-2xl font-bold font-display" style={{ color: 'var(--brand-primary)' }}>
              0
            </div>
            <div className="text-xs text-gray-500">Texts sent</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
