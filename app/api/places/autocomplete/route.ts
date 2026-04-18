import type { NextRequest } from 'next/server'

type GeocodeAddressComponent = {
  short_name?: string
  types?: string[]
}

type GeocodeResponse = {
  results?: Array<{
    address_components?: GeocodeAddressComponent[]
  }>
}

type GoogleSuggestion = {
  placePrediction?: {
    placeId?: string
    text?: { text?: string }
    structuredFormat?: {
      mainText?: { text?: string }
      secondaryText?: { text?: string }
    }
    distanceMeters?: number
  }
}

type BasePrediction = {
  placeId?: string
  text: string
  secondaryText: string
  distanceMeters: number | null
  rating: number | null
}

async function resolveRegionCode(apiKey: string, lat: number, lng: number): Promise<string | null> {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('latlng', `${lat},${lng}`)
    url.searchParams.set('key', apiKey)

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    const first = (data as GeocodeResponse)?.results?.[0]
    const components = first?.address_components ?? []
    const country = components.find((c) => (c.types ?? []).includes('country'))
    return typeof country?.short_name === 'string' ? country.short_name.toLowerCase() : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { query, location } = await request.json()

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return Response.json({ predictions: [] })
    }

    const lat = Number(location?.lat)
    const lng = Number(location?.lng)
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng)

    const apiKey = process.env.GOOGLE_PLACES_SERVER_KEY
    if (!apiKey) {
      console.error('[autocomplete] GOOGLE_PLACES_SERVER_KEY is not set')
      return Response.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const regionCode = hasLocation ? await resolveRegionCode(apiKey, lat, lng) : null

    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'suggestions.placePrediction.placeId',
          'suggestions.placePrediction.text',
          'suggestions.placePrediction.structuredFormat',
          'suggestions.placePrediction.distanceMeters',
        ].join(','),
      },
      body: JSON.stringify({
        input: query.trim(),
        languageCode: 'en',
        includeQueryPredictions: false,
        ...(hasLocation
          ? {
              locationBias: {
                circle: {
                  center: { latitude: lat, longitude: lng },
                  radius: 30000,
                },
              },
              origin: { latitude: lat, longitude: lng },
              ...(regionCode ? { regionCode } : {}),
            }
          : {}),
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[autocomplete] Google API error:', res.status, text)
      return Response.json({ error: 'Autocomplete request failed' }, { status: 502 })
    }

    const data = await res.json()
    const suggestions: GoogleSuggestion[] = data.suggestions ?? []

    const mappedPredictions: BasePrediction[] = suggestions
      .filter((s) => Boolean(s.placePrediction))
      .map((s) => {
        const p = s.placePrediction
        return {
          placeId: p?.placeId,
          text: p?.structuredFormat?.mainText?.text ?? p?.text?.text ?? '',
          secondaryText: p?.structuredFormat?.secondaryText?.text ?? '',
          distanceMeters: p?.distanceMeters ?? null,
          rating: null,
        }
      })

    const basePredictions = mappedPredictions
      .filter((item): item is BasePrediction & { placeId: string } => typeof item.placeId === 'string' && item.placeId.length > 0)

    const top = basePredictions.slice(0, 6)
    const ratingResults = await Promise.all(
      top.map(async (item) => {
        try {
          const detailsRes = await fetch(`https://places.googleapis.com/v1/places/${item.placeId}`, {
            method: 'GET',
            headers: {
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'id,rating,userRatingCount',
            },
          })
          if (!detailsRes.ok) return item
          const details = await detailsRes.json()
          return { ...item, rating: details.rating ?? null, userRatingCount: details.userRatingCount ?? null }
        } catch {
          return item
        }
      }),
    )

    const ratingMap = new Map(ratingResults.map((r) => [r.placeId, r]))
    const predictions = basePredictions.map((item) => ratingMap.get(item.placeId) ?? item)

    return Response.json({ predictions })
  } catch (err) {
    console.error('[autocomplete] unexpected error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
