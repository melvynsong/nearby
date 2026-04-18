import { NextRequest, NextResponse } from 'next/server'
import { slugify } from '@/lib/helpers'
import { getServerSupabaseClient } from '@/lib/server-supabase'

type FriendInput = { name: string; phone: string }

function phoneLast4(phone: string): string {
  return phone.replace(/\D/g, '').slice(-4)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const sessionMemberId = typeof body?.sessionMemberId === 'string' ? body.sessionMemberId : ''
    const requesterUserId = typeof body?.requesterUserId === 'string' ? body.requesterUserId : ''
    const fallbackMemberName = typeof body?.fallbackMemberName === 'string' ? body.fallbackMemberName : ''
    const groupName = typeof body?.groupName === 'string' ? body.groupName.trim() : ''
    const passcode = typeof body?.passcode === 'string' ? body.passcode.trim() : ''
    const friends = Array.isArray(body?.friends) ? (body.friends as FriendInput[]) : []

    if (!sessionMemberId && !requesterUserId) {
      return NextResponse.json(
        { ok: false, message: 'Please create an account or sign in before creating a group.' },
        { status: 401 },
      )
    }

    if (!groupName || !passcode) {
      return NextResponse.json(
        { ok: false, message: 'Please complete group name and passcode.' },
        { status: 400 },
      )
    }

    const supabase = getServerSupabaseClient()

    let creatorUserId = ''
    let creatorName = fallbackMemberName
    let creatorPhone4 = ''

    if (sessionMemberId) {
      const { data: creatorMember, error: creatorError } = await supabase
        .from('members')
        .select('id, user_id, display_name, phone_last4, users ( phone_number )')
        .eq('id', sessionMemberId)
        .maybeSingle()

      if (creatorError || !creatorMember?.user_id) {
        console.error('[Nearby][API][GroupCreate] Session validation failed:', creatorError)
        return NextResponse.json(
          { ok: false, message: 'Please create an account or sign in before creating a group.' },
          { status: 401 },
        )
      }

      creatorUserId = creatorMember.user_id as string
      creatorName = (creatorMember.display_name as string | null) ?? fallbackMemberName
      const creatorPhone = (creatorMember.users as { phone_number?: string } | null)?.phone_number ?? ''
      creatorPhone4 = (creatorMember.phone_last4 as string | null) ?? phoneLast4(creatorPhone)
    } else {
      const { data: creatorUser, error: userError } = await supabase
        .from('users')
        .select('id, full_name, phone_number, phone_last4')
        .eq('id', requesterUserId)
        .maybeSingle()

      if (userError || !creatorUser?.id) {
        console.error('[Nearby][API][GroupCreate] Account validation failed:', userError)
        return NextResponse.json(
          { ok: false, message: 'Please create an account or sign in before creating a group.' },
          { status: 401 },
        )
      }

      creatorUserId = creatorUser.id
      creatorName = creatorUser.full_name ?? fallbackMemberName
      creatorPhone4 = creatorUser.phone_last4 ?? phoneLast4(creatorUser.phone_number ?? '')
    }

    if (!creatorPhone4) {
      console.error('[Nearby][API][GroupCreate] Missing creator phone details')
      return NextResponse.json(
        { ok: false, message: 'We could not complete this just now. Please try again.' },
        { status: 400 },
      )
    }

    const slug = slugify(groupName)

    let groupId = ''
    const createWithOwner = await supabase
      .from('groups')
      .insert({ name: groupName, slug, access_code: passcode, created_by_user_id: creatorUserId })
      .select('id')
      .single()

    if (createWithOwner.error?.message?.includes('created_by_user_id')) {
      const fallbackCreate = await supabase
        .from('groups')
        .insert({ name: groupName, slug, access_code: passcode })
        .select('id')
        .single()

      if (fallbackCreate.error || !fallbackCreate.data?.id) {
        console.error('[Nearby][API][GroupCreate] Group insert fallback failed:', fallbackCreate.error)
        return NextResponse.json(
          { ok: false, message: 'We could not save your changes. Please try again.' },
          { status: 500 },
        )
      }

      groupId = fallbackCreate.data.id
    } else if (createWithOwner.error || !createWithOwner.data?.id) {
      console.error('[Nearby][API][GroupCreate] Group insert failed:', createWithOwner.error)
      return NextResponse.json(
        { ok: false, message: 'We could not save your changes. Please try again.' },
        { status: 500 },
      )
    } else {
      groupId = createWithOwner.data.id
    }

    async function upsertMember(userId: string, displayName: string, last4: string, targetGroupId: string): Promise<string> {
      const existing = await supabase
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .eq('group_id', targetGroupId)
        .maybeSingle()

      if (existing.data?.id) return existing.data.id

      const inserted = await supabase
        .from('members')
        .insert({ display_name: displayName, group_id: targetGroupId, phone_last4: last4, user_id: userId })
        .select('id')
        .single()

      if (inserted.error || !inserted.data?.id) {
        throw inserted.error ?? new Error('Failed to create member')
      }

      return inserted.data.id
    }

    async function upsertUser(fullName: string, phone: string): Promise<string> {
      const cleanedPhone = phone.trim()
      const existing = await supabase
        .from('users')
        .select('id')
        .eq('phone_number', cleanedPhone)
        .maybeSingle()

      if (existing.data?.id) return existing.data.id

      const inserted = await supabase
        .from('users')
        .insert({
          full_name: fullName,
          phone_number: cleanedPhone,
          phone_last4: phoneLast4(cleanedPhone),
        })
        .select('id')
        .single()

      if (inserted.error || !inserted.data?.id) {
        throw inserted.error ?? new Error('Failed to create user')
      }

      return inserted.data.id
    }

    async function upsertMembership(userId: string, targetGroupId: string, memberId: string) {
      const membership = await supabase
        .from('group_memberships')
        .upsert({ user_id: userId, group_id: targetGroupId, member_id: memberId }, { onConflict: 'user_id,group_id' })

      if (membership.error) throw membership.error
    }

    try {
      const creatorMemberId = await upsertMember(creatorUserId, creatorName, creatorPhone4, groupId)
      await upsertMembership(creatorUserId, groupId, creatorMemberId)

      const validFriends = friends.filter((f) => f?.name?.trim() && f?.phone?.trim())
      for (const friend of validFriends) {
        const friendName = friend.name.trim()
        const friendPhone = friend.phone.trim()
        const friendUserId = await upsertUser(friendName, friendPhone)
        const friendMemberId = await upsertMember(friendUserId, friendName, phoneLast4(friendPhone), groupId)
        await upsertMembership(friendUserId, groupId, friendMemberId)
      }

      return NextResponse.json({
        ok: true,
        groupId,
        groupName,
        memberId: creatorMemberId,
        memberName: creatorName,
      })
    } catch (error) {
      console.error('[Nearby][API][GroupCreate] Membership/user insert failed:', error)
      return NextResponse.json(
        { ok: false, message: 'We could not save your changes. Please try again.' },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('[Nearby][API][GroupCreate] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, message: 'Something did not go through. Please try again.' },
      { status: 500 },
    )
  }
}
