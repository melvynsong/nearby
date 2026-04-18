import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

function phoneLast4(phone: string): string {
  return phone.replace(/\D/g, '').slice(-4)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const sessionMemberId = typeof body?.sessionMemberId === 'string' ? body.sessionMemberId : ''
    const groupPasscode = typeof body?.groupPasscode === 'string' ? body.groupPasscode.trim() : ''

    if (!sessionMemberId) {
      return NextResponse.json(
        { ok: false, message: 'Please create an account or sign in before joining a group.' },
        { status: 401 },
      )
    }

    if (!groupPasscode) {
      return NextResponse.json(
        { ok: false, message: 'Please enter a group passcode.' },
        { status: 400 },
      )
    }

    const supabase = getServerSupabaseClient()

    const creator = await supabase
      .from('members')
      .select('id, user_id, display_name, phone_last4, users ( phone_number )')
      .eq('id', sessionMemberId)
      .maybeSingle()

    if (creator.error || !creator.data?.user_id) {
      console.error('[Nearby][API][GroupJoin] Session validation failed:', creator.error)
      return NextResponse.json(
        { ok: false, message: 'Please create an account or sign in before joining a group.' },
        { status: 401 },
      )
    }

    const groupsResult = await supabase
      .from('groups')
      .select('id, name')
      .eq('access_code', groupPasscode)
      .limit(1)

    if (groupsResult.error) {
      console.error('[Nearby][API][GroupJoin] Group lookup failed:', groupsResult.error)
      return NextResponse.json(
        { ok: false, message: 'We could not complete this just now. Please try again.' },
        { status: 500 },
      )
    }

    const targetGroup = (groupsResult.data ?? [])[0]
    if (!targetGroup?.id) {
      return NextResponse.json(
        { ok: false, message: 'That passcode doesn\'t look right. Please check and try again.' },
        { status: 404 },
      )
    }

    const userId = creator.data.user_id as string
    const displayName = (creator.data.display_name as string | null) ?? 'Member'
    const phone = (creator.data.users as { phone_number?: string } | null)?.phone_number ?? ''
    const phone4 = (creator.data.phone_last4 as string | null) ?? phoneLast4(phone)

    if (!phone4) {
      return NextResponse.json(
        { ok: false, message: 'Please update your account before joining this group.' },
        { status: 400 },
      )
    }

    const existingMember = await supabase
      .from('members')
      .select('id')
      .eq('user_id', userId)
      .eq('group_id', targetGroup.id)
      .maybeSingle()

    let memberId = existingMember.data?.id ?? ''

    if (!memberId) {
      const inserted = await supabase
        .from('members')
        .insert({ user_id: userId, group_id: targetGroup.id, display_name: displayName, phone_last4: phone4 })
        .select('id')
        .single()

      if (inserted.error || !inserted.data?.id) {
        console.error('[Nearby][API][GroupJoin] Member insert failed:', inserted.error)
        return NextResponse.json(
          { ok: false, message: 'We could not complete this just now. Please try again.' },
          { status: 500 },
        )
      }

      memberId = inserted.data.id
    }

    const membership = await supabase
      .from('group_memberships')
      .upsert({ user_id: userId, group_id: targetGroup.id, member_id: memberId }, { onConflict: 'user_id,group_id' })

    if (membership.error) {
      console.error('[Nearby][API][GroupJoin] Membership upsert failed:', membership.error)
      return NextResponse.json(
        { ok: false, message: 'We could not complete this just now. Please try again.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      groupId: targetGroup.id,
      groupName: targetGroup.name,
      memberId,
      memberName: displayName,
    })
  } catch (error) {
    console.error('[Nearby][API][GroupJoin] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, message: 'Something did not go through. Please try again.' },
      { status: 500 },
    )
  }
}
