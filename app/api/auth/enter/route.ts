import { pbkdf2Sync, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient, getServiceRoleSupabaseClient } from '@/lib/server-supabase'
import { normalizePhoneNumber, phoneLast4 } from '@/lib/helpers'

type GroupEntry = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

type UserLoginRow = {
  id: string
  full_name: string | null
  phone_number: string | null
  phone_last4: string | null
  passcode_hash?: string | null
  personal_passcode_hash?: string | null
  personal_passcode?: string | null
}

type MembershipRow = {
  user_id: string
  group_id: string
  member_id: string | null
  status?: string | null
}

function getDb() {
  try {
    return getServiceRoleSupabaseClient()
  } catch {
    return getServerSupabaseClient()
  }
}

function verifyPasscode(passcode: string, stored: string): boolean {
  if (!stored.includes(':')) {
    return stored.trim() === passcode.trim()
  }

  const [salt, hashHex] = stored.split(':')
  if (!salt || !hashHex) return false

  const candidate = pbkdf2Sync(passcode, salt, 120_000, 32, 'sha256')
  const expected = Buffer.from(hashHex, 'hex')

  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

function matchesPersonalPasscode(user: UserLoginRow, inputPasscode: string): boolean {
  const normalizedInput = inputPasscode.trim()
  const hashed = (user.passcode_hash ?? user.personal_passcode_hash ?? '').trim()
  const raw = (user.personal_passcode ?? '').trim()

  if (hashed) {
    try {
      if (verifyPasscode(normalizedInput, hashed)) {
        return true
      }
    } catch (error) {
      console.error('[Login Error]', error)
    }
  }

  return raw.length > 0 && raw === normalizedInput
}

async function buildGroupEntriesForUser(userId: string): Promise<GroupEntry[]> {
  const supabase = getDb()

  const preferredMemberships = await supabase
    .from('group_memberships')
    .select('user_id, group_id, member_id, status')
    .eq('user_id', userId)
    .eq('status', 'active')

  let membershipsData = preferredMemberships.data as MembershipRow[] | null
  let membershipsError = preferredMemberships.error as { code?: string; message?: string } | null

  if (membershipsError?.code === '42703' || membershipsError?.code === 'PGRST204') {
    const fallbackMemberships = await supabase
      .from('group_memberships')
      .select('user_id, group_id, member_id')
      .eq('user_id', userId)

    membershipsData = fallbackMemberships.data as MembershipRow[] | null
    membershipsError = fallbackMemberships.error as { code?: string; message?: string } | null
  }

  if (membershipsError) {
    throw membershipsError
  }

  const memberships = membershipsData ?? []
  if (memberships.length === 0) return []

  const memberIds = memberships.map((row) => row.member_id).filter(Boolean) as string[]
  if (memberIds.length === 0) return []

  const membersResult = await supabase
    .from('members')
    .select('id, display_name, group_id')
    .in('id', memberIds)

  if (membersResult.error) {
    throw membersResult.error
  }

  const groupsResult = await supabase
    .from('groups')
    .select('id, name')
    .in('id', memberships.map((row) => row.group_id))

  if (groupsResult.error) {
    throw groupsResult.error
  }

  const members = (membersResult.data ?? []) as Array<{ id: string; display_name: string; group_id: string }>
  const groups = (groupsResult.data ?? []) as Array<{ id: string; name: string }>

  return memberships
    .map((membership) => {
      const member = members.find((m) => m.id === membership.member_id)
      const group = groups.find((g) => g.id === membership.group_id)
      if (!member || !group) return null
      return {
        memberId: member.id,
        memberName: member.display_name,
        groupId: group.id,
        groupName: group.name,
      }
    })
    .filter(Boolean) as GroupEntry[]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const phoneNumber = normalizePhoneNumber(typeof body?.phoneNumber === 'string' ? body.phoneNumber.trim() : '')
    const personalPasscode = typeof body?.personalPasscode === 'string' ? body.personalPasscode.trim() : ''

    console.log('[Auth]', {
      event: 'login_attempt',
      method: 'personal',
      phoneNumber,
      last4: phoneLast4(phoneNumber),
    })

    if (phoneNumber.length < 8) {
      return NextResponse.json({ ok: false, message: 'Enter your telephone number.' }, { status: 400 })
    }

    if (!personalPasscode) {
      return NextResponse.json({ ok: false, message: 'Enter your personal passcode.' }, { status: 400 })
    }

    const supabase = getDb()
    const lookupLast4 = phoneLast4(phoneNumber)

    const preferredUsersResult = await supabase
      .from('users')
      .select('id, full_name, phone_number, phone_last4, passcode_hash, personal_passcode_hash, personal_passcode, created_at')
      .eq('phone_last4', lookupLast4)
      .order('created_at', { ascending: false })
      .limit(10)

    let usersData = preferredUsersResult.data as UserLoginRow[] | null
    let usersError = preferredUsersResult.error as { code?: string; message?: string } | null

    if (usersError?.code === '42703' || usersError?.code === 'PGRST204') {
      const fallbackUsersResult = await supabase
        .from('users')
        .select('id, full_name, phone_number, phone_last4, personal_passcode_hash, personal_passcode, created_at')
        .eq('phone_last4', lookupLast4)
        .order('created_at', { ascending: false })
        .limit(10)

      usersData = fallbackUsersResult.data as UserLoginRow[] | null
      usersError = fallbackUsersResult.error as { code?: string; message?: string } | null
    }

    if (usersError) {
      console.error('[Login Error]', usersError)
      return NextResponse.json({ ok: false, message: 'We could not complete this just now. Please try again.' }, { status: 500 })
    }

    const users = usersData ?? []
    const phoneMatchedUsers = users.filter(
      (user) => normalizePhoneNumber(user.phone_number ?? '') === phoneNumber,
    )

    console.log('[DB Result]', {
      method: 'personal',
      count: phoneMatchedUsers.length,
      users: phoneMatchedUsers.map((user) => ({
        id: user.id,
        phone_matches: true,
        phone_last4: user.phone_last4,
        has_passcode_hash: Boolean((user.passcode_hash ?? user.personal_passcode_hash ?? '').trim()),
        has_raw: Boolean((user.personal_passcode ?? '').trim()),
      })),
    })

    const hasAnyStoredPersonalPasscode = phoneMatchedUsers.some((user) => {
      return Boolean((user.passcode_hash ?? user.personal_passcode_hash ?? '').trim() || (user.personal_passcode ?? '').trim())
    })

    if (phoneMatchedUsers.length > 0 && !hasAnyStoredPersonalPasscode) {
      return NextResponse.json(
        {
          ok: false,
          message: 'This account has not set a personal passcode yet. Set it in Settings first.',
        },
        { status: 403 },
      )
    }

    const matchedUser = phoneMatchedUsers.find((user) => matchesPersonalPasscode(user, personalPasscode))

    if (!matchedUser) {
      console.error('[Auth]', {
        event: 'login_failure',
        reason: 'passcode_mismatch',
        phoneNumber,
        candidateUserIds: phoneMatchedUsers.map((user) => user.id),
      })
      return NextResponse.json({ ok: false, message: 'Incorrect details.' }, { status: 401 })
    }

    const touchedOnboarded = await supabase
      .from('users')
      .update({
        onboarded: true,
        last_logged_in_at: new Date().toISOString(),
      })
      .eq('id', matchedUser.id)

    if (touchedOnboarded.error?.code === '42703' || touchedOnboarded.error?.code === 'PGRST204') {
      await supabase
        .from('users')
        .update({ last_logged_in_at: new Date().toISOString() })
        .eq('id', matchedUser.id)
    }

    const allGroups = await buildGroupEntriesForUser(matchedUser.id)

    console.log('[Routing]', {
      event: 'post_login_decision',
      userId: matchedUser.id,
      activeGroups: allGroups.length,
      destination: allGroups.length > 0 ? 'nearby' : 'group_entry',
    })

    if (allGroups.length === 0) {
      return NextResponse.json({
        ok: true,
        hasGroup: false,
        register: {
          userId: matchedUser.id,
          userName: matchedUser.full_name ?? 'Member',
          phone4: matchedUser.phone_last4 ?? lookupLast4,
          phone: matchedUser.phone_number ?? phoneNumber,
        },
      })
    }

    const primary = allGroups[0]
    console.log('[Auth]', { event: 'login_success', userId: matchedUser.id })

    // Set a custom session cookie for your login system
    const response = NextResponse.json({
      ok: true,
      hasGroup: true,
      register: {
        userId: matchedUser.id,
        userName: matchedUser.full_name ?? primary.memberName,
        phone4: matchedUser.phone_last4 ?? lookupLast4,
        phone: matchedUser.phone_number ?? phoneNumber,
      },
      session: {
        memberId: primary.memberId,
        memberName: primary.memberName,
        groupId: primary.groupId,
        groupName: primary.groupName,
        allGroups,
      },
    })
    // Set a cookie named custom_session with the user id (for demo; use JWT for production)
    response.cookies.set('custom_session', matchedUser.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })
    return response
  } catch (error) {
    console.error('[Login Error]', error)
    return NextResponse.json(
      { ok: false, message: 'Something did not go through. Please try again.' },
      { status: 500 },
    )
  }
}
