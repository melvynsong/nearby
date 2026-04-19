import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const membershipId = typeof body?.membershipId === 'string' ? body.membershipId : ''
    const groupId = typeof body?.groupId === 'string' ? body.groupId : ''
    const requesterUserId = typeof body?.requesterUserId === 'string' ? body.requesterUserId : ''
    const decision = body?.decision === 'reject' ? 'rejected' : 'active'

    if (!membershipId || !groupId || !requesterUserId) {
      return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 })
    }

    const supabase = getServerSupabaseClient()

    const preferredRequesterMembership = await supabase
      .from('group_memberships')
      .select('user_id, status')
      .eq('group_id', groupId)
      .eq('user_id', requesterUserId)
      .eq('status', 'active')
      .maybeSingle()

    let requesterMembership = preferredRequesterMembership.data as { user_id?: string; status?: string | null } | null
    let requesterError = preferredRequesterMembership.error as { code?: string; message?: string } | null

    if (requesterError?.code === '42703' || requesterError?.code === 'PGRST204') {
      const fallbackRequesterMembership = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', requesterUserId)
        .maybeSingle()

      requesterMembership = fallbackRequesterMembership.data as { user_id?: string } | null
      requesterError = fallbackRequesterMembership.error as { code?: string; message?: string } | null
      if (requesterMembership && !('status' in requesterMembership)) {
        requesterMembership = { ...requesterMembership, status: 'active' }
      }
    }

    if (requesterError || !requesterMembership?.user_id || requesterMembership.status !== 'active') {
      return NextResponse.json({ ok: false, message: 'Only active members can approve requests.' }, { status: 403 })
    }

    const preferredUpdate = await supabase
      .from('group_memberships')
      .update({
        status: decision,
        approved_at: decision === 'active' ? new Date().toISOString() : null,
        approved_by: decision === 'active' ? requesterUserId : null,
        group_onboarded: decision === 'active',
      })
      .eq('id', membershipId)
      .eq('group_id', groupId)

    let updateError = preferredUpdate.error

    if (updateError?.code === '42703' || updateError?.code === 'PGRST204') {
      const fallbackUpdate = await supabase
        .from('group_memberships')
        .update({})
        .eq('id', membershipId)
        .eq('group_id', groupId)

      updateError = fallbackUpdate.error
    }

    if (updateError) {
      console.error('[Membership] decision update failed:', updateError)
      return NextResponse.json({ ok: false, message: 'Could not update membership status.' }, { status: 500 })
    }

    console.log('[Membership]', {
      event: 'status_updated',
      membershipId,
      groupId,
      status: decision,
      approvedBy: requesterUserId,
    })

    return NextResponse.json({ ok: true, status: decision })
  } catch (error) {
    console.error('[Membership] decision unexpected error:', error)
    return NextResponse.json({ ok: false, message: 'Something did not go through. Please try again.' }, { status: 500 })
  }
}
