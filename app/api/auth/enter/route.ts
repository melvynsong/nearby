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

type LoginMethod = 'personal' | 'group'

type UserLoginRow = {
  id: string
  full_name: string | null
  phone_number: string | null
  phone_last4: string | null
  has_personal_passcode: boolean | null
  personal_passcode_hash: string | null
  personal_passcode?: string | null
}

type GroupMemberLoginRow = {
  id: string
  display_name: string
  group_id: string
  user_id: string
  phone_number?: string | null
  users?: {
    phone_number?: string | null
  } | null
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
  const hashed = user.personal_passcode_hash?.trim() ?? ''
  const raw = user.personal_passcode?.trim() ?? ''

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
  const supabase = getServerSupabaseClient()

  const membersResult = await supabase
    .from('members')
    .select('id, display_name, group_id')
    .eq('user_id', userId)

  if (membersResult.error) {
    throw membersResult.error
  }

  const members = (membersResult.data ?? []) as Array<{ id: string; display_name: string; group_id: string }>
  if (members.length === 0) return []

  const groupIds = members.map((m) => m.group_id)
  const groupsResult = await supabase
    .from('groups')
    .select('id, name')
    .in('id', groupIds)

  if (groupsResult.error) {
    throw groupsResult.error
  }

  const groups = (groupsResult.data ?? []) as Array<{ id: string; name: string }>

  return members
    .map((m) => {
      const g = groups.find((x) => x.id === m.group_id)
      if (!g) return null
      return {
        memberId: m.id,
        memberName: m.display_name,
        groupId: g.id,
        groupName: g.name,
      }
    })
    .filter(Boolean) as GroupEntry[]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const phoneNumberInput = typeof body?.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
    const phoneNumber = normalizePhoneNumber(phoneNumberInput)
    const method = (body?.method === 'personal' ? 'personal' : 'group') as LoginMethod
    const personalPasscode = typeof body?.personalPasscode === 'string' ? body.personalPasscode.trim() : ''
    const groupPasscode = typeof body?.groupPasscode === 'string' ? body.groupPasscode.trim() : ''
    const lookupLast4 = phoneLast4(phoneNumber)

    console.log('[Login Attempt]', {
      method,
      phoneNumber,
      last4: lookupLast4,
      passcode: method === 'personal' ? personalPasscode : groupPasscode,
    })

    if (phoneNumber.length < 8) {
      return NextResponse.json({ ok: false, message: 'Enter your telephone number.' }, { status: 400 })
    }

    let supabase = getServerSupabaseClient()
    try {
      supabase = getServiceRoleSupabaseClient()
    } catch (error) {
      console.error('[Nearby][API][Enter] service role unavailable:', error)
      return NextResponse.json(
        { ok: false, message: 'Server setup is incomplete. Please contact support.' },
        { status: 500 },
      )
    }

    if (method === 'personal') {
      if (!personalPasscode) {
        return NextResponse.json({ ok: false, message: 'Enter your personal passcode.' }, { status: 400 })
      }

      const preferredUsersResult = await supabase
        .from('users')
        .select('id, full_name, phone_number, phone_last4, has_personal_passcode, personal_passcode_hash, personal_passcode, created_at')
        .eq('phone_last4', lookupLast4)
        .order('created_at', { ascending: false })
        .limit(10)

      let usersData = preferredUsersResult.data as UserLoginRow[] | null
      let usersError = preferredUsersResult.error as { code?: string; message?: string } | null

      if (usersError?.code === '42703') {
        const fallbackUsersResult = await supabase
          .from('users')
          .select('id, full_name, phone_number, phone_last4, has_personal_passcode, personal_passcode_hash, created_at')
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
      console.log('[DB Result]', {
        method,
        count: users.length,
        users: users.map((user) => ({
          id: user.id,
          phone_matches: normalizePhoneNumber(user.phone_number ?? '') === phoneNumber,
          phone_last4: user.phone_last4,
          has_personal_passcode: user.has_personal_passcode,
          has_hash: Boolean(user.personal_passcode_hash),
          hash_format: user.personal_passcode_hash?.includes(':') ? 'pbkdf2' : user.personal_passcode_hash ? 'legacy-plain-or-unknown' : 'missing',
          has_raw: Boolean(user.personal_passcode),
        })),
      })

      const phoneMatchedUsers = users.filter(
        (user) => normalizePhoneNumber(user.phone_number ?? '') === phoneNumber,
      )

      const hasAnyStoredPersonalPasscode = phoneMatchedUsers.some((user) => {
        return Boolean(user.personal_passcode_hash?.trim() || user.personal_passcode?.trim())
      })

      if (phoneMatchedUsers.length > 0 && !hasAnyStoredPersonalPasscode) {
        return NextResponse.json(
          {
            ok: false,
            message: 'This account has not set a personal passcode yet. Sign in with your group passcode first, then set a personal passcode in Settings.',
          },
          { status: 403 },
        )
      }

      const matchedUser = phoneMatchedUsers.find((user) => {
        return matchesPersonalPasscode(user, personalPasscode)
      })

      if (!matchedUser) {
        console.error('[Login Error]', {
          message: 'Personal passcode mismatch',
          phoneNumber,
          last4: lookupLast4,
          candidateUserIds: users.map((user) => user.id),
        })
        return NextResponse.json({ ok: false, message: 'Incorrect details.' }, { status: 401 })
      }

      const allGroups = await buildGroupEntriesForUser(matchedUser.id)

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
      return NextResponse.json({
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
    }

    if (!groupPasscode) {
      return NextResponse.json({ ok: false, message: 'Enter your group passcode.' }, { status: 400 })
    }

    const membersResult = await supabase
      .from('members')
      .select('id, display_name, group_id, user_id, phone_number, users ( phone_number )')
      .eq('phone_last4', lookupLast4)

    let membersData = membersResult.data as GroupMemberLoginRow[] | null
    let membersError = membersResult.error as { code?: string; message?: string } | null

    if (membersError?.code === '42703') {
      const fallbackMembersResult = await supabase
        .from('members')
        .select('id, display_name, group_id, user_id, users ( phone_number )')
        .eq('phone_last4', lookupLast4)

      membersData = fallbackMembersResult.data as GroupMemberLoginRow[] | null
      membersError = fallbackMembersResult.error as { code?: string; message?: string } | null
    }

    console.log('[DB Result]', {
      method,
      count: (membersData ?? []).length,
      members: (membersData ?? []).map((member) => ({
        id: member.id,
        user_id: member.user_id,
        phone_matches: normalizePhoneNumber(member.phone_number ?? member.users?.phone_number ?? '') === phoneNumber,
      })),
    })

    if (membersError) {
      console.error('[Nearby][API][Enter] members lookup failed:', membersError)
      return NextResponse.json({ ok: false, message: 'We could not complete this just now. Please try again.' }, { status: 500 })
    }

    const members = (membersData ?? [])
      .filter((member) => normalizePhoneNumber(member.phone_number ?? member.users?.phone_number ?? '') === phoneNumber)

    if (members.length === 0) {
      return NextResponse.json({ ok: false, message: 'Incorrect details.' }, { status: 401 })
    }

    const groupIds = members.map((m) => m.group_id)
    const groupsResult = await supabase
      .from('groups')
      .select('id, name, access_code')
      .in('id', groupIds)

    if (groupsResult.error) {
      console.error('[Nearby][API][Enter] groups lookup failed:', groupsResult.error)
      return NextResponse.json({ ok: false, message: 'We could not complete this just now. Please try again.' }, { status: 500 })
    }

    const groups = (groupsResult.data ?? []) as Array<{ id: string; name: string; access_code: string }>

    let matched: { memberId: string; memberName: string; groupId: string; groupName: string; userId: string } | null = null
    for (const member of members) {
      const group = groups.find((g) => g.id === member.group_id)
      if (!group || group.access_code !== groupPasscode) continue
      matched = {
        memberId: member.id,
        memberName: member.display_name,
        groupId: group.id,
        groupName: group.name,
        userId: member.user_id,
      }
      break
    }

    if (!matched) {
      return NextResponse.json({ ok: false, message: 'Incorrect details.' }, { status: 401 })
    }

    const userResult = await supabase
      .from('users')
      .select('id, full_name, phone_number, phone_last4')
      .eq('id', matched.userId)
      .maybeSingle()

    const allGroups = await buildGroupEntriesForUser(matched.userId)

    return NextResponse.json({
      ok: true,
      hasGroup: true,
      register: {
        userId: matched.userId,
        userName: userResult.data?.full_name ?? matched.memberName,
        phone4: userResult.data?.phone_last4 ?? lookupLast4,
        phone: userResult.data?.phone_number ?? phoneNumber,
      },
      session: {
        memberId: matched.memberId,
        memberName: matched.memberName,
        groupId: matched.groupId,
        groupName: matched.groupName,
        allGroups,
      },
    })
  } catch (error) {
    console.error('[Nearby][API][Enter] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, message: 'Something did not go through. Please try again.' },
      { status: 500 },
    )
  }
}
