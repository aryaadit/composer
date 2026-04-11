import { NextResponse } from 'next/server';

const RESY_API_KEY = process.env.RESY_API_KEY;

/**
 * POST /api/availability/resy
 *
 * Check restaurant availability via Resy's API.
 *
 * Body: {
 *   venueId: string,
 *   restaurantName: string,
 *   date: string,          // "2026-04-12"
 *   partySize: number,     // default 2
 *   lat: number,
 *   lng: number,
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      venueId,
      restaurantName,
      date,
      partySize = 2,
      lat,
      lng,
    } = body;

    if (!date) {
      return NextResponse.json(
        { error: 'date is required' },
        { status: 400 }
      );
    }

    // If we have a Resy API key and venue ID, make the real call
    if (RESY_API_KEY && venueId) {
      try {
        const resyUrl = `https://api.resy.com/4/find?lat=${lat || 40.7128}&long=${lng || -74.006}&day=${date}&party_size=${partySize}&venue_id=${venueId}`;

        const response = await fetch(resyUrl, {
          headers: {
            Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
            'X-Resy-Auth-Token': process.env.RESY_AUTH_TOKEN || '',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const slots = data.results?.venues?.[0]?.slots || [];
          return NextResponse.json({
            available: slots.length > 0,
            slots: slots.map((s) => ({
              time: s.date?.start,
              type: s.config?.type,
            })),
            bookingUrl: `https://resy.com/cities/ny/${restaurantName?.toLowerCase().replace(/\s+/g, '-')}`,
            source: 'resy',
          });
        }
      } catch (resyError) {
        console.error('Resy API error:', resyError);
      }
    }

    // Fallback: return booking URL for manual check
    const slug = (restaurantName || 'restaurant').toLowerCase().replace(/\s+/g, '-');
    return NextResponse.json({
      available: null,
      slots: [],
      bookingUrl: `https://resy.com/cities/ny/${slug}`,
      source: 'resy',
      note: 'Real-time availability requires Resy API key. Booking URL provided for manual verification.',
    });
  } catch (error) {
    console.error('Resy availability error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
