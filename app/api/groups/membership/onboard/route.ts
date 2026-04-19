import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const groupId = typeof body?.groupId === 'string' ? body.groupId : ''
    const memberId = typeof body?.memberId === 'string' ? body.memberId : ''

    if (!groupId || !memberId) {
      return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 })
    }

    const supabase = getServerSupabaseClient()

    const preferredUpdate = await supabase
      .from('group_memberships')
      .update({ group_onboarded: true })
      .eq('group_id', groupId)
      .eq('member_id', memberId)

    if (preferredUpdate.error?.code === '42703' || preferredUpdate.error?.code === 'PGRST204') {
      return NextResponse.json({ ok: true })
    }

    if (preferredUpdate.error) {
      console.error('[Membership] onboard update failed:', preferredUpdate.error)
      return NextResponse.json({ ok: false, message: 'Could not update onboarding.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Membership] onboard unexpected error:', error)
    return NextResponse.json({ ok: false, message: 'Could not update onboarding.' }, { status: 500 })
  }
}
