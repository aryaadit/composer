import { NextResponse } from 'next/server';
import { CURATED_VENUES } from '@/lib/constants';

/**
 * GET /api/events?date=2026-04-12&vibes=fun,creative&neighborhood=greenwich
 *
 * Returns curated events/venues that match the filters.
 * For MVP, this pulls from the static CURATED_VENUES list.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const vibesParam = searchParams.get('vibes');
    const neighborhood = searchParams.get('neighborhood');
    const type = searchParams.get('type');

    const vibes = vibesParam ? vibesParam.split(',') : [];

    let filtered = [...CURATED_VENUES];

    if (vibes.length > 0) {
      filtered = filtered.filter((venue) =>
        venue.vibes.some((v) => vibes.includes(v))
      );
    }

    if (neighborhood) {
      filtered = filtered.filter((venue) => venue.neighborhood === neighborhood);
    }

    if (type) {
      filtered = filtered.filter((venue) => venue.type === type);
    }

    const events = filtered.map((venue) => ({
      id: venue.id,
      name: venue.name,
      address: venue.address,
      category: venue.type,
      vibes: venue.vibes,
      priceRange: venue.priceRange,
      bookingUrl: venue.bookingUrl,
      website: venue.website,
      source: 'curated',
      availableSlots: date ? generateMockSlots(venue, date) : [],
    }));

    return NextResponse.json({ events, total: events.length });
  } catch (error) {
    console.error('Events fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate mock availability slots for MVP.
 * Replace with real scraping/API calls in production.
 */
function generateMockSlots(venue, date) {
  const dayOfWeek = new Date(date).getDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

  if (venue.type === 'comedy') {
    const slots = [
      { time: '19:30', label: '7:30 PM Show', available: true },
      { time: '21:30', label: '9:30 PM Show', available: true },
    ];
    if (isWeekend) {
      slots.push({ time: '23:30', label: '11:30 PM Show', available: true });
    }
    return slots;
  }

  if (venue.type === 'jazz') {
    return [
      { time: '20:00', label: '8:00 PM Set', available: true },
      { time: '22:00', label: '10:00 PM Set', available: true },
    ];
  }

  if (venue.type === 'music_venue') {
    return [
      { time: '19:00', label: 'Evening Show', available: true },
    ];
  }

  if (venue.type === 'immersive_theater') {
    return [
      { time: '19:00', label: '7:00 PM Entry', available: isWeekend },
      { time: '21:00', label: '9:00 PM Entry', available: true },
    ];
  }

  if (venue.type === 'food_market') {
    return isWeekend
      ? [{ time: '11:00', label: '11 AM – 6 PM', available: true }]
      : [];
  }

  return [];
}
