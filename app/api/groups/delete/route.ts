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
    const groupId  = typeof body?.groupId  === 'string' ? body.groupId.trim()  : ''
    const memberId = typeof body?.memberId === 'string' ? body.memberId.trim() : ''

    if (!groupId || !memberId) {
      return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 })
    }

    const db = getDb()

    // Verify the caller is a member of this group
    const { data: member, error: memberError } = await db
      .from('members')
      .select('id')
      .eq('id', memberId)
      .eq('group_id', groupId)
      .maybeSingle()

    if (memberError || !member?.id) {
      return NextResponse.json({ ok: false, message: 'You are not a member of this group.' }, { status: 403 })
    }

    // 1. Delete all recommendations in this group
    await db.from('recommendations').delete().eq('group_id', groupId)

    // 2. Delete place_categories linked to this group's food categories
    const { data: cats } = await db
      .from('food_categories')
      .select('id')
      .eq('group_id', groupId)

    if (cats && cats.length > 0) {
      const catIds = (cats as Array<{ id: string }>).map((c) => c.id)
      await db.from('place_categories').delete().in('category_id', catIds)
      await db.from('food_categories').delete().eq('group_id', groupId)
    }

    // 3. Delete group_memberships and members
    await db.from('group_memberships').delete().eq('group_id', groupId)
    await db.from('members').delete().eq('group_id', groupId)

    // 4. Delete the group
    const { error: groupDeleteError } = await db.from('groups').delete().eq('id', groupId)

    if (groupDeleteError) {
      console.error('[Nearby][API][DeleteGroup] Group delete error:', groupDeleteError)
      return NextResponse.json({ ok: false, message: 'Something went wrong. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Nearby][API][DeleteGroup] Unexpected error:', error)
    return NextResponse.json({ ok: false, message: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
