import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'
import { normalizePhoneNumber, phoneLast4 } from '@/lib/helpers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const userId = typeof body?.userId === 'string' ? body.userId : ''
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : ''
    const phoneNumberInput = typeof body?.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
    const phoneNumber = normalizePhoneNumber(phoneNumberInput)

    if (!userId || !fullName || !phoneNumber) {
      return NextResponse.json(
        { ok: false, message: 'We could not save your changes. Please try again.' },
        { status: 400 },
      )
    }

    if (phoneNumber.length < 8) {
      return NextResponse.json(
        { ok: false, message: 'Please enter a valid telephone number.' },
        { status: 400 },
      )
    }

    const supabase = getServerSupabaseClient()
    const { error } = await supabase
      .from('users')
      .update({
        full_name: fullName,
        phone_number: phoneNumber,
        phone_last4: phoneLast4(phoneNumber),
      })
      .eq('id', userId)

    if (error) {
      console.error('[Nearby][Settings] Failed to update profile:', error)
      console.error('[Nearby][Save][Profile] Update failed:', error)
      return NextResponse.json(
        { ok: false, message: 'We could not save your changes. Please try again.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Nearby][API][Profile] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, message: 'Something did not go through. Please try again.' },
      { status: 500 },
    )
  }
}
