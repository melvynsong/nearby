import { pbkdf2Sync, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient, getServiceRoleSupabaseClient } from '@/lib/server-supabase'

type GroupEntry = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

type LoginMethod = 'personal' | 'group'

function verifyPasscode(passcode: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(':')
  if (!salt || !hashHex) return false

  const candidate = pbkdf2Sync(passcode, salt, 120_000, 32, 'sha256')
  const expected = Buffer.from(hashHex, 'hex')

  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
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
    const last4 = typeof body?.last4 === 'string' ? body.last4.trim() : ''
    const method = (body?.method === 'personal' ? 'personal' : 'group') as LoginMethod
    const personalPasscode = typeof body?.personalPasscode === 'string' ? body.personalPasscode.trim() : ''
    const groupPasscode = typeof body?.groupPasscode === 'string' ? body.groupPasscode.trim() : ''

    if (!/^\d{4}$/.test(last4)) {
      return NextResponse.json({ ok: false, message: 'Enter the last 4 digits of your mobile.' }, { status: 400 })
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

      const usersResult = await supabase
        .from('users')
        .select('id, full_name, phone_number, phone_last4, has_personal_passcode, personal_passcode_hash, created_at')
        .eq('phone_last4', last4)
        .order('created_at', { ascending: false })
        .limit(10)

      if (usersResult.error) {
        console.error('[Nearby][API][Enter] users lookup failed:', usersResult.error)
        return NextResponse.json({ ok: false, message: 'We could not complete this just now. Please try again.' }, { status: 500 })
      }

      const users = (usersResult.data ?? []) as Array<{
        id: string
        full_name: string | null
        phone_number: string | null
        phone_last4: string | null
        has_personal_passcode: boolean | null
        personal_passcode_hash: string | null
      }>

      const matchedUser = users.find((u) => {
        if (!u.has_personal_passcode || !u.personal_passcode_hash) return false
        return verifyPasscode(personalPasscode, u.personal_passcode_hash)
      })

      if (!matchedUser) {
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
            phone4: matchedUser.phone_last4 ?? last4,
            phone: matchedUser.phone_number ?? '',
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
          phone4: matchedUser.phone_last4 ?? last4,
          phone: matchedUser.phone_number ?? '',
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
      .select('id, display_name, group_id, user_id')
      .eq('phone_last4', last4)

    if (membersResult.error) {
      console.error('[Nearby][API][Enter] members lookup failed:', membersResult.error)
      return NextResponse.json({ ok: false, message: 'We could not complete this just now. Please try again.' }, { status: 500 })
    }

    const members = (membersResult.data ?? []) as Array<{ id: string; display_name: string; group_id: string; user_id: string }>
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
        phone4: userResult.data?.phone_last4 ?? last4,
        phone: userResult.data?.phone_number ?? '',
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
