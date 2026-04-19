import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

function getDb() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getServiceRoleSupabaseClient } = require('@/lib/server-supabase')
    return getServiceRoleSupabaseClient()
  } catch {
    return getServerSupabaseClient()
  }
}

async function resolveIndividualId(memberId: string): Promise<string> {
  if (!memberId) return ''
  const db = getDb()
  const result = await db
    .from('members')
    .select('user_id')
    .eq('id', memberId)
    .maybeSingle()
  return result.data?.user_id ?? memberId
}

// Fetch the saved category name for a place using an explicit 2-step lookup.
// Avoids relying on Supabase FK schema cache which can silently return null
// when the foreign key relationship is not registered in the API schema.
async function resolveCategoryName(placeId: string): Promise<string> {
  const db = getDb()

  // Step 1: get the category_id linked to this place
  const pcResult = await db
    .from('place_categories')
    .select('category_id')
    .eq('place_id', placeId)
    .limit(1)
    .maybeSingle()

  const categoryId = pcResult.data?.category_id ?? null

  console.log('[EditCategoryLoad]', {
    place_id: placeId,
    category_id_found: categoryId ?? null,
  })

  if (!categoryId) return ''

  // Step 2: look up the name in food_categories directly
  const catResult = await db
    .from('food_categories')
    .select('name')
    .eq('id', categoryId)
    .maybeSingle()

  const name = catResult.data?.name ?? ''

  console.log('[EditCategoryLoad]', {
    place_id: placeId,
    saved_category_raw: name,
    saved_category_resolved: name.trim(),
    matched_option_found: name.length > 0,
  })

  return name.trim()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : ''
    const memberId = typeof body?.memberId === 'string' ? body.memberId.trim() : ''
    const groupId = typeof body?.groupId === 'string' ? body.groupId.trim() : ''

    if (!placeId || !memberId || !groupId) {
      return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 })
    }

    const db = getDb()

    const ownerRecommendationResult = await db
      .from('recommendations')
      .select('id, note, member_id, created_at')
      .eq('place_id', placeId)
      .eq('group_id', groupId)
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(1)

    const ownerRecommendation = (ownerRecommendationResult.data ?? [])[0] ?? null
    const individualId = await resolveIndividualId(memberId)

    if (ownerRecommendationResult.error || !ownerRecommendation?.id) {
      console.log('[PlaceEdit]', {
        place_id: placeId,
        individual_id: individualId,
        is_owner: false,
        action: 'open_edit',
      })
      return NextResponse.json({ ok: false, message: 'You cannot edit this place.' }, { status: 403 })
    }

    const placeResult = await db
      .from('places')
      .select('id, google_place_id, name, formatted_address, lat, lng, photo_urls, image_transforms')
      .eq('id', placeId)
      .maybeSingle()

    if (placeResult.error || !placeResult.data?.id) {
      return NextResponse.json({ ok: false, message: 'Place not found.' }, { status: 404 })
    }

    // Use explicit 2-step lookup instead of FK join (more reliable across schema versions)
    const categoryName = await resolveCategoryName(placeId)

    console.log('[PlaceEdit]', {
      place_id: placeId,
      individual_id: individualId,
      is_owner: true,
      action: 'open_edit',
      dish_name_resolved: categoryName || '(empty)',
    })

    return NextResponse.json({
      ok: true,
      recommendationId: ownerRecommendation.id,
      note: ownerRecommendation.note ?? '',
      dishName: categoryName,
      photoUrls: placeResult.data.photo_urls ?? [],
      imageTransforms: placeResult.data.image_transforms ?? {},
      place: {
        google_place_id: placeResult.data.google_place_id,
        name: placeResult.data.name,
        formatted_address: placeResult.data.formatted_address,
        lat: placeResult.data.lat,
        lng: placeResult.data.lng,
      },
    })
  } catch (error) {
    console.error('[Nearby][API][PlaceEdit] Unexpected error:', error)
    return NextResponse.json({ ok: false, message: 'Could not load place edit data.' }, { status: 500 })
  }
}
