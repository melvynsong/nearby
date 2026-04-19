import { NextRequest, NextResponse } from 'next/server'
import { normalizePhoneNumber } from '@/lib/helpers'
import { getServerSupabaseClient } from '@/lib/server-supabase'

async function hasActiveMembership(groupId: string, userId: string): Promise<boolean> {
  const supabase = getServerSupabaseClient()

  const preferred = await supabase
    .from('group_memberships')
    .select('user_id, status')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (preferred.error?.code === '42703' || preferred.error?.code === 'PGRST204') {
    const fallback = await supabase
      .from('group_memberships')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
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
    const phoneInput = typeof body?.phoneNumber === 'string' ? body.phoneNumber : ''
    const phoneNumber = normalizePhoneNumber(phoneInput)

    if (!groupId || !requesterUserId || !phoneNumber) {
      return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 })
    }

    if (phoneNumber.length < 8) {
      return NextResponse.json({ ok: false, message: 'Enter a valid phone number.' }, { status: 400 })
    }

    const supabase = getServerSupabaseClient()

    const canManage = await hasActiveMembership(groupId, requesterUserId)
    if (!canManage) {
      return NextResponse.json({ ok: false, message: 'Only active members can invite.' }, { status: 403 })
    }

    const groupResult = await supabase
      .from('groups')
      .select('id, visibility')
      .eq('id', groupId)
      .maybeSingle()

    if (groupResult.error || !groupResult.data?.id) {
      return NextResponse.json({ ok: false, message: 'Group not found.' }, { status: 404 })
    }

    if ((groupResult.data.visibility ?? 'public') !== 'private') {
      return NextResponse.json({ ok: false, message: 'Invites are only needed for private groups.' }, { status: 400 })
    }

    const upsertResult = await supabase
      .from('group_invites')
      .upsert({
        group_id: groupId,
        phone_number: phoneNumber,
        invited_by: requesterUserId,
        status: 'invited',
        joined_at: null,
      }, { onConflict: 'group_id,phone_number' })

    if (upsertResult.error?.code === '42P01' || upsertResult.error?.code === '42703' || upsertResult.error?.code === 'PGRST204') {
      return NextResponse.json({ ok: false, message: 'Invites are not configured yet in this environment.' }, { status: 500 })
    }

    if (upsertResult.error) {
      console.error('[GroupInvites] upsert failed:', upsertResult.error)
      return NextResponse.json({ ok: false, message: 'Could not save invite.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, phoneNumber })
  } catch (error) {
    console.error('[GroupInvites] unexpected error:', error)
    return NextResponse.json({ ok: false, message: 'Could not save invite.' }, { status: 500 })
  }
}
