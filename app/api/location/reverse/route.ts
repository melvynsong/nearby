import type { NextRequest } from 'next/server'

function extractLabel(results: any[]): string {
  // Use the first result's address_components — it's the most specific match
  const components: any[] = results[0]?.address_components ?? []

  const find = (types: string[]) =>
    components.find((c) => types.some((t) => c.types.includes(t)))

  const label =
    find(['sublocality_level_1'])?.long_name ||
    find(['neighborhood'])?.long_name ||
    find(['locality'])?.long_name ||
    shortenAddress(results[0]?.formatted_address)

  return label ?? 'your location'
}

// Strip postal codes and trim to the first 2–3 meaningful words
function shortenAddress(address: string | undefined): string | null {
  if (!address) return null
  return address
    .replace(/\b\d{5,}\b/g, '')   // remove postal codes
    .replace(/,.*$/, '')           // keep only the first segment before a comma
    .trim()
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

    const locationLabel = extractLabel(data.results ?? [])
    return Response.json({ locationLabel })
  } catch (err) {
    console.error('[reverse] unexpected error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
