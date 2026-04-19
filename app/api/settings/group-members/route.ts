import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

type Action = 'promote_member' | 'promote_owner' | 'remove'

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
    const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId : ''
    const action = typeof body?.action === 'string' ? body.action as Action : ''

    if (!groupId || !requesterUserId || !targetUserId || !action) {
      return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 })
    }

    const supabase = getServerSupabaseClient()

    const canManage = await hasActiveMembership(groupId, requesterUserId)
    if (!canManage) {
      return NextResponse.json({ ok: false, message: 'Only active members can manage people.' }, { status: 403 })
    }

    const groupResult = await supabase
      .from('groups')
      .select('id, created_by_user_id')
      .eq('id', groupId)
      .maybeSingle()

    if (groupResult.error || !groupResult.data?.id) {
      return NextResponse.json({ ok: false, message: 'Group not found.' }, { status: 404 })
    }

    const ownerUserId = groupResult.data.created_by_user_id ?? ''
    const requesterIsOwner = ownerUserId === requesterUserId
    const targetIsOwner = ownerUserId === targetUserId

    if (action === 'promote_owner') {
      if (!requesterIsOwner) {
        return NextResponse.json({ ok: false, message: 'Only the owner can promote another owner.' }, { status: 403 })
      }

      const targetActive = await hasActiveMembership(groupId, targetUserId)
      if (!targetActive) {
        return NextResponse.json({ ok: false, message: 'Target user must already be in this group.' }, { status: 400 })
      }

      const ownerUpdate = await supabase
        .from('groups')
        .update({ created_by_user_id: targetUserId })
        .eq('id', groupId)

      if (ownerUpdate.error?.code === '42703' || ownerUpdate.error?.code === 'PGRST204') {
        return NextResponse.json({ ok: false, message: 'Owner role is not available in this database yet.' }, { status: 400 })
      }

      if (ownerUpdate.error) {
        console.error('[Group Members] promote_owner failed:', ownerUpdate.error)
        return NextResponse.json({ ok: false, message: 'Could not update owner.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    if (action === 'promote_member') {
      if (!requesterIsOwner) {
        return NextResponse.json({ ok: false, message: 'Only the owner can promote users.' }, { status: 403 })
      }

      const targetMembershipPreferred = await supabase
        .from('group_memberships')
        .update({ status: 'active', group_onboarded: true })
        .eq('group_id', groupId)
        .eq('user_id', targetUserId)

      if (targetMembershipPreferred.error?.code === '42703' || targetMembershipPreferred.error?.code === 'PGRST204') {
        const fallbackTargetMembership = await supabase
          .from('group_memberships')
          .select('user_id')
          .eq('group_id', groupId)
          .eq('user_id', targetUserId)
          .maybeSingle()

        if (!fallbackTargetMembership.data?.user_id) {
          return NextResponse.json({ ok: false, message: 'Target user must join first before promotion.' }, { status: 400 })
        }

        return NextResponse.json({ ok: true })
      }

      if (targetMembershipPreferred.error) {
        console.error('[Group Members] promote_member failed:', targetMembershipPreferred.error)
        return NextResponse.json({ ok: false, message: 'Could not promote user.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    if (action === 'remove') {
      if (!requesterIsOwner && targetIsOwner) {
        return NextResponse.json({ ok: false, message: 'Only the owner can remove the owner role.' }, { status: 403 })
      }

      if (targetIsOwner) {
        return NextResponse.json({ ok: false, message: 'Transfer owner role before removing this user.' }, { status: 400 })
      }

      const removePreferred = await supabase
        .from('group_memberships')
        .update({
          status: 'removed',
          group_onboarded: false,
          approved_at: new Date().toISOString(),
          approved_by: requesterUserId,
        })
        .eq('group_id', groupId)
        .eq('user_id', targetUserId)

      if (removePreferred.error?.code === '42703' || removePreferred.error?.code === 'PGRST204') {
        const removeFallback = await supabase
          .from('group_memberships')
          .delete()
          .eq('group_id', groupId)
          .eq('user_id', targetUserId)

        if (removeFallback.error) {
          console.error('[Group Members] remove fallback failed:', removeFallback.error)
          return NextResponse.json({ ok: false, message: 'Could not remove user.' }, { status: 500 })
        }

        return NextResponse.json({ ok: true })
      }

      if (removePreferred.error) {
        console.error('[Group Members] remove failed:', removePreferred.error)
        return NextResponse.json({ ok: false, message: 'Could not remove user.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, message: 'Unsupported action.' }, { status: 400 })
  } catch (error) {
    console.error('[Group Members] action error:', error)
    return NextResponse.json({ ok: false, message: 'Could not update group members.' }, { status: 500 })
  }
}
