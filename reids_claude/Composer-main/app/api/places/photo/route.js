import { NextResponse } from 'next/server';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

/**
 * GET /api/places/photo?ref=PHOTO_REFERENCE&maxWidth=400
 *
 * Proxy for Google Places photos — keeps API key server-side.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const photoRef = searchParams.get('ref');
    const maxWidth = searchParams.get('maxWidth') || '400';
    const maxHeight = searchParams.get('maxHeight') || '300';

    if (!photoRef) {
      return NextResponse.json({ error: 'Photo reference required' }, { status: 400 });
    }

    if (!GOOGLE_PLACES_API_KEY) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Google Places (New) photo URL format
    const photoUrl = `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=${maxWidth}&maxHeightPx=${maxHeight}&key=${GOOGLE_PLACES_API_KEY}`;

    const response = await fetch(photoUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch photo' },
        { status: response.status }
      );
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache 24 hours
      },
    });
  } catch (error) {
    console.error('Photo proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
