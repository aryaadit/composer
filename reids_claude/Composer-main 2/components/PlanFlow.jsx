'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  NEIGHBORHOODS,
  VIBES,
  BUDGET_TIERS,
  DATE_TYPES,
} from '@/lib/constants';
import ItineraryView from './ItineraryView';
import TimeWheel from './TimeWheel';

const FLOW_STEPS = ['where', 'details', 'when'];

function defaultStartTime() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const rounded = Math.ceil(mins / 15) * 15 + 60;
  const h = Math.floor(rounded / 60) % 24;
  const m = rounded % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function defaultEndTime(start) {
  const [h, m] = start.split(':').map(Number);
  const end = h * 60 + m + 180;
  const eh = Math.floor(end / 60) % 24;
  const em = end % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

export default function PlanFlow({ userName, userPrefs, onBack, onSavePlan }) {
  const [step, setStep] = useState(0);
  const initStart = defaultStartTime();
  const [selections, setSelections] = useState(() => {
    /* Pre-filter neighborhoods based on onboarding borough pick */
    return {
      neighborhoods: [],
      budgetId: '',
      vibeId: '',
      dateTypeId: '',
      date: '',
      startTime: initStart,
      endTime: defaultEndTime(initStart),
    };
  });
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentStep = FLOW_STEPS[step];

  /* Only show the borough chosen in onboarding (or both) */
  const visibleHoods = (() => {
    const boro = userPrefs?.borough;
    if (boro === 'manhattan') return { manhattan: NEIGHBORHOODS.manhattan };
    if (boro === 'brooklyn') return { brooklyn: NEIGHBORHOODS.brooklyn };
    return NEIGHBORHOODS;
  })();

  const canProceed = () => {
    switch (currentStep) {
      case 'where':
        return selections.neighborhoods.length > 0;
      case 'details':
        return !!selections.budgetId && !!selections.vibeId && !!selections.dateTypeId;
      case 'when':
        return (
          !!selections.date &&
          !!selections.startTime &&
          !!selections.endTime &&
          selections.endTime > selections.startTime
        );
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (step < FLOW_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      await generateItinerary();
    }
  };

  const handleBack = () => {
    if (itinerary) {
      setItinerary(null);
      return;
    }
    if (step > 0) setStep(step - 1);
    else onBack();
  };

  const toggleNeighborhood = (id) => {
    setSelections((prev) => {
      const cur = prev.neighborhoods;
      if (cur.includes(id)) return { ...prev, neighborhoods: cur.filter((n) => n !== id) };
      if (cur.length >= 3) return prev;
      return { ...prev, neighborhoods: [...cur, id] };
    });
  };

  const generateItinerary = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/itinerary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          neighborhoods: selections.neighborhoods,
          vibeId: selections.vibeId,
          budgetId: selections.budgetId,
          dateTypeId: selections.dateTypeId,
          date: selections.date,
          startTime: selections.startTime,
          endTime: selections.endTime,
          /* Onboarding prefs passed through so the engine can bias results */
          onboarding: userPrefs
            ? {
                borough: userPrefs.borough,
                vibes: userPrefs.vibes,
                diet: userPrefs.diet,
                seeds: userPrefs.seeds,
              }
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        return;
      }
      setItinerary(data);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  /* "The date is going well, add a stop" — anchor on the last place in
     the current itinerary and ask the API for one more spot. On success,
     we merge the new stop into the existing itinerary in local state so
     the user can decide whether to save the updated plan. */
  const handleAddStop = async (desiredCategory = null) => {
    if (!itinerary?.itinerary?.stops?.length) return;
    const stops = itinerary.itinerary.stops;
    const last = stops[stops.length - 1];
    if (!last?.place?.lat || !last?.place?.lng) {
      setError("Can't extend this itinerary — the last stop has no location.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/itinerary/add-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastStop: {
            order: last.order,
            leaveAt: last.leaveAt,
            place: {
              lat: last.place.lat,
              lng: last.place.lng,
              name: last.place.name,
              category: last.place.category,
            },
          },
          vibeId: selections.vibeId,
          budgetId: selections.budgetId,
          dateTypeId: selections.dateTypeId,
          date: selections.date,
          desiredCategory,
          existingStopNames: stops.map((s) => s.place?.name).filter(Boolean),
          badWeather: !!itinerary?.itinerary?.walkingConstraint?.badWeather,
          partySize: userPrefs?.partySize || 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not add another stop.');
        return;
      }
      const newStop = data.stop;
      setItinerary((prev) => {
        if (!prev?.itinerary) return prev;
        const updatedStops = [...prev.itinerary.stops, newStop];
        return {
          ...prev,
          itinerary: {
            ...prev.itinerary,
            stops: updatedStops,
            totalStops: updatedStops.length,
            endTime: newStop.leaveAt,
            truncatedForEndTime: false,
          },
        };
      });
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  if (itinerary) {
    const vibeEmoji = VIBES.find((v) => v.id === selections.vibeId)?.emoji || '✨';
    return (
      <ItineraryView
        itinerary={itinerary.itinerary}
        meta={itinerary.meta}
        userName={userName}
        onBack={handleBack}
        onSave={() => onSavePlan({ ...itinerary, vibeEmoji })}
        onRegenerate={generateItinerary}
        onAddStop={handleAddStop}
        addStopLoading={loading}
        addStopError={error}
      />
    );
  }

  const upcomingDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      date: d.toISOString().split('T')[0],
      dayName:
        i === 0
          ? 'Today'
          : i === 1
          ? 'Tomorrow'
          : d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      month: d.toLocaleDateString('en-US', { month: 'short' }),
    };
  });

  return (
    <div className="h-[100dvh] flex flex-col bg-white relative">
      {/* Header with progress bar */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-2">
        <button
          onClick={handleBack}
          className="w-10 h-10 -ml-2 rounded-full hover:bg-gray-100 flex items-center justify-center text-2xl"
        >
          ‹
        </button>
        <div className="flex gap-1.5 flex-1">
          {FLOW_STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-all"
              style={{ background: i <= step ? 'var(--mango)' : '#e5e5e5' }}
            />
          ))}
        </div>
        <span className="text-xs text-[var(--muted)] font-medium tabular-nums">
          {step + 1}/{FLOW_STEPS.length}
        </span>
      </div>

      {/* Step content */}
      <div className="flex-1 px-6 pt-6 overflow-y-auto pb-6 no-scrollbar">
        {currentStep === 'where' && (
          <div>
            <h1 className="h1-display">Where to?</h1>
            <p className="sub mt-2 mb-6">Pick up to 3 neighborhoods.</p>

            {visibleHoods.manhattan && (
              <>
                <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
                  Manhattan
                </h3>
                <div className="flex flex-wrap gap-2 mb-5">
                  {visibleHoods.manhattan.map((hood) => (
                    <button
                      key={hood.id}
                      onClick={() => toggleNeighborhood(hood.id)}
                      className={`chip ${
                        selections.neighborhoods.includes(hood.id) ? 'selected' : ''
                      }`}
                    >
                      {hood.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {visibleHoods.brooklyn && (
              <>
                <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
                  Brooklyn
                </h3>
                <div className="flex flex-wrap gap-2">
                  {visibleHoods.brooklyn.map((hood) => (
                    <button
                      key={hood.id}
                      onClick={() => toggleNeighborhood(hood.id)}
                      className={`chip ${
                        selections.neighborhoods.includes(hood.id) ? 'selected' : ''
                      }`}
                    >
                      {hood.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {currentStep === 'details' && (
          <div>
            <h1 className="h1-display">What kind of date?</h1>
            <p className="sub mt-2 mb-6">Tell us the shape of the night.</p>

            <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
              Occasion
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {DATE_TYPES.map((dt) => (
                <button
                  key={dt.id}
                  onClick={() => setSelections((p) => ({ ...p, dateTypeId: dt.id }))}
                  className={`selection-card flex items-center gap-2 p-3 rounded-2xl border-1.5 border border-gray-200 text-left ${
                    selections.dateTypeId === dt.id ? 'selected' : ''
                  }`}
                >
                  <span className="text-xl shrink-0">{dt.emoji}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm leading-tight">{dt.name}</div>
                  </div>
                </button>
              ))}
            </div>

            <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
              Vibe
            </h3>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {VIBES.map((vibe) => (
                <button
                  key={vibe.id}
                  onClick={() => setSelections((p) => ({ ...p, vibeId: vibe.id }))}
                  className={`selection-card p-3 rounded-2xl border border-gray-200 text-center ${
                    selections.vibeId === vibe.id ? 'selected' : ''
                  }`}
                >
                  <span className="text-2xl block mb-1">{vibe.emoji}</span>
                  <div className="font-semibold text-[11px] leading-tight">{vibe.name}</div>
                </button>
              ))}
            </div>

            <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
              Budget
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {BUDGET_TIERS.map((tier) => (
                <button
                  key={tier.id}
                  onClick={() => setSelections((p) => ({ ...p, budgetId: tier.id }))}
                  className={`selection-card flex items-center gap-2 p-3 rounded-2xl border border-gray-200 text-left ${
                    selections.budgetId === tier.id ? 'selected' : ''
                  }`}
                >
                  <span className="text-xl shrink-0">{tier.emoji}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm leading-tight">{tier.name}</div>
                    <div className="text-[11px] text-[var(--muted)] leading-tight mt-0.5">
                      {tier.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {currentStep === 'when' && (
          <div>
            <h1 className="h1-display">When?</h1>
            <p className="sub mt-2 mb-6">Pick a day and set your window.</p>

            <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
              Day
            </h3>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {upcomingDays.map((day) => (
                <button
                  key={day.date}
                  onClick={() => setSelections((p) => ({ ...p, date: day.date }))}
                  className={`selection-card p-2 rounded-2xl border border-gray-200 text-center ${
                    selections.date === day.date ? 'selected' : ''
                  }`}
                >
                  <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">
                    {day.dayName}
                  </div>
                  <div className="text-lg font-bold mt-0.5">{day.dayNum}</div>
                  <div className="text-[10px] text-[var(--muted)]">{day.month}</div>
                </button>
              ))}
            </div>

            <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
              Time window
            </h3>
            <div className="flex items-center justify-center gap-6">
              <TimeWheel
                label="Start"
                value={selections.startTime}
                onChange={(t) => {
                  setSelections((p) => {
                    let newEnd = p.endTime;
                    if (t >= p.endTime) {
                      const [h, m] = t.split(':').map(Number);
                      const end = h * 60 + m + 120;
                      const eh = Math.floor(end / 60) % 24;
                      const em = end % 60;
                      newEnd = `${String(eh).padStart(2, '0')}:${String(em).padStart(
                        2,
                        '0'
                      )}`;
                    }
                    return { ...p, startTime: t, endTime: newEnd };
                  });
                }}
              />
              <span className="text-[var(--muted)] text-xl font-light mt-6">→</span>
              <TimeWheel
                label="End"
                value={selections.endTime}
                onChange={(t) => setSelections((p) => ({ ...p, endTime: t }))}
                minTime={selections.startTime}
              />
            </div>

            {selections.startTime &&
              selections.endTime &&
              selections.endTime > selections.startTime && (
                <div className="text-center mt-6">
                  <span
                    className="inline-block px-4 py-2 rounded-full text-sm font-medium"
                    style={{
                      background: 'var(--mango-soft)',
                      color: 'var(--mango-dark)',
                    }}
                  >
                    {(() => {
                      const [sh, sm] = selections.startTime.split(':').map(Number);
                      const [eh, em] = selections.endTime.split(':').map(Number);
                      const diff = eh * 60 + em - (sh * 60 + sm);
                      const hrs = Math.floor(diff / 60);
                      const mins = diff % 60;
                      return `${hrs > 0 ? `${hrs}h` : ''}${mins > 0 ? ` ${mins}m` : ''} date`;
                    })()}
                  </span>
                </div>
              )}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-2xl text-sm">{error}</div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="shrink-0 px-6 pb-8 pt-4 border-t border-gray-100 bg-white">
        <button
          onClick={handleNext}
          disabled={!canProceed() || loading}
          className="btn-primary"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Building your date...
            </>
          ) : step === FLOW_STEPS.length - 1 ? (
            'Build my date plan'
          ) : (
            <>Next →</>
          )}
        </button>
      </div>
    </div>
  );
}
