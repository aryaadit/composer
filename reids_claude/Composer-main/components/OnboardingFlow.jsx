'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { NEIGHBORHOODS } from '@/lib/constants';

const CONTEXT_OPTIONS = [
  { id: 'new', label: 'Someone new', emoji: '👋', description: 'Planning a first impression' },
  { id: 'partner', label: 'My partner', emoji: '❤️', description: 'Keeping the spark alive' },
  { id: 'special', label: 'Something special', emoji: '🎁', description: 'An occasion worth planning' },
  { id: 'exploring', label: 'Just exploring', emoji: '🗺️', description: 'See what\'s out there' },
];

const DRINK_OPTIONS = [
  { id: 'yes', label: 'Yes', emoji: '🍷' },
  { id: 'sometimes', label: 'Sometimes', emoji: '🍺' },
  { id: 'no', label: 'No', emoji: '☕' },
];

const DIETARY_OPTIONS = [
  { id: 'none', label: 'No restrictions' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'halal', label: 'Halal' },
  { id: 'kosher', label: 'Kosher' },
  { id: 'gluten-free', label: 'Gluten-free' },
];

export default function OnboardingFlow({ onComplete }) {
  const [step, setStep] = useState(0); // 0 = name, 1 = context, 2 = preferences, 3 = neighborhoods
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [drinks, setDrinks] = useState('');
  const [dietary, setDietary] = useState([]);
  const [favoriteHoods, setFavoriteHoods] = useState([]);

  const totalSteps = 4;

  const handleNext = () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    }
  };

  const handleFinish = () => {
    onComplete({
      name: name.trim() || 'Friend',
      context,
      drinks,
      dietary,
      favoriteNeighborhoods: favoriteHoods,
    });
  };

  const toggleHood = (id) => {
    setFavoriteHoods((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  };

  const toggleDietary = (id) => {
    if (id === 'none') {
      setDietary((prev) => (prev.includes('none') ? [] : ['none']));
    } else {
      setDietary((prev) => {
        const without = prev.filter((d) => d !== 'none');
        return without.includes(id) ? without.filter((d) => d !== id) : [...without, id];
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pt-12 pb-4 px-6">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`progress-dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
          />
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col"
          >
            {/* Name input (step 0) */}
            {step === 0 && (
              <div className="flex-1 flex flex-col justify-center">
                <h1 className="text-2xl font-bold font-display mb-2">What should we call you?</h1>
                <p className="text-gray-500 mb-8">
                  We&apos;ll use this to personalize your text messages.
                </p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your first name"
                  className="w-full px-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-orange-400 focus:outline-none transition-colors"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && name.trim() && handleNext()}
                />
              </div>
            )}

            {/* Context / what brings you here (step 1) */}
            {step === 1 && (
              <div className="flex-1 flex flex-col justify-center">
                <h1 className="text-2xl font-bold font-display mb-2">What brings you here?</h1>
                <p className="text-gray-500 mb-8">This helps us tailor your recommendations.</p>
                <div className="grid grid-cols-1 gap-3">
                  {CONTEXT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setContext(opt.id)}
                      className={`selection-card flex items-center gap-4 p-4 rounded-xl border-2 text-left ${
                        context === opt.id
                          ? 'selected'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <div>
                        <div className="font-semibold">{opt.label}</div>
                        <div className="text-sm text-gray-500">{opt.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preferences — drinks & dietary (step 2) */}
            {step === 2 && (
              <div className="flex-1 flex flex-col pt-4">
                <h1 className="text-2xl font-bold font-display mb-1">A couple quick things</h1>
                <p className="text-gray-500 mb-8">
                  So we don&apos;t recommend anything that&apos;s not your style.
                </p>

                <div className="mb-8">
                  <h3 className="font-semibold mb-3">Do you drink?</h3>
                  <div className="flex gap-3">
                    {DRINK_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setDrinks(opt.id)}
                        className={`chip flex-1 justify-center py-3 ${drinks === opt.id ? 'selected' : ''}`}
                      >
                        {opt.emoji} {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Any dietary restrictions?</h3>
                  <div className="flex flex-wrap gap-2">
                    {DIETARY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => toggleDietary(opt.id)}
                        className={`chip ${dietary.includes(opt.id) ? 'selected' : ''}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Favorite neighborhoods (step 3) */}
            {step === 3 && (
              <div className="flex-1 flex flex-col pt-4">
                <h1 className="text-2xl font-bold font-display mb-2">
                  Favorite neighborhoods?
                </h1>
                <p className="text-gray-500 mb-6">
                  Optional — pick a few you love or skip this.
                </p>

                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Manhattan
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {NEIGHBORHOODS.manhattan.map((hood) => (
                      <button
                        key={hood.id}
                        onClick={() => toggleHood(hood.id)}
                        className={`chip ${favoriteHoods.includes(hood.id) ? 'selected' : ''}`}
                      >
                        {hood.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Brooklyn
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {NEIGHBORHOODS.brooklyn.map((hood) => (
                      <button
                        key={hood.id}
                        onClick={() => toggleHood(hood.id)}
                        className={`chip ${favoriteHoods.includes(hood.id) ? 'selected' : ''}`}
                      >
                        {hood.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom action area */}
      <div className="px-6 pb-10 pt-4">
        {step < 3 ? (
          <button
            onClick={handleNext}
            disabled={step === 0 && !name.trim()}
            className="w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--brand-primary)' }}
          >
            Next
            <ArrowRight size={18} />
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={handleFinish}
              className="flex-1 py-4 rounded-xl font-semibold text-gray-600 border-2 border-gray-200"
            >
              Skip
            </button>
            <button
              onClick={handleFinish}
              className="flex-1 py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: 'var(--brand-primary)' }}
            >
              <Sparkles size={18} />
              Let&apos;s go
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
