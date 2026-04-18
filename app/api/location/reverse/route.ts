import type { NextRequest } from 'next/server'

// Walk ALL results looking for the most specific area name, not just results[0]
function extractLabel(results: any[]): string | null {
  const find = (components: any[], types: string[]) =>
    components.find((c: any) => types.some((t) => c.types.includes(t)))

  for (const result of results) {
    const components: any[] = result.address_components ?? []
    const label =
      find(components, ['sublocality_level_1'])?.long_name ||
      find(components, ['neighborhood'])?.long_name ||
      find(components, ['locality'])?.long_name
    if (label) {
      console.log('[reverse] resolved label:', label, 'from result type:', result.types?.[0])
      return label
    }
  }

  // Last resort: strip postal code from first result's formatted address
  const fallback = results[0]?.formatted_address
  if (!fallback) return null
  const shortened = fallback.replace(/\b\d{5,}\b/g, '').replace(/,.*$/, '').trim()
  console.log('[reverse] using shortened address fallback:', shortened)
  return shortened || null
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
      return Response.json({ locationLabel: null, error: 'Server configuration error' }, { status: 500 })
    }

    console.log('[reverse] geocoding start, coords:', Math.round(lat * 100) / 100, Math.round(lng * 100) / 100)

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('latlng', `${lat},${lng}`)
    url.searchParams.set('key', apiKey)

    let res: Response
    try {
      // Hard 6s timeout so VPN-blocked requests don't hang Vercel's serverless function
      res = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) })
    } catch (fetchErr: any) {
      const reason = fetchErr?.name === 'TimeoutError' ? 'timeout' : fetchErr?.message
      console.error('[reverse] geocoding fetch failed:', reason)
      return Response.json({ locationLabel: null })
    }

    if (!res.ok) {
      console.error('[reverse] Geocoding API HTTP error:', res.status)
      return Response.json({ locationLabel: null })
    }

    const data = await res.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[reverse] Geocoding API status:', data.status, data.error_message ?? '')
      return Response.json({ locationLabel: null })
    }

    const locationLabel = extractLabel(data.results ?? [])
    console.log('[reverse] final locationLabel:', locationLabel)
    return Response.json({ locationLabel })
  } catch (err) {
    console.error('[reverse] unexpected error:', err)
    return Response.json({ locationLabel: null })
  }
}
