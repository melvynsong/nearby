import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'
import { normalizePhoneNumber, phoneLast4 } from '@/lib/helpers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const sessionMemberId = typeof body?.sessionMemberId === 'string' ? body.sessionMemberId : ''
    const requesterUserId = typeof body?.requesterUserId === 'string' ? body.requesterUserId : ''
    const groupPasscode = typeof body?.groupPasscode === 'string' ? body.groupPasscode.trim() : ''

    if (!sessionMemberId && !requesterUserId) {
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

    let userId = ''
    let displayName = 'Member'
    let phoneNumber = ''
    let phone4 = ''

    if (sessionMemberId) {
      const creator = await supabase
        .from('members')
        .select('id, user_id, display_name, phone_number, phone_last4, users ( phone_number )')
        .eq('id', sessionMemberId)
        .maybeSingle()

      if (creator.error || !creator.data?.user_id) {
        console.error('[Nearby][API][GroupJoin] Session validation failed:', creator.error)
        return NextResponse.json(
          { ok: false, message: 'Please create an account or sign in before joining a group.' },
          { status: 401 },
        )
      }

      userId = creator.data.user_id as string
      displayName = (creator.data.display_name as string | null) ?? 'Member'
      const phone = (creator.data.phone_number as string | null) ?? (creator.data.users as { phone_number?: string } | null)?.phone_number ?? ''
      phoneNumber = normalizePhoneNumber(phone)
      phone4 = (creator.data.phone_last4 as string | null) ?? phoneLast4(phone)
    } else {
      const user = await supabase
        .from('users')
        .select('id, full_name, phone_number, phone_last4')
        .eq('id', requesterUserId)
        .maybeSingle()

      if (user.error || !user.data?.id) {
        console.error('[Nearby][API][GroupJoin] Account validation failed:', user.error)
        return NextResponse.json(
          { ok: false, message: 'Please create an account or sign in before joining a group.' },
          { status: 401 },
        )
      }

      userId = user.data.id
      displayName = user.data.full_name ?? 'Member'
      phoneNumber = normalizePhoneNumber(user.data.phone_number ?? '')
      phone4 = user.data.phone_last4 ?? phoneLast4(user.data.phone_number ?? '')
    }

    const groupsResult = await supabase
      .from('groups')
      .select('id, name, visibility')
      .eq('access_code', groupPasscode)
      .limit(1)

    if (groupsResult.error) {
      console.error('[Nearby][API][GroupJoin] Group lookup failed:', groupsResult.error)
      return NextResponse.json(
        { ok: false, message: 'We could not complete this just now. Please try again.' },
        { status: 500 },
      )
    }

    const targetGroup = (groupsResult.data ?? [])[0] as { id: string; name: string; visibility?: 'public' | 'private' } | undefined
    if (!targetGroup?.id) {
      return NextResponse.json(
        { ok: false, message: 'That passcode does not look right. Please check and try again.' },
        { status: 404 },
      )
    }

    if (!phoneNumber || !phone4) {
      return NextResponse.json(
        { ok: false, message: 'Please update your account before joining this group.' },
        { status: 400 },
      )
    }

    const existingMembershipPreferred = await supabase
      .from('group_memberships')
      .select('id, status, member_id')
      .eq('user_id', userId)
      .eq('group_id', targetGroup.id)
      .maybeSingle()

    let existingMembership = existingMembershipPreferred.data as { id?: string; status?: string | null; member_id?: string | null } | null
    let existingMembershipError = existingMembershipPreferred.error as { code?: string; message?: string } | null

    if (existingMembershipError?.code === '42703' || existingMembershipError?.code === 'PGRST204') {
      const existingMembershipFallback = await supabase
        .from('group_memberships')
        .select('user_id, group_id, member_id')
        .eq('user_id', userId)
        .eq('group_id', targetGroup.id)
        .maybeSingle()
      existingMembership = existingMembershipFallback.data as { member_id?: string | null } | null
      existingMembershipError = existingMembershipFallback.error as { code?: string; message?: string } | null
      if (existingMembership && !('status' in existingMembership)) {
        existingMembership = { ...existingMembership, status: 'active' }
      }
    }

    if (existingMembershipError) {
      console.error('[Nearby][API][GroupJoin] Membership lookup failed:', existingMembershipError)
      return NextResponse.json(
        { ok: false, message: 'We could not complete this just now. Please try again.' },
        { status: 500 },
      )
    }

    if (existingMembership?.status === 'active' && existingMembership.member_id) {
      const existingMember = await supabase
        .from('members')
        .select('id, display_name')
        .eq('id', existingMembership.member_id)
        .maybeSingle()

      return NextResponse.json({
        ok: true,
        groupId: targetGroup.id,
        groupName: targetGroup.name,
        memberId: existingMembership.member_id,
        memberName: existingMember.data?.display_name ?? displayName,
        membershipStatus: 'active',
      })
    }

    const isPrivate = (targetGroup.visibility ?? 'public') === 'private'

    console.log('[Group]', {
      event: 'join_attempt',
      groupId: targetGroup.id,
      userId,
      visibility: isPrivate ? 'private' : 'public',
    })

    // Ensure member row exists for this user/group pair.
    const existingMember = await supabase
      .from('members')
      .select('id, display_name')
      .eq('user_id', userId)
      .eq('group_id', targetGroup.id)
      .maybeSingle()

    let memberId = existingMember.data?.id ?? ''
    let memberName = existingMember.data?.display_name ?? displayName

    if (!memberId) {
      const inserted = await supabase
        .from('members')
        .insert({ user_id: userId, group_id: targetGroup.id, display_name: displayName, phone_number: phoneNumber, phone_last4: phone4 })
        .select('id, display_name')
        .single()

      if (inserted.error?.code === '42703') {
        const fallbackInserted = await supabase
          .from('members')
          .insert({ user_id: userId, group_id: targetGroup.id, display_name: displayName, phone_last4: phone4 })
          .select('id, display_name')
          .single()

        if (fallbackInserted.error || !fallbackInserted.data?.id) {
          console.error('[Nearby][API][GroupJoin] Member insert fallback failed:', fallbackInserted.error)
          return NextResponse.json(
            { ok: false, message: 'We could not complete this just now. Please try again.' },
            { status: 500 },
          )
        }

        memberId = fallbackInserted.data.id
        memberName = fallbackInserted.data.display_name ?? displayName
      } else if (inserted.error || !inserted.data?.id) {
        console.error('[Nearby][API][GroupJoin] Member insert failed:', inserted.error)
        return NextResponse.json(
          { ok: false, message: 'We could not complete this just now. Please try again.' },
          { status: 500 },
        )
      } else {
        memberId = inserted.data.id
        memberName = inserted.data.display_name ?? displayName
      }
    }

    const nextStatus = isPrivate ? 'pending' : 'active'

    const preferredMembershipUpsert = await supabase
      .from('group_memberships')
      .upsert({
        user_id: userId,
        group_id: targetGroup.id,
        member_id: memberId,
        status: nextStatus,
        group_onboarded: nextStatus === 'active',
        requested_at: new Date().toISOString(),
        approved_at: nextStatus === 'active' ? new Date().toISOString() : null,
        approved_by: nextStatus === 'active' ? userId : null,
      }, { onConflict: 'user_id,group_id' })

    let membershipError = preferredMembershipUpsert.error

    if (membershipError?.code === '42703' || membershipError?.code === 'PGRST204') {
      const fallbackMembershipUpsert = await supabase
        .from('group_memberships')
        .upsert({ user_id: userId, group_id: targetGroup.id, member_id: memberId }, { onConflict: 'user_id,group_id' })

      membershipError = fallbackMembershipUpsert.error
    }

    if (membershipError) {
      console.error('[Nearby][API][GroupJoin] Membership upsert failed:', membershipError)
      return NextResponse.json(
        { ok: false, message: 'We could not complete this just now. Please try again.' },
        { status: 500 },
      )
    }

    console.log('[Membership]', {
      event: 'created_or_updated',
      userId,
      groupId: targetGroup.id,
      status: nextStatus,
    })

    if (isPrivate) {
      return NextResponse.json({
        ok: true,
        membershipStatus: 'pending',
        groupId: targetGroup.id,
        groupName: targetGroup.name,
        message: 'Join request submitted. Waiting for approval.',
      })
    }

    return NextResponse.json({
      ok: true,
      membershipStatus: 'active',
      groupId: targetGroup.id,
      groupName: targetGroup.name,
      memberId,
      memberName,
      message: 'Joined successfully.',
    })
  } catch (error) {
    console.error('[Nearby][API][GroupJoin] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, message: 'Something did not go through. Please try again.' },
      { status: 500 },
    )
  }
}
