import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { placeId } = await request.json()

    if (!placeId || typeof placeId !== 'string') {
      return Response.json({ error: 'placeId is required' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_PLACES_SERVER_KEY
    if (!apiKey) {
      console.error('[details] GOOGLE_PLACES_SERVER_KEY is not set')
      return Response.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const fields = [
      'id',
      'displayName',
      'formattedAddress',
      'location',
      'primaryType',
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
      console.error('[details] Google API error:', res.status, text)
      return Response.json({ error: 'Place details request failed' }, { status: 502 })
    }

    const data = await res.json()

    return Response.json({
      google_place_id: data.id ?? placeId,
      name: data.displayName?.text ?? '',
      formatted_address: data.formattedAddress ?? null,
      lat: data.location?.latitude ?? null,
      lng: data.location?.longitude ?? null,
      primary_type: data.primaryType ?? null,
    })
  } catch (err) {
    console.error('[details] unexpected error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
