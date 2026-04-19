import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient, getServiceRoleSupabaseClient } from '@/lib/server-supabase'

type GroupEntry = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

function getDb() {
  try {
    return getServiceRoleSupabaseClient()
  } catch {
    return getServerSupabaseClient()
  }
}

async function buildGroupEntriesForUser(userId: string): Promise<GroupEntry[]> {
  const supabase = getDb()

  const membersResult = await supabase
    .from('members')
    .select('id, display_name, group_id')
    .eq('user_id', userId)

  if (membersResult.error) {
    throw membersResult.error
  }

  const members = (membersResult.data ?? []) as Array<{ id: string; display_name: string; group_id: string }>
  if (members.length === 0) return []

  const groupsResult = await supabase
    .from('groups')
    .select('id, name')
    .in('id', members.map((member) => member.group_id))

  if (groupsResult.error) {
    throw groupsResult.error
  }

  const groups = (groupsResult.data ?? []) as Array<{ id: string; name: string }>

  return members
    .map((member) => {
      const group = groups.find((item) => item.id === member.group_id)
      if (!group) return null
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
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''

    if (!userId) {
      return NextResponse.json({ ok: false, message: 'userId required' }, { status: 400 })
    }

    const supabase = getDb()
    const userResult = await supabase
      .from('users')
      .select('id, full_name, phone_number, phone_last4')
      .eq('id', userId)
      .maybeSingle()

    if (userResult.error || !userResult.data?.id) {
      console.error('[Nearby][API][RestoreSession] user lookup failed:', userResult.error)
      return NextResponse.json({ ok: false, message: 'Could not restore your session.' }, { status: 404 })
    }

    const allGroups = await buildGroupEntriesForUser(userId)
    const primary = allGroups[0] ?? null

    return NextResponse.json({
      ok: true,
      register: {
        userId: userResult.data.id,
        userName: userResult.data.full_name ?? 'Member',
        phone4: userResult.data.phone_last4 ?? '',
        phone: userResult.data.phone_number ?? '',
      },
      hasGroup: allGroups.length > 0,
      session: primary
        ? {
            memberId: primary.memberId,
            memberName: primary.memberName,
            groupId: primary.groupId,
            groupName: primary.groupName,
            allGroups,
          }
        : null,
    })
  } catch (error) {
    console.error('[Nearby][API][RestoreSession] unexpected error:', error)
    return NextResponse.json({ ok: false, message: 'Could not restore your session.' }, { status: 500 })
  }
}