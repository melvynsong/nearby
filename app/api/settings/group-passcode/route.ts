import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const groupId = typeof body?.groupId === 'string' ? body.groupId : ''
    const requesterUserId = typeof body?.requesterUserId === 'string' ? body.requesterUserId : ''
    const nextPasscode = typeof body?.nextPasscode === 'string' ? body.nextPasscode.trim() : ''

    if (!groupId || !requesterUserId || !nextPasscode) {
      return NextResponse.json(
        { ok: false, message: 'We could not save your changes. Please try again.' },
        { status: 400 },
      )
    }

    const supabase = getServerSupabaseClient()

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, created_by_user_id')
      .eq('id', groupId)
      .maybeSingle()

    if (groupError || !group) {
      console.error('[Nearby][API][GroupPasscode] Group lookup failed:', groupError)
      return NextResponse.json(
        { ok: false, message: 'Something did not go through. Please try again.' },
        { status: 404 },
      )
    }

    if (!group.created_by_user_id || group.created_by_user_id !== requesterUserId) {
      return NextResponse.json(
        { ok: false, message: 'Only the group creator can change the group passcode.' },
        { status: 403 },
      )
    }

    const { error: updateError } = await supabase
      .from('groups')
      .update({ access_code: nextPasscode })
      .eq('id', groupId)

    if (updateError) {
      console.error('[Nearby][Save][GroupPasscode] Update failed:', updateError)
      return NextResponse.json(
        { ok: false, message: 'We could not save your changes. Please try again.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Nearby][API][GroupPasscode] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, message: 'Something did not go through. Please try again.' },
      { status: 500 },
    )
  }
}
