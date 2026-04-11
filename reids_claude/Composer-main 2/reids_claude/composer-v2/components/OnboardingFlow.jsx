'use client';

import { useState, useRef, useEffect } from 'react';

/* ─── Static onboarding data ─────────────────────────────── */
const BOROUGH_OPTIONS = [
  {
    id: 'manhattan',
    emoji: '🌆',
    label: 'Manhattan',
    meta: 'Below 96th — LES, Village, Chelsea, UES/UWS',
  },
  {
    id: 'brooklyn',
    emoji: '🌉',
    label: 'Brooklyn',
    meta: 'Williamsburg, DUMBO, Park Slope, Bed-Stuy',
  },
  {
    id: 'both',
    emoji: '🗽',
    label: 'Both, I get around',
    meta: 'Show me the best of each',
  },
];

const VIBE_OPTIONS = [
  'Active & outdoors',
  'Artsy & creative',
  'Casual & chill',
  "Chef's tasting",
  'Classy night out',
  'Cozy & intimate',
  'Culture & shows',
  'Fun & spontaneous',
  'Hidden gems',
  'Late-night',
  'Live music',
  'Old-school romantic',
  'Rooftop & views',
  'Wild & adventurous',
];

const DIET_OPTIONS = [
  'Dairy Allergy',
  'Gluten Free',
  'Halal',
  'Kosher',
  'Lactose Intolerant',
  'No Beef',
  'No Pork',
  'No Red Meat',
  'Nut Allergy',
  'Paleo',
  'Peanut Allergy',
  'Pescatarian',
  'Shellfish Allergy',
  'Soy Allergy',
  'Vegan',
  'Vegetarian',
];

const SEED_SPOTS = [
  { id: 'via-carota', emoji: '🍝', title: 'Via Carota', meta: 'Restaurant · $$$ · West Village' },
  { id: 'the-met', emoji: '🖼️', title: 'The Met', meta: 'Museum · Pay-what-you-wish · UES' },
  { id: 'brooklyn-bridge', emoji: '🚶', title: 'Brooklyn Bridge walk', meta: 'Walk · Free · DUMBO → FiDi' },
  { id: 'dante', emoji: '🍸', title: 'Dante', meta: 'Bar · $$$ · Greenwich Village' },
  { id: 'comedy-cellar', emoji: '🎭', title: 'Comedy Cellar', meta: 'Show · $$ · MacDougal St' },
  { id: 'whitney', emoji: '🖼️', title: 'The Whitney', meta: 'Museum · $$ · Meatpacking' },
  { id: 'high-line', emoji: '🌳', title: 'The High Line', meta: 'Walk · Free · Chelsea' },
  { id: 'village-vanguard', emoji: '🎷', title: 'Village Vanguard', meta: 'Jazz show · $$ · West Village' },
  { id: 'lilia', emoji: '🍝', title: 'Lilia', meta: 'Restaurant · $$$ · Williamsburg' },
  { id: 'angelika', emoji: '🎬', title: 'Angelika Film Center', meta: 'Indie cinema · $$ · SoHo' },
  { id: 'bb-park', emoji: '🌉', title: 'Brooklyn Bridge Park', meta: 'Park · Free · DUMBO' },
  { id: 'mcsorleys', emoji: '🍺', title: "McSorley's Old Ale House", meta: 'Historic bar · $ · East Village' },
];

/* The 13 screens in order. indices match mockup: 0-2 splash, 3 name,
   4 phone, 5 verify, 6 email, 7 borough, 8 vibes, 9 dietary,
   10 seeds, 11 success, 12 done (triggers onComplete). */
const SCREENS = [
  'splash-plan',
  'splash-discover',
  'splash-date',
  'name',
  'phone',
  'verify',
  'email',
  'borough',
  'vibes',
  'dietary',
  'seeds',
  'success',
];

export default function OnboardingFlow({ onComplete }) {
  const [cur, setCur] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [email, setEmail] = useState('');
  const [borough, setBorough] = useState('');
  const [vibes, setVibes] = useState(new Set());
  const [diet, setDiet] = useState(new Set());
  const [seeds, setSeeds] = useState(new Set());

  const codeRefs = useRef([]);
  const currentScreen = SCREENS[cur];

  const next = () => setCur((c) => Math.min(c + 1, SCREENS.length));
  const prev = () => setCur((c) => Math.max(c - 1, 0));
  const jumpTo = (i) => setCur(i);

  /* Finish and hand preferences up */
  useEffect(() => {
    if (cur >= SCREENS.length) {
      onComplete({
        name: name.trim() || 'friend',
        phone,
        email,
        borough,
        vibes: Array.from(vibes),
        diet: Array.from(diet),
        seeds: Array.from(seeds),
      });
    }
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSet = (setState, current) => (item) => {
    setState((prev) => {
      const n = new Set(prev);
      if (n.has(item)) n.delete(item);
      else n.add(item);
      return n;
    });
  };
  const toggleVibe = toggleSet(setVibes, vibes);
  const toggleDiet = toggleSet(setDiet, diet);
  const toggleSeed = toggleSet(setSeeds, seeds);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const cleanPhone = phone.replace(/\D/g, '');
  const validPhone = cleanPhone.length >= 10;
  const codeJoined = code.join('');
  const validCode = codeJoined.length === 6; // Mocked: any 6 digits accepted

  const handleCodeChange = (i, val) => {
    const v = val.replace(/\D/g, '').slice(0, 1);
    const nextCode = [...code];
    nextCode[i] = v;
    setCode(nextCode);
    if (v && i < 5) codeRefs.current[i + 1]?.focus();
  };
  const handleCodeKey = (i, e) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      codeRefs.current[i - 1]?.focus();
    }
  };

  /* ─── Render a specific screen ──────────────────────────── */
  const renderScreen = () => {
    switch (currentScreen) {
      case 'splash-plan':
      case 'splash-discover':
      case 'splash-date':
        return renderSplash(currentScreen);

      case 'name':
        return (
          <div className="flex flex-col h-full pt-16">
            <BackBtn onClick={prev} />
            <h1 className="h1-display mt-6">What&apos;s your name?</h1>
            <p className="sub mt-3 mb-6">We&apos;ll use this on your plans and invites.</p>
            <input
              autoFocus
              className="field-input"
              placeholder="First name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim().length >= 2 && next()}
            />
            <div className="flex-1" />
            <button
              className="btn-primary"
              disabled={name.trim().length < 2}
              onClick={next}
            >
              Continue
            </button>
          </div>
        );

      case 'phone':
        return (
          <div className="flex flex-col h-full pt-16">
            <BackBtn onClick={prev} />
            <h1 className="h1-display mt-6">What&apos;s your number?</h1>
            <p className="sub mt-3 mb-6">
              We&apos;ll text you a code to confirm it&apos;s you. No spam, ever.
            </p>
            <div className="flex items-end gap-3">
              <div className="pb-3 text-[22px] font-medium text-[var(--muted)]">🇺🇸 +1</div>
              <input
                autoFocus
                type="tel"
                className="field-input flex-1"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <p className="text-xs text-[var(--muted)] mt-4 leading-relaxed">
              By continuing, you agree to Composer&apos;s Terms &amp; Privacy Policy. Standard SMS
              rates may apply.
            </p>
            <div className="flex-1" />
            <button className="btn-primary" disabled={!validPhone} onClick={next}>
              Send code
            </button>
          </div>
        );

      case 'verify':
        return (
          <div className="flex flex-col h-full pt-16">
            <BackBtn onClick={prev} />
            <h1 className="h1-display mt-6">Enter the code</h1>
            <p className="sub mt-3 mb-6">
              We sent a 6-digit code to{' '}
              <span className="text-[var(--ink)] font-medium">+1 {phone || 'your phone'}</span>.
              <br />
              <span className="text-xs italic">(Demo: enter any 6 digits.)</span>
            </p>
            <div className="flex gap-2 justify-between">
              {code.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (codeRefs.current[i] = el)}
                  maxLength={1}
                  inputMode="numeric"
                  className={`code-box ${d ? 'filled' : ''}`}
                  value={d}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKey(i, e)}
                />
              ))}
            </div>
            <div className="text-sm text-[var(--muted)] mt-5">
              Didn&apos;t get it?{' '}
              <button
                type="button"
                className="text-[var(--mango)] font-semibold"
                onClick={() => setCode(['', '', '', '', '', ''])}
              >
                Resend
              </button>
            </div>
            <div className="flex-1" />
            <button className="btn-primary" disabled={!validCode} onClick={next}>
              Verify
            </button>
          </div>
        );

      case 'email':
        return (
          <div className="flex flex-col h-full pt-16">
            <BackBtn onClick={prev} />
            <h1 className="h1-display mt-6">What&apos;s your email?</h1>
            <p className="sub mt-3 mb-6">For reservation confirmations and your date recaps.</p>
            <input
              autoFocus
              type="email"
              className="field-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && validEmail && next()}
            />
            <p className="text-xs text-[var(--muted)] mt-4 leading-relaxed">
              We&apos;ll never share it. You can unsubscribe from anything non-essential in
              Settings.
            </p>
            <div className="flex-1" />
            <button className="btn-primary" disabled={!validEmail} onClick={next}>
              Continue
            </button>
          </div>
        );

      case 'borough':
        return (
          <div className="flex flex-col h-full pt-16">
            <BackBtn onClick={prev} />
            <h1 className="h1-display mt-6">Where do you usually date?</h1>
            <p className="sub mt-3 mb-6">We&apos;ll surface spots close to your side of town.</p>
            <div className="flex flex-col gap-3">
              {BOROUGH_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`card-option ${borough === opt.id ? 'selected' : ''}`}
                  onClick={() => setBorough(opt.id)}
                >
                  <div className="text-3xl">{opt.emoji}</div>
                  <div>
                    <div className="title">{opt.label}</div>
                    <div className="meta">{opt.meta}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button className="btn-primary" disabled={!borough} onClick={next}>
              Continue
            </button>
          </div>
        );

      case 'vibes':
        return (
          <div className="flex flex-col h-full pt-16">
            <BackBtn onClick={prev} />
            <h1 className="h1-display mt-6 mb-4">Your go-to date vibes?</h1>
            <div className="list-scroll">
              {VIBE_OPTIONS.map((v) => {
                const sel = vibes.has(v);
                return (
                  <div
                    key={v}
                    className={`list-row ${sel ? 'selected' : ''}`}
                    onClick={() => toggleVibe(v)}
                  >
                    <span>{v}</span>
                    <span className="check">{sel ? '✓' : '◦'}</span>
                  </div>
                );
              })}
            </div>
            <button
              className="btn-primary"
              disabled={vibes.size === 0}
              onClick={next}
            >
              {vibes.size === 0 ? 'Pick at least one' : `Continue with ${vibes.size}`}
            </button>
          </div>
        );

      case 'dietary':
        return (
          <div className="flex flex-col h-full pt-16">
            <BackBtn onClick={prev} />
            <h1 className="h1-display mt-6 mb-4">Any dietary restrictions?</h1>
            <div className="list-scroll">
              {DIET_OPTIONS.map((d) => {
                const sel = diet.has(d);
                return (
                  <div
                    key={d}
                    className={`list-row ${sel ? 'selected' : ''}`}
                    onClick={() => toggleDiet(d)}
                  >
                    <span>{d}</span>
                    <span className="check">{sel ? '✓' : '◦'}</span>
                  </div>
                );
              })}
            </div>
            <button className="btn-primary" onClick={next}>
              {diet.size === 0 ? 'Nope' : `Continue with ${diet.size}`}
            </button>
          </div>
        );

      case 'seeds':
        return (
          <div className="flex flex-col h-full pt-16">
            <BackBtn onClick={prev} />
            <h1 className="h1-display mt-6">Pick 3 places you&apos;d bring a date.</h1>
            <p className="sub mt-3 mb-4">
              Restaurants, museums, walks — whatever&apos;s your move. This teaches us your taste.
            </p>
            <div className="flex flex-col gap-2 overflow-y-auto flex-1 -mx-2 px-2 no-scrollbar">
              {SEED_SPOTS.map((spot) => {
                const sel = seeds.has(spot.id);
                return (
                  <button
                    key={spot.id}
                    type="button"
                    className={`card-option ${sel ? 'selected' : ''}`}
                    onClick={() => toggleSeed(spot.id)}
                  >
                    <div className="text-2xl">{spot.emoji}</div>
                    <div>
                      <div className="title">{spot.title}</div>
                      <div className="meta">{spot.meta}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              className="btn-primary mt-3"
              disabled={seeds.size < 3}
              onClick={next}
            >
              {seeds.size < 3
                ? seeds.size === 0
                  ? 'Pick 3 to continue'
                  : `Pick ${3 - seeds.size} more`
                : `Continue with ${seeds.size}`}
            </button>
          </div>
        );

      case 'success':
        return (
          <div className="flex flex-col h-full items-center text-center pt-28">
            <div className="w-24 h-24 rounded-full bg-[var(--mango)] flex items-center justify-center text-5xl mb-6">
              ✨
            </div>
            <h1 className="h1-display">
              You&apos;re set, {name.trim() || 'friend'}.
            </h1>
            <p className="sub px-4 mt-3">Let&apos;s plan your first date.</p>
            <div className="flex-1" />
            <button className="btn-primary w-full" onClick={next}>
              Plan my first date
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  /* Splash screens (0/1/2) */
  function renderSplash(kind) {
    const active = kind === 'splash-plan' ? 0 : kind === 'splash-discover' ? 1 : 2;
    const title =
      kind === 'splash-plan' ? 'Plan' : kind === 'splash-discover' ? 'Discover' : 'Date';
    const subtitle =
      kind === 'splash-plan'
        ? 'A time, a place, a whole night — in under a minute.'
        : kind === 'splash-discover'
        ? 'Restaurants, museums, walks, shows — curated across Manhattan & Brooklyn.'
        : 'From idea to itinerary to "see you at 7" in one tap.';
    return (
      <div className="flex flex-col h-full relative">
        <MapBg variant={active} />
        <div className="relative z-10 flex flex-col h-full justify-end pb-4">
          <div className="text-center mb-6 px-4">
            <div className="eyebrow mb-2">COMPOSER</div>
            <h1 className="h1-splash">{title}</h1>
            <p className="sub mt-3">{subtitle}</p>
          </div>
          <div className="flex justify-center gap-2 mb-5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`dot ${i === active ? 'active' : ''}`}
                onClick={() => jumpTo(i)}
              />
            ))}
          </div>
          <button className="btn-primary" onClick={() => jumpTo(3)}>
            Get started
          </button>
          <button className="btn-ghost mt-1" onClick={() => jumpTo(3)}>
            Already have an account?{' '}
            <span className="font-semibold text-[var(--mango)]">Log in</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] h-[100dvh] px-6 pb-6 bg-white overflow-hidden">
      {renderScreen()}
    </div>
  );
}

/* ─── Small helpers ──────────────────────────────────────── */
function BackBtn({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="back-btn">
      <span className="text-2xl leading-none -mt-0.5">‹</span>
    </button>
  );
}

function MapBg({ variant = 0 }) {
  return (
    <div className="map-bg">
      <svg viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`water-${variant}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#c9d9e8" />
            <stop offset="1" stopColor="#dde8f0" />
          </linearGradient>
        </defs>
        <rect width="430" height="900" fill="#f1ece2" />
        <path
          d="M 0 0 L 70 0 L 90 180 L 60 340 L 110 520 L 80 700 L 40 900 L 0 900 Z"
          fill={`url(#water-${variant})`}
        />
        <path
          d="M 330 0 L 430 0 L 430 900 L 380 900 L 360 720 L 400 540 L 350 360 L 380 180 Z"
          fill={`url(#water-${variant})`}
        />
        <g stroke="#d8ccb4" strokeWidth="1.5" fill="none">
          <path d="M 100 50 L 100 860" />
          <path d="M 160 30 L 170 870" />
          <path d="M 220 20 L 235 880" />
          <path d="M 280 40 L 295 870" />
          <path d="M 100 140 L 320 160" />
          <path d="M 90 260 L 310 280" />
          <path d="M 95 380 L 320 400" />
          <path d="M 90 500 L 310 520" />
        </g>
      </svg>
      <div className="absolute inset-0 text-xl">
        {[
          { l: '38%', t: '14%', e: '🍷' },
          { l: '52%', t: '19%', e: '🖼️' },
          { l: '28%', t: '24%', e: '🍝' },
          { l: '58%', t: '28%', e: '🚶' },
          { l: '34%', t: '34%', e: '🎭' },
          { l: '48%', t: '38%', e: '🍱' },
          { l: '24%', t: '42%', e: '🌉' },
          { l: '56%', t: '46%', e: '🎷' },
          { l: '40%', t: '50%', e: '🍸' },
          { l: '30%', t: '56%', e: '🌳' },
        ].map((p, i) => (
          <div key={i} className="absolute" style={{ left: p.l, top: p.t }}>
            {p.e}
          </div>
        ))}
      </div>
    </div>
  );
}
