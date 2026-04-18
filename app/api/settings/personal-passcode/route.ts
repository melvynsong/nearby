import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
    const passcode = typeof body?.passcode === 'string' ? body.passcode.trim() : ''

    if (!userId) {
      return NextResponse.json(
        { ok: false, message: 'We could not save your changes. Please try again.' },
        { status: 400 },
      )
    }

    if (!passcode || passcode.length < 4) {
      return NextResponse.json(
        { ok: false, message: 'Passcode must be at least 4 characters.' },
        { status: 400 },
      )
    }

    const supabase = getServerSupabaseClient()
    const { error } = await supabase
      .from('users')
      .update({ personal_passcode: passcode })
      .eq('id', userId)

    if (error) {
      console.error('[Nearby][API][PersonalPasscode] update failed:', error)
      return NextResponse.json(
        { ok: false, message: 'We could not save your passcode. Please try again.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Nearby][API][PersonalPasscode] unexpected error:', err)
    return NextResponse.json(
      { ok: false, message: 'Something did not go through. Please try again.' },
      { status: 500 },
    )
  }
}
