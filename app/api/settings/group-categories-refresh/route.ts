import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const groupId = typeof body?.groupId === 'string' ? body.groupId : ''
    const requesterUserId = typeof body?.requesterUserId === 'string' ? body.requesterUserId : ''

    if (!groupId || !requesterUserId) {
      return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 })
    }

    const supabase = getServerSupabaseClient()

    const preferredMembership = await supabase
      .from('group_memberships')
      .select('user_id, status')
      .eq('group_id', groupId)
      .eq('user_id', requesterUserId)
      .eq('status', 'active')
      .maybeSingle()

    let membershipOk = !!preferredMembership.data?.user_id
    if (preferredMembership.error?.code === '42703' || preferredMembership.error?.code === 'PGRST204') {
      const fallbackMembership = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', requesterUserId)
        .maybeSingle()
      membershipOk = !!fallbackMembership.data?.user_id
    }

    if (!membershipOk) {
      return NextResponse.json({ ok: false, message: 'Only active members can refresh categories.' }, { status: 403 })
    }

    const recs = await supabase
      .from('recommendations')
      .select('place_id')
      .eq('group_id', groupId)

    if (recs.error) {
      return NextResponse.json({ ok: false, message: 'Could not refresh categories.' }, { status: 500 })
    }

    const placeIds = [...new Set((recs.data ?? []).map((row: any) => row.place_id).filter(Boolean))] as string[]

    const allCatsResult = await supabase
      .from('food_categories')
      .select('id')
      .eq('group_id', groupId)

    if (allCatsResult.error) {
      return NextResponse.json({ ok: false, message: 'Could not refresh categories.' }, { status: 500 })
    }

    const allCategoryIds = (allCatsResult.data ?? []).map((row: any) => row.id as string)

    let usedCategoryIds = new Set<string>()
    if (placeIds.length > 0) {
      const linksResult = await supabase
        .from('place_categories')
        .select('category_id, place_id')
        .in('place_id', placeIds)

      if (linksResult.error) {
        return NextResponse.json({ ok: false, message: 'Could not refresh categories.' }, { status: 500 })
      }

      usedCategoryIds = new Set((linksResult.data ?? []).map((row: any) => row.category_id as string))
    }

    const unused = allCategoryIds.filter((id) => !usedCategoryIds.has(id))

    if (unused.length > 0) {
      await supabase
        .from('food_categories')
        .delete()
        .in('id', unused)
    }

    return NextResponse.json({ ok: true, removed: unused.length, remaining: allCategoryIds.length - unused.length })
  } catch (error) {
    console.error('[Group] refresh categories error:', error)
    return NextResponse.json({ ok: false, message: 'Could not refresh categories.' }, { status: 500 })
  }
}
