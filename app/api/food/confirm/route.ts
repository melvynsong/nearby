import { NextRequest, NextResponse } from 'next/server'
import { confirmDishSelection } from '@/lib/dish-memory'
import { canonicalizeDishName, getAlternateNames } from '@/lib/dish-utils'

// Called when a user explicitly confirms a dish (or overrides the suggestion).
// Updates dish_analysis_events, dish_visual_memory, and place_dish_stats.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const analysisEventId = typeof body?.analysisEventId === 'string' ? body.analysisEventId.trim() : ''
    const selectedDishName = typeof body?.selectedDishName === 'string' ? body.selectedDishName.trim() : ''
    const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : null
    const photoUrl = typeof body?.photoUrl === 'string' ? body.photoUrl.trim() : null
    const cuisine = typeof body?.cuisine === 'string' ? body.cuisine.trim() : null
    const rawAlts = Array.isArray(body?.alternateNames)
      ? (body.alternateNames as unknown[]).filter((x): x is string => typeof x === 'string')
      : []

    if (!analysisEventId || !selectedDishName) {
      return NextResponse.json(
        { ok: false, message: 'analysisEventId and selectedDishName are required.' },
        { status: 400 },
      )
    }

    const canonical = canonicalizeDishName(selectedDishName)
    // Merge user-provided alts with our built-in alias list
    const alternateNames = [...new Set([...rawAlts, ...getAlternateNames(canonical)])]

    const visualCharacteristics = body?.visualCharacteristics &&
      typeof body.visualCharacteristics === 'object' &&
      !Array.isArray(body.visualCharacteristics)
      ? (body.visualCharacteristics as Record<string, unknown>)
      : undefined

    await confirmDishSelection({
      analysisEventId,
      selectedDishName: canonical,
      placeId: placeId || null,
      photoUrl: photoUrl || null,
      visualCharacteristics,
      cuisine: cuisine || null,
      alternateNames,
    })

    console.log('[DishConfirm] Saved confirmation', { canonical, placeId })

    return NextResponse.json({ ok: true, canonicalName: canonical })
  } catch (err) {
    console.error('[DishConfirm] Unexpected error:', err)
    return NextResponse.json(
      { ok: false, message: 'Could not save dish confirmation.' },
      { status: 500 },
    )
  }
}
