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
      .select('id, name, title, access_code, visibility')
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
      })
    }

    if (groupResult.error || !groupResult.data?.id) {
      return NextResponse.json({ ok: false, message: 'Could not load group settings.' }, { status: 404 })
    }

    const group = groupResult.data as { id: string; name: string; title?: string | null; access_code: string; visibility?: 'public' | 'private' | null }

    const pendingPreferred = await supabase
      .from('group_memberships')
      .select('id, user_id, requested_at, member_id')
      .eq('group_id', groupId)
      .eq('status', 'pending')

    const pendingRows = pendingPreferred.error?.code === '42703' || pendingPreferred.error?.code === 'PGRST204'
      ? []
      : (pendingPreferred.data ?? [])

    const membersResult = await supabase
      .from('members')
      .select('id, display_name, user_id')
      .eq('group_id', groupId)

    const usersResult = await supabase
      .from('users')
      .select('id, full_name, phone_number')
      .in('id', ((membersResult.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id))

    const members = (membersResult.data ?? []) as Array<{ id: string; display_name: string; user_id: string }>
    const users = (usersResult.data ?? []) as Array<{ id: string; full_name: string | null; phone_number: string | null }>

    const pending = pendingRows.map((row: any) => {
      const member = members.find((m) => m.id === row.member_id)
      const user = users.find((u) => u.id === row.user_id)
      return {
        id: row.id,
        userId: row.user_id,
        requestedAt: row.requested_at,
        name: member?.display_name ?? user?.full_name ?? 'Member',
        phoneNumber: user?.phone_number ?? '',
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
      pending,
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
