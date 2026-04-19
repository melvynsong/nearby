import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhoneNumber, phoneLast4, slugify } from '@/lib/helpers'
import { getServerSupabaseClient, getServiceRoleSupabaseClient, getUserSupabaseClient } from '@/lib/server-supabase'

type FriendInput = { name: string; phone: string }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const sessionMemberId = typeof body?.sessionMemberId === 'string' ? body.sessionMemberId : ''
    const requesterUserId = typeof body?.requesterUserId === 'string' ? body.requesterUserId : ''
    const requesterAuthUserId = typeof body?.requesterAuthUserId === 'string' ? body.requesterAuthUserId : ''
    const requesterProfileName = typeof body?.requesterProfileName === 'string' ? body.requesterProfileName.trim() : ''
    const requesterProfilePhone = typeof body?.requesterProfilePhone === 'string' ? body.requesterProfilePhone.trim() : ''
    const fallbackMemberName = typeof body?.fallbackMemberName === 'string' ? body.fallbackMemberName : ''
    const groupName = typeof body?.groupName === 'string' ? body.groupName.trim() : ''
    const groupTitle = typeof body?.groupTitle === 'string' ? body.groupTitle.trim() : ''
    const groupVisibility = body?.groupVisibility === 'private' ? 'private' : 'public'
    const passcode = typeof body?.passcode === 'string' ? body.passcode.trim() : ''
    const friends = Array.isArray(body?.friends) ? (body.friends as FriendInput[]) : []

    const authHeader = request.headers.get('authorization') ?? ''
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : ''

    let verifiedAuthUserId = ''
    if (bearerToken) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (url && anonKey) {
        const authClient = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        const { data: authUserResult, error: authUserError } = await authClient.auth.getUser(bearerToken)
        verifiedAuthUserId = authUserResult.user?.id ?? ''
        console.log('[Nearby][API][GroupCreate] auth token verification:', {
          verifiedAuthUserId,
          hasError: !!authUserError,
          errorMessage: authUserError?.message ?? null,
        })
      }
    }

    if (verifiedAuthUserId && requesterAuthUserId && verifiedAuthUserId !== requesterAuthUserId) {
      console.warn('[Nearby][API][GroupCreate] blocked: requester auth user mismatch', {
        verifiedAuthUserId,
        requesterAuthUserId,
      })
      return NextResponse.json(
        { ok: false, message: 'Your sign-in session did not match this request. Please sign in again.' },
        { status: 401 },
      )
    }

    const effectiveAuthUserId = verifiedAuthUserId || requesterAuthUserId

    if (!sessionMemberId && !requesterUserId && requesterAuthUserId && !verifiedAuthUserId) {
      console.warn('[Nearby][API][GroupCreate] blocked: auth user id provided without verifiable auth token')
      return NextResponse.json(
        { ok: false, message: 'Your sign-in session is missing or expired. Please sign in again.' },
        { status: 401 },
      )
    }

    if (!sessionMemberId && !requesterUserId && !effectiveAuthUserId) {
      console.warn('[Nearby][API][GroupCreate] blocked: no auth identity provided')
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

    const serverSupabase = getServerSupabaseClient()
    const serviceSupabase = (() => {
      try {
        return getServiceRoleSupabaseClient()
      } catch (error) {
        console.warn('[Nearby][API][GroupCreate] service role unavailable:', error)
        return null
      }
    })()
    // Use a user-scoped client for public.users profile reads/writes so RLS
    // (auth.uid() = id) is satisfied without requiring service-role locally.
    const profileSupabase = bearerToken ? getUserSupabaseClient(bearerToken) : serverSupabase

    let creatorUserId = ''
    let creatorName = fallbackMemberName
    let creatorPhoneNumber = ''
    let creatorPhone4 = ''

    if (sessionMemberId) {
      const { data: creatorMember, error: creatorError } = await serverSupabase
        .from('members')
        .select('id, user_id, display_name, phone_number, phone_last4, users ( phone_number )')
        .eq('id', sessionMemberId)
        .maybeSingle()

      console.log('[Nearby][API][GroupCreate] creator member lookup:', {
        sessionMemberId,
        hasMember: !!creatorMember?.id,
        creatorUserId: creatorMember?.user_id ?? null,
        hasError: !!creatorError,
      })

      if (creatorError || !creatorMember?.user_id) {
        console.error('[Nearby][API][GroupCreate] Session validation failed:', creatorError)
        return NextResponse.json(
          { ok: false, message: 'Your group session is invalid. Please sign in again.' },
          { status: 401 },
        )
      }

      creatorUserId = creatorMember.user_id as string
      creatorName = (creatorMember.display_name as string | null) ?? fallbackMemberName
      const creatorPhone = (creatorMember.phone_number as string | null) ?? (creatorMember.users as { phone_number?: string } | null)?.phone_number ?? ''
      creatorPhoneNumber = normalizePhoneNumber(creatorPhone)
      creatorPhone4 = (creatorMember.phone_last4 as string | null) ?? phoneLast4(creatorPhone)
    } else {
      const requestedUserId = requesterUserId || effectiveAuthUserId
      const { data: creatorUser, error: userError } = await profileSupabase
        .from('users')
        .select('id, full_name, phone_number, phone_last4')
        .eq('id', requestedUserId)
        .maybeSingle()

      console.log('[Nearby][API][GroupCreate] profile lookup:', {
        requestedUserId,
        hasProfileRow: !!creatorUser?.id,
        hasError: !!userError,
      })

      if (userError) {
        console.error('[Nearby][API][GroupCreate] Account validation failed:', userError)
        return NextResponse.json(
          { ok: false, message: 'We could not verify your profile. Please try again.' },
          { status: 500 },
        )
      }

      if (creatorUser?.id) {
        creatorUserId = creatorUser.id
        creatorName = creatorUser.full_name ?? fallbackMemberName
        creatorPhoneNumber = normalizePhoneNumber(creatorUser.phone_number ?? '')
        creatorPhone4 = creatorUser.phone_last4 ?? phoneLast4(creatorUser.phone_number ?? '')
      } else if (effectiveAuthUserId) {
        const profileName = requesterProfileName || fallbackMemberName || 'Member'
        const profilePhone = normalizePhoneNumber(requesterProfilePhone)

        if (!profilePhone) {
          console.warn('[Nearby][API][GroupCreate] blocked: auth user has no profile row and no phone hint', {
            effectiveAuthUserId,
          })
          return NextResponse.json(
            { ok: false, message: 'Your profile is missing a phone number. Please complete registration details first.' },
            { status: 400 },
          )
        }

        const { data: insertedProfile, error: insertProfileError } = await profileSupabase
          .from('users')
          .upsert({
            id: effectiveAuthUserId,
            full_name: profileName,
            phone_number: profilePhone,
            phone_last4: phoneLast4(profilePhone),
          }, { onConflict: 'id' })
          .select('id, full_name, phone_number, phone_last4')
          .single()

        console.log('[Nearby][API][GroupCreate] profile upsert for authenticated user:', {
          effectiveAuthUserId,
          hasProfile: !!insertedProfile?.id,
          hasError: !!insertProfileError,
        })

        if (insertProfileError || !insertedProfile?.id) {
          console.error('[Nearby][API][GroupCreate] Profile upsert failed:', insertProfileError)
          return NextResponse.json(
            { ok: false, message: 'We found your account, but could not complete your profile setup. Please try again.' },
            { status: 500 },
          )
        }

        creatorUserId = insertedProfile.id
        creatorName = insertedProfile.full_name ?? profileName
        creatorPhoneNumber = normalizePhoneNumber(insertedProfile.phone_number ?? profilePhone)
        creatorPhone4 = insertedProfile.phone_last4 ?? phoneLast4(profilePhone)
      } else {
        console.warn('[Nearby][API][GroupCreate] blocked: no authenticated user for profile branch')
        return NextResponse.json(
          { ok: false, message: 'Please create an account or sign in before creating a group.' },
          { status: 401 },
        )
      }
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
    const createWithOwner = await serverSupabase
      .from('groups')
      .insert({
        name: groupName,
        title: groupTitle || groupName,
        slug,
        access_code: passcode,
        visibility: groupVisibility,
        created_by_user_id: creatorUserId,
      })
      .select('id')
      .single()

    if (createWithOwner.error?.message?.includes('created_by_user_id')) {
      const fallbackCreate = await serverSupabase
        .from('groups')
        .insert({ name: groupName, title: groupTitle || groupName, slug, access_code: passcode, visibility: groupVisibility })
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

    async function upsertMember(userId: string, displayName: string, phoneNumber: string, last4: string, targetGroupId: string): Promise<string> {
      const existing = await serverSupabase
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .eq('group_id', targetGroupId)
        .maybeSingle()

      if (existing.data?.id) return existing.data.id

      const inserted = await serverSupabase
        .from('members')
        .insert({ display_name: displayName, group_id: targetGroupId, phone_number: phoneNumber, phone_last4: last4, user_id: userId })
        .select('id')
        .single()

      if (inserted.error?.code === '42703') {
        const fallbackInserted = await serverSupabase
          .from('members')
          .insert({ display_name: displayName, group_id: targetGroupId, phone_last4: last4, user_id: userId })
          .select('id')
          .single()

        if (fallbackInserted.error || !fallbackInserted.data?.id) {
          throw fallbackInserted.error ?? new Error('Failed to create member')
        }

        return fallbackInserted.data.id
      }

      if (inserted.error || !inserted.data?.id) {
        throw inserted.error ?? new Error('Failed to create member')
      }

      return inserted.data.id
    }

    async function upsertUser(fullName: string, phone: string): Promise<string> {
      const cleanedPhone = normalizePhoneNumber(phone)
      const usersClient = serviceSupabase ?? profileSupabase

      const existing = await usersClient
        .from('users')
        .select('id')
        .eq('phone_number', cleanedPhone)
        .maybeSingle()

      if (existing.data?.id) return existing.data.id

      const inserted = await usersClient
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

    async function upsertMembership(userId: string, targetGroupId: string, memberId: string, role: 'owner' | 'member') {
      const preferredMembership = await serverSupabase
        .from('group_memberships')
        .upsert({
          individual_id: userId,
          user_id: userId,
          group_id: targetGroupId,
          member_id: memberId,
          role,
          status: 'active',
          group_onboarded: true,
          requested_at: new Date().toISOString(),
          approved_at: new Date().toISOString(),
          approved_by: creatorUserId,
        }, { onConflict: 'user_id,group_id' })

      let membershipError = preferredMembership.error

      if (membershipError?.code === '42703' || membershipError?.code === 'PGRST204') {
        const fallbackMembership = await serverSupabase
          .from('group_memberships')
          .upsert({ user_id: userId, group_id: targetGroupId, member_id: memberId }, { onConflict: 'user_id,group_id' })

        membershipError = fallbackMembership.error
      }

      if (membershipError) throw membershipError
    }

    try {
      const creatorMemberId = await upsertMember(creatorUserId, creatorName, creatorPhoneNumber, creatorPhone4, groupId)
      await upsertMembership(creatorUserId, groupId, creatorMemberId, 'owner')

      const validFriends = friends.filter((f) => f?.name?.trim() && f?.phone?.trim())
      for (const friend of validFriends) {
        const friendName = friend.name.trim()
        const friendPhone = normalizePhoneNumber(friend.phone)
        const friendUserId = await upsertUser(friendName, friendPhone)
        const friendMemberId = await upsertMember(friendUserId, friendName, friendPhone, phoneLast4(friendPhone), groupId)
        await upsertMembership(friendUserId, groupId, friendMemberId, 'member')
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

      const message = typeof (error as { message?: string } | null)?.message === 'string'
        ? (error as { message: string }).message
        : ''
      const likelyRlsFailure = /row-level security|permission denied|rls|insufficient/i.test(message)

      return NextResponse.json(
        {
          ok: false,
          message: likelyRlsFailure
            ? 'Friend save requires server configuration. Please set SUPABASE_SERVICE_ROLE_KEY and try again.'
            : 'We could not save your changes. Please try again.',
        },
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
