// Server-only: Supabase queries for dish intelligence tables.
// All functions use the service-role client so they bypass RLS.
// Never import this file from client components.

import { getServiceRoleSupabaseClient } from './server-supabase'
import type { DishVisualMemory, PlaceDishStat } from './dish-analysis-types'
import { canonicalizeDishName } from './dish-utils'

function getDb() {
  return getServiceRoleSupabaseClient()
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getPlaceDishStats(placeId: string): Promise<PlaceDishStat[]> {
  if (!placeId) return []
  try {
    const db = getDb()
    const { data, error } = await db
      .from('place_dish_stats')
      .select('*')
      .eq('place_id', placeId)
      .order('confirm_count', { ascending: false })
      .limit(15)

    if (error) {
      console.error('[DishMemory] getPlaceDishStats error:', error)
      return []
    }
    return (data ?? []) as PlaceDishStat[]
  } catch (err) {
    console.error('[DishMemory] getPlaceDishStats unexpected:', err)
    return []
  }
}

// Returns dish memories for a list of candidate dish names.
// Used to inject visual fingerprint context into the AI prompt.
export async function getSimilarDishMemories(
  dishHints: string[],
  placeId?: string | null,
  limit = 8,
): Promise<DishVisualMemory[]> {
  if (!dishHints.length) return []
  try {
    const db = getDb()
    const canonicalHints = [...new Set(dishHints.map(canonicalizeDishName))]

    let q = db
      .from('dish_visual_memory')
      .select('*')
      .in('canonical_dish_name', canonicalHints)
      .order('confirmed_count', { ascending: false })
      .limit(limit)

    // Prefer memories for this specific place, but don't restrict to it
    if (placeId) {
      const { data: placeMemories } = await db
        .from('dish_visual_memory')
        .select('*')
        .in('canonical_dish_name', canonicalHints)
        .eq('place_id', placeId)
        .order('confirmed_count', { ascending: false })
        .limit(limit)

      if (placeMemories?.length) {
        // Merge place-specific memories first, then global ones
        const placeIds = new Set(placeMemories.map((m: DishVisualMemory) => m.id))
        const { data: globalMemories } = await q
        const merged = [
          ...placeMemories,
          ...((globalMemories ?? []) as DishVisualMemory[]).filter((m) => !placeIds.has(m.id)),
        ].slice(0, limit)
        return merged
      }
    }

    const { data, error } = await q
    if (error) {
      console.error('[DishMemory] getSimilarDishMemories error:', error)
      return []
    }
    return (data ?? []) as DishVisualMemory[]
  } catch (err) {
    console.error('[DishMemory] getSimilarDishMemories unexpected:', err)
    return []
  }
}

// Resolve internal place UUID from google_place_id (for rank endpoint)
export async function getInternalPlaceId(googlePlaceId: string): Promise<string | null> {
  if (!googlePlaceId) return null
  try {
    const db = getDb()
    const { data, error } = await db
      .from('places')
      .select('id')
      .eq('google_place_id', googlePlaceId)
      .maybeSingle()
    if (error) return null
    return data?.id ?? null
  } catch {
    return null
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────

export async function saveDishAnalysisEvent(params: {
  userId?: string | null
  placeId?: string | null
  uploadedPhotoUrl?: string | null
  aiRawResult: Record<string, unknown>
  suggestedDishes: string[]
}): Promise<string | null> {
  try {
    const db = getDb()
    const { data, error } = await db
      .from('dish_analysis_events')
      .insert({
        user_id: params.userId ?? null,
        place_id: params.placeId ?? null,
        uploaded_photo_url: params.uploadedPhotoUrl ?? null,
        ai_raw_result: params.aiRawResult,
        suggested_dishes: params.suggestedDishes,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[DishMemory] saveDishAnalysisEvent error:', error)
      return null
    }
    return data?.id ?? null
  } catch (err) {
    console.error('[DishMemory] saveDishAnalysisEvent unexpected:', err)
    return null
  }
}

// Full confirmation flow: marks event + upserts visual memory + increments place stats
export async function confirmDishSelection(params: {
  analysisEventId: string
  selectedDishName: string
  placeId?: string | null
  photoUrl?: string | null
  visualCharacteristics?: Record<string, unknown>
  cuisine?: string | null
  alternateNames?: string[]
}): Promise<void> {
  const db = getDb()
  const canonical = canonicalizeDishName(params.selectedDishName)

  // 1. Mark event as confirmed
  try {
    await db
      .from('dish_analysis_events')
      .update({ final_selected_dish: canonical, was_confirmed: true })
      .eq('id', params.analysisEventId)
  } catch (err) {
    console.error('[DishMemory] confirmDishSelection: event update failed:', err)
  }

  // 2. Upsert dish_visual_memory
  try {
    const { data: existing } = await db
      .from('dish_visual_memory')
      .select('id, confirmed_count, alternate_names')
      .eq('canonical_dish_name', canonical)
      .is('place_id', params.placeId ? null : null) // handled below
      .maybeSingle()

    // Find memory for this exact place (or global if no place)
    let placeMemory: DishVisualMemory | null = null
    if (params.placeId) {
      const { data } = await db
        .from('dish_visual_memory')
        .select('*')
        .eq('canonical_dish_name', canonical)
        .eq('place_id', params.placeId)
        .maybeSingle()
      placeMemory = (data ?? null) as DishVisualMemory | null
    }

    const target = placeMemory ?? (existing as DishVisualMemory | null)

    if (target) {
      const mergedAlts = Array.from(new Set([
        ...(Array.isArray(target.alternate_names) ? target.alternate_names : []),
        ...(params.alternateNames ?? []),
      ]))
      const updates: Record<string, unknown> = {
        confirmed_count: (target.confirmed_count ?? 1) + 1,
        last_confirmed_at: new Date().toISOString(),
        alternate_names: mergedAlts,
      }
      if (params.photoUrl) updates.photo_url = params.photoUrl
      if (params.visualCharacteristics) updates.visual_characteristics = params.visualCharacteristics
      if (params.cuisine) updates.cuisine = params.cuisine

      await db.from('dish_visual_memory').update(updates).eq('id', target.id)
    } else {
      await db.from('dish_visual_memory').insert({
        canonical_dish_name: canonical,
        alternate_names: params.alternateNames ?? [],
        place_id: params.placeId ?? null,
        photo_url: params.photoUrl ?? null,
        visual_characteristics: params.visualCharacteristics ?? {},
        cuisine: params.cuisine ?? null,
        confirmed_count: 1,
        last_confirmed_at: new Date().toISOString(),
      })
    }
  } catch (err) {
    console.error('[DishMemory] confirmDishSelection: memory upsert failed:', err)
  }

  // 3. Increment place_dish_stats confirm_count
  if (params.placeId) {
    try {
      const { data: existingStat } = await db
        .from('place_dish_stats')
        .select('id, confirm_count, add_count')
        .eq('place_id', params.placeId)
        .eq('canonical_dish_name', canonical)
        .maybeSingle()

      if (existingStat) {
        await db
          .from('place_dish_stats')
          .update({
            confirm_count: ((existingStat as PlaceDishStat).confirm_count ?? 0) + 1,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', (existingStat as PlaceDishStat).id)
      } else {
        await db.from('place_dish_stats').insert({
          place_id: params.placeId,
          canonical_dish_name: canonical,
          confirm_count: 1,
          add_count: 1,
          last_seen_at: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('[DishMemory] confirmDishSelection: place stats failed:', err)
    }
  }

  console.log('[DishMemory] confirmed:', { canonical, placeId: params.placeId })
}

// Called at place-save time to track that a dish was added at this place
export async function incrementPlaceDishAddCount(
  placeId: string,
  dishName: string,
): Promise<void> {
  if (!placeId || !dishName) return
  try {
    const db = getDb()
    const canonical = canonicalizeDishName(dishName)

    const { data: existing } = await db
      .from('place_dish_stats')
      .select('id, add_count')
      .eq('place_id', placeId)
      .eq('canonical_dish_name', canonical)
      .maybeSingle()

    if (existing) {
      await db
        .from('place_dish_stats')
        .update({
          add_count: ((existing as PlaceDishStat).add_count ?? 0) + 1,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', (existing as PlaceDishStat).id)
    } else {
      await db.from('place_dish_stats').insert({
        place_id: placeId,
        canonical_dish_name: canonical,
        add_count: 1,
        confirm_count: 0,
        last_seen_at: new Date().toISOString(),
      })
    }
  } catch (err) {
    console.error('[DishMemory] incrementPlaceDishAddCount failed:', err)
  }
}
