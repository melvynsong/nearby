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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const placeId  = typeof body?.placeId  === 'string' ? body.placeId.trim()  : ''
    const memberId = typeof body?.memberId === 'string' ? body.memberId.trim() : ''
    const groupId  = typeof body?.groupId  === 'string' ? body.groupId.trim()  : ''

    if (!placeId || !memberId || !groupId) {
      return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 })
    }

    const db = getDb()

    // Verify the caller added at least one recommendation for this place in this group
    const { data: rec, error: recError } = await db
      .from('recommendations')
      .select('id')
      .eq('place_id', placeId)
      .eq('member_id', memberId)
      .eq('group_id', groupId)
      .maybeSingle()

    if (recError || !rec?.id) {
      return NextResponse.json({ ok: false, message: 'You cannot delete this place.' }, { status: 403 })
    }

    // Delete all recommendations for this place in this group (from any member)
    await db.from('recommendations').delete().eq('place_id', placeId).eq('group_id', groupId)

    // If no other group references this place, clean up the place record + photos
    const { data: remaining } = await db
      .from('recommendations')
      .select('id')
      .eq('place_id', placeId)
      .limit(1)

    if (!remaining || remaining.length === 0) {
      // Fetch photo URLs before deleting the place
      const { data: placeData } = await db
        .from('places')
        .select('photo_urls')
        .eq('id', placeId)
        .maybeSingle()

      const photoUrls: string[] = (placeData as { photo_urls?: string[] } | null)?.photo_urls ?? []

      // Remove from storage
      if (photoUrls.length > 0) {
        const storagePaths = photoUrls
          .map((url: string) => {
            const match = url.match(/nearby-place-photos\/(.+)$/)
            return match ? match[1] : null
          })
          .filter((p): p is string => p !== null)

        if (storagePaths.length > 0) {
          await db.storage.from('nearby-place-photos').remove(storagePaths)
        }
      }

      await db.from('place_categories').delete().eq('place_id', placeId)
      await db.from('places').delete().eq('id', placeId)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Nearby][API][DeletePlace] Unexpected error:', error)
    return NextResponse.json({ ok: false, message: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
