import type { NextRequest } from 'next/server'

// Priority order for result_type — most specific to least
const PREFERRED_TYPES = [
  'neighborhood',
  'sublocality_level_1',
  'sublocality',
  'locality',
  'administrative_area_level_2',
  'administrative_area_level_1',
]

function pickLabel(results: any[]): string | null {
  for (const type of PREFERRED_TYPES) {
    for (const result of results) {
      if (result.types?.includes(type)) {
        return result.address_components?.find((c: any) => c.types.includes(type))?.long_name
          ?? result.formatted_address
      }
    }
  }
  // Fallback: first result's formatted address
  return results[0]?.formatted_address ?? null
}

export async function POST(request: NextRequest) {
  try {
    const { lat, lng } = await request.json()

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return Response.json({ error: 'lat and lng are required numbers' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_PLACES_SERVER_KEY
    if (!apiKey) {
      console.error('[reverse] GOOGLE_PLACES_SERVER_KEY is not set')
      return Response.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('latlng', `${lat},${lng}`)
    url.searchParams.set('result_type', PREFERRED_TYPES.join('|'))
    url.searchParams.set('key', apiKey)

    const res = await fetch(url.toString())
    if (!res.ok) {
      console.error('[reverse] Geocoding API HTTP error:', res.status)
      return Response.json({ error: 'Geocoding request failed' }, { status: 502 })
    }

    const data = await res.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[reverse] Geocoding API status:', data.status, data.error_message)
      return Response.json({ error: `Geocoding error: ${data.status}` }, { status: 502 })
    }

    const label = pickLabel(data.results ?? [])
    return Response.json({ label })
  } catch (err) {
    console.error('[reverse] unexpected error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
