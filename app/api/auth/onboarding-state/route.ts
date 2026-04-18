import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''

    if (!userId) {
      return NextResponse.json({ ok: false, message: 'userId required' }, { status: 400 })
    }

    const supabase = getServerSupabaseClient()
    const { data, error } = await supabase
      .from('users')
      .select('id, personal_passcode')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('[Nearby][API][OnboardingState] lookup failed:', error)
      return NextResponse.json({ ok: false }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      profileExists: !!data?.id,
      personalPasscodeSet: !!(typeof data?.personal_passcode === 'string' && data.personal_passcode.trim()),
    })
  } catch (err) {
    console.error('[Nearby][API][OnboardingState] unexpected error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
