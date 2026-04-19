import { NextRequest, NextResponse } from 'next/server'
import type { DishSuggestion } from '@/lib/dish-analysis-types'
import { getPlaceDishStats, getInternalPlaceId } from '@/lib/dish-memory'
import { rerankWithPlaceStats } from '@/lib/dish-utils'

// Lightweight re-ranking endpoint: no image resend, no OpenAI call.
// Called after the user selects a place so suggestions can be re-ordered
// using place-level dish frequency data.

export async function POST(req: NextRequest) {
  let parsedSuggestions: DishSuggestion[] = []

  try {
    const body = await req.json()

    const googlePlaceId = typeof body?.googlePlaceId === 'string' ? body.googlePlaceId.trim() : ''
    const suggestions: DishSuggestion[] = Array.isArray(body?.suggestions) ? body.suggestions : []
    parsedSuggestions = suggestions

    if (!googlePlaceId || !suggestions.length) {
      return NextResponse.json({ rankedSuggestions: suggestions })
    }

    // Resolve internal place UUID
    const internalPlaceId = await getInternalPlaceId(googlePlaceId)
    if (!internalPlaceId) {
      // Place not in our DB yet — no stats to apply, return original order
      return NextResponse.json({ rankedSuggestions: suggestions })
    }

    const placeStats = await getPlaceDishStats(internalPlaceId)
    if (!placeStats.length) {
      return NextResponse.json({ rankedSuggestions: suggestions })
    }

    const ranked = rerankWithPlaceStats(suggestions, placeStats)

    console.log('[DishRank] Re-ranked with place stats', {
      placeId: internalPlaceId,
      before: suggestions.map((s) => s.name),
      after: ranked.map((s) => s.name),
    })

    return NextResponse.json({ rankedSuggestions: ranked })
  } catch (err) {
    console.error('[DishRank] Error:', err)
    return NextResponse.json({ rankedSuggestions: parsedSuggestions })
  }
}
