import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

async function ensureActiveMembership(groupId: string, requesterUserId: string): Promise<boolean> {
  const supabase = getServerSupabaseClient()

  const preferred = await supabase
    .from('group_memberships')
    .select('user_id, status')
    .eq('group_id', groupId)
    .eq('user_id', requesterUserId)
    .eq('status', 'active')
    .maybeSingle()

  if (preferred.error?.code === '42703' || preferred.error?.code === 'PGRST204') {
    const fallback = await supabase
      .from('group_memberships')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', requesterUserId)
      .maybeSingle()
    return !!fallback.data?.user_id
  }

  return !!preferred.data?.user_id
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const groupId = typeof body?.groupId === 'string' ? body.groupId : ''
    const requesterUserId = typeof body?.requesterUserId === 'string' ? body.requesterUserId : ''

    if (!groupId || !requesterUserId) {
      return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 })
    }

    const activeMember = await ensureActiveMembership(groupId, requesterUserId)
    if (!activeMember) {
      return NextResponse.json({ ok: false, message: 'Only active members can view group settings.' }, { status: 403 })
    }

    const supabase = getServerSupabaseClient()
    const groupResult = await supabase
      .from('groups')
      .select('id, name, title, access_code, visibility, created_by_user_id')
      .eq('id', groupId)
      .maybeSingle()

    if (groupResult.error?.code === '42703' || groupResult.error?.code === 'PGRST204') {
      const fallbackGroupResult = await supabase
        .from('groups')
        .select('id, name, access_code')
        .eq('id', groupId)
        .maybeSingle()

      if (fallbackGroupResult.error || !fallbackGroupResult.data?.id) {
        return NextResponse.json({ ok: false, message: 'Could not load group settings.' }, { status: 404 })
      }

      return NextResponse.json({
        ok: true,
        group: {
          id: fallbackGroupResult.data.id,
          name: fallbackGroupResult.data.name,
          title: fallbackGroupResult.data.name,
          passcode: fallbackGroupResult.data.access_code,
          visibility: 'public',
        },
        requesterRole: 'member',
        members: [],
        invites: [],
      })
    }

    if (groupResult.error || !groupResult.data?.id) {
      return NextResponse.json({ ok: false, message: 'Could not load group settings.' }, { status: 404 })
    }

    const group = groupResult.data as {
      id: string
      name: string
      title?: string | null
      access_code: string
      visibility?: 'public' | 'private' | null
      created_by_user_id?: string | null
    }

    const preferredMemberships = await supabase
      .from('group_memberships')
      .select('user_id, status, role')
      .eq('group_id', groupId)
      .eq('status', 'active')

    let activeMemberships = (preferredMemberships.data ?? []) as Array<{ user_id: string; status?: string | null; role?: string | null }>
    if (preferredMemberships.error?.code === '42703' || preferredMemberships.error?.code === 'PGRST204') {
      const fallbackMemberships = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', groupId)
      activeMemberships = ((fallbackMemberships.data ?? []) as Array<{ user_id: string }>).map((row) => ({
        user_id: row.user_id,
        status: 'active',
        role: 'member',
      }))
    }

    const activeUserIds = Array.from(new Set(activeMemberships.map((row) => row.user_id).filter(Boolean)))

    const membersResult = await supabase
      .from('members')
      .select('id, display_name, user_id, phone_number, phone_last4')
      .eq('group_id', groupId)
      .in('user_id', activeUserIds.length > 0 ? activeUserIds : [''])

    const usersResult = await supabase
      .from('users')
      .select('id, full_name, phone_number')
      .in('id', activeUserIds.length > 0 ? activeUserIds : [''])

    const members = (membersResult.data ?? []) as Array<{ id: string; display_name: string; user_id: string; phone_number?: string | null; phone_last4?: string | null }>
    const users = (usersResult.data ?? []) as Array<{ id: string; full_name: string | null; phone_number: string | null }>

    const membersByUserId = new Map(members.map((member) => [member.user_id, member]))
    const usersById = new Map(users.map((user) => [user.id, user]))
    const membershipsByUserId = new Map(activeMemberships.map((membership) => [membership.user_id, membership]))

    const ownerUserId = group.created_by_user_id ?? ''
    const normalizedMembers = activeUserIds
      .map((userId) => {
        const member = membersByUserId.get(userId)
        const user = usersById.get(userId)
        const membership = membershipsByUserId.get(userId)
        const phoneNumber = user?.phone_number ?? member?.phone_number ?? member?.phone_last4 ?? ''
        const membershipRole = membership?.role === 'owner' || membership?.role === 'member'
          ? membership.role
          : null
        return {
          userId,
          memberId: member?.id ?? '',
          name: member?.display_name ?? user?.full_name ?? 'Member',
          phoneNumber,
          role: membershipRole ?? (ownerUserId && ownerUserId === userId ? 'owner' : 'member'),
        }
      })
      .filter((row) => row.memberId)

    const invitesResult = await supabase
      .from('group_invites')
      .select('id, phone_number, status, created_at, joined_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })

    const invites = (invitesResult.error?.code === '42P01' || invitesResult.error?.code === '42703' || invitesResult.error?.code === 'PGRST204')
      ? []
      : ((invitesResult.data ?? []) as Array<{ id: string; phone_number: string; status: 'invited' | 'joined'; created_at: string; joined_at: string | null }>)

    const invitesWithNames = invites.map((invite) => {
      const joinedMember = normalizedMembers.find((member) => member.phoneNumber === invite.phone_number)
      return {
        id: invite.id,
        phoneNumber: invite.phone_number,
        status: invite.status,
        name: joinedMember?.name ?? '',
        createdAt: invite.created_at,
        joinedAt: invite.joined_at,
      }
    })

    return NextResponse.json({
      ok: true,
      group: {
        id: group.id,
        name: group.name,
        title: group.title ?? group.name,
        passcode: group.access_code,
        visibility: group.visibility ?? 'public',
      },
      requesterRole: ownerUserId && ownerUserId === requesterUserId ? 'owner' : 'member',
      members: normalizedMembers,
      invites: invitesWithNames,
    })
  } catch (error) {
    console.error('[Group] settings read error:', error)
    return NextResponse.json({ ok: false, message: 'Could not load group settings.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const groupId = typeof body?.groupId === 'string' ? body.groupId : ''
    const requesterUserId = typeof body?.requesterUserId === 'string' ? body.requesterUserId : ''
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const passcode = typeof body?.passcode === 'string' ? body.passcode.trim() : ''
    const visibility = body?.visibility === 'private' ? 'private' : 'public'

    if (!groupId || !requesterUserId || !name || !passcode) {
      return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 })
    }

    const activeMember = await ensureActiveMembership(groupId, requesterUserId)
    if (!activeMember) {
      return NextResponse.json({ ok: false, message: 'Only active members can update group settings.' }, { status: 403 })
    }

    const supabase = getServerSupabaseClient()
    const preferredUpdate = await supabase
      .from('groups')
      .update({
        name,
        title: title || name,
        access_code: passcode,
        visibility,
      })
      .eq('id', groupId)

    let updateError = preferredUpdate.error

    if (updateError?.code === '42703' || updateError?.code === 'PGRST204') {
      const fallbackUpdate = await supabase
        .from('groups')
        .update({
          name,
          access_code: passcode,
        })
        .eq('id', groupId)

      updateError = fallbackUpdate.error
    }

    if (updateError) {
      console.error('[Group] settings update failed:', updateError)
      return NextResponse.json({ ok: false, message: 'Could not update group settings.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Group] settings update error:', error)
    return NextResponse.json({ ok: false, message: 'Could not update group settings.' }, { status: 500 })
  }
}
