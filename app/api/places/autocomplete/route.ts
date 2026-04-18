import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return Response.json({ predictions: [] })
    }

    const apiKey = process.env.GOOGLE_PLACES_SERVER_KEY
    if (!apiKey) {
      console.error('[autocomplete] GOOGLE_PLACES_SERVER_KEY is not set')
      return Response.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({
        input: query.trim(),
        languageCode: 'en',
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[autocomplete] Google API error:', res.status, text)
      return Response.json({ error: 'Autocomplete request failed' }, { status: 502 })
    }

    const data = await res.json()
    const suggestions = data.suggestions ?? []

    const predictions = suggestions
      .filter((s: any) => s.placePrediction)
      .map((s: any) => {
        const p = s.placePrediction
        return {
          placeId: p.placeId,
          text: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
          secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
        }
      })

    return Response.json({ predictions })
  } catch (err) {
    console.error('[autocomplete] unexpected error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
