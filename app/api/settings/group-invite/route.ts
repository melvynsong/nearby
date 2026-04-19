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
      .select('id, name, access_code')
      .eq('id', groupId)
      .maybeSingle()

    if (error || !group) {
      console.error('[Nearby][API][GroupInvite] Group lookup failed:', error)
      return NextResponse.json(
        { ok: false, message: 'We could not load invite details right now. Please try again.' },
        { status: 404 },
      )
    }

    const preferredMembership = await supabase
      .from('group_memberships')
      .select('user_id, status')
      .eq('group_id', groupId)
      .eq('user_id', requesterUserId)
      .eq('status', 'active')
      .maybeSingle()

    let activeMembership = preferredMembership.data as { user_id?: string; status?: string | null } | null
    let membershipError = preferredMembership.error as { code?: string; message?: string } | null

    if (membershipError?.code === '42703' || membershipError?.code === 'PGRST204') {
      const fallbackMembership = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', requesterUserId)
        .maybeSingle()

      activeMembership = fallbackMembership.data as { user_id?: string } | null
      membershipError = fallbackMembership.error as { code?: string; message?: string } | null
      if (activeMembership && !('status' in activeMembership)) {
        activeMembership = { ...activeMembership, status: 'active' }
      }
    }

    if (membershipError) {
      console.error('[Nearby][API][GroupInvite] Membership lookup failed:', membershipError)
      return NextResponse.json(
        { ok: false, message: 'We could not load invite details right now. Please try again.' },
        { status: 500 },
      )
    }

    if (!activeMembership?.user_id || activeMembership.status !== 'active') {
      return NextResponse.json(
        { ok: false, message: 'Only active members can access invite details.' },
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
