import { NextResponse } from 'next/server';

/**
 * POST /api/availability/opentable
 *
 * Check restaurant availability via OpenTable.
 *
 * Body: {
 *   restaurantName: string,
 *   date: string,        // "2026-04-12"
 *   time: string,        // "19:00"
 *   partySize: number,   // default 2
 *   lat: number,
 *   lng: number,
 * }
 *
 * NOTE: OpenTable doesn't have an official public API.
 * For production, become an OpenTable affiliate partner.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      restaurantName,
      date,
      time,
      partySize = 2,
      lat,
      lng,
    } = body;

    if (!restaurantName || !date || !time) {
      return NextResponse.json(
        { error: 'restaurantName, date, and time are required' },
        { status: 400 }
      );
    }

    // For MVP, return the OpenTable search/booking URL
    return NextResponse.json({
      available: null,
      bookingUrl: `https://www.opentable.com/s?term=${encodeURIComponent(restaurantName)}&dateTime=${date}T${time}&covers=${partySize}`,
      source: 'opentable',
      note: 'Direct availability check requires OpenTable partner API. Booking URL provided for manual verification.',
    });
  } catch (error) {
    console.error('OpenTable availability error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
