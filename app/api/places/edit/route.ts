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
      .select('id, google_place_id, name, formatted_address, lat, lng, photo_urls')
      .eq('id', placeId)
      .maybeSingle()

    if (placeResult.error || !placeResult.data?.id) {
      return NextResponse.json({ ok: false, message: 'Place not found.' }, { status: 404 })
    }

    const categoryResult = await db
      .from('place_categories')
      .select('food_categories ( name )')
      .eq('place_id', placeId)
      .limit(1)

    const categoryName = ((categoryResult.data ?? [])[0] as { food_categories?: { name?: string } | null } | undefined)?.food_categories?.name ?? ''

    console.log('[PlaceEdit]', {
      place_id: placeId,
      individual_id: individualId,
      is_owner: true,
      action: 'open_edit',
    })

    return NextResponse.json({
      ok: true,
      recommendationId: ownerRecommendation.id,
      note: ownerRecommendation.note ?? '',
      dishName: categoryName,
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
