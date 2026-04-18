import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const groupId = typeof body?.groupId === 'string' ? body.groupId : ''
    const requesterUserId = typeof body?.requesterUserId === 'string' ? body.requesterUserId : ''

    if (!groupId || !requesterUserId) {
      return NextResponse.json(
        { ok: false, message: 'We could not load invite details right now. Please try again.' },
        { status: 400 },
      )
    }

    const supabase = getServerSupabaseClient()

    const { data: group, error } = await supabase
      .from('groups')
      .select('id, name, access_code, created_by_user_id')
      .eq('id', groupId)
      .maybeSingle()

    if (error?.message?.includes('created_by_user_id')) {
      return NextResponse.json(
        { ok: false, message: 'Invite details will be available after the latest group-owner migration.' },
        { status: 412 },
      )
    }

    if (error || !group) {
      console.error('[Nearby][API][GroupInvite] Group lookup failed:', error)
      return NextResponse.json(
        { ok: false, message: 'We could not load invite details right now. Please try again.' },
        { status: 404 },
      )
    }

    if (!group.created_by_user_id || group.created_by_user_id !== requesterUserId) {
      return NextResponse.json(
        { ok: false, message: 'Only the group creator can access invite details.' },
        { status: 403 },
      )
    }

    return NextResponse.json({
      ok: true,
      groupName: group.name,
      groupPasscode: group.access_code,
    })
  } catch (error) {
    console.error('[Nearby][API][GroupInvite] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, message: 'Something did not go through. Please try again.' },
      { status: 500 },
    )
  }
}
