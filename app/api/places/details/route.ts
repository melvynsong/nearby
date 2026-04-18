import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { placeId } = await request.json()

    if (!placeId || typeof placeId !== 'string') {
      return Response.json({ error: 'Please choose a place and try again.' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_PLACES_SERVER_KEY
    if (!apiKey) {
      console.error('[Nearby][API] Place details key missing')
      return Response.json({ error: 'Something did not go through. Please try again.' }, { status: 500 })
    }

    const fields = [
      'id',
      'displayName',
      'formattedAddress',
      'location',
      'primaryType',
      'rating',
      'userRatingCount',
    ].join(',')

    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fields,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[Nearby][API] Place details provider failed:', res.status, text)
      return Response.json({ error: 'Connection issue. Please check your network and try again.' }, { status: 502 })
    }

    const data = await res.json()

    const lat = data.location?.latitude ?? null
    const lng = data.location?.longitude ?? null
    const mapPreviewUrl =
      lat != null && lng != null
        ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=640x280&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${apiKey}`
        : null

    return Response.json({
      google_place_id: data.id ?? placeId,
      name: data.displayName?.text ?? '',
      formatted_address: data.formattedAddress ?? null,
      lat,
      lng,
      primary_type: data.primaryType ?? null,
      rating: data.rating ?? null,
      user_rating_count: data.userRatingCount ?? null,
      map_preview_url: mapPreviewUrl,
    })
  } catch (err) {
    console.error('[Nearby][API] Place details unexpected error:', err)
    return Response.json({ error: 'Something did not go through. Please try again.' }, { status: 500 })
  }
}
