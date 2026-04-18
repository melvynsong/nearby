import { NextRequest, NextResponse } from 'next/server'
import { phoneLast4 } from '@/lib/helpers'
import { getServerSupabaseClient } from '@/lib/server-supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : ''
    const phoneNumber = typeof body?.phoneNumber === 'string' ? body.phoneNumber.trim() : ''

    if (!fullName || !phoneNumber) {
      return NextResponse.json(
        { ok: false, message: 'We could not save your changes. Please try again.' },
        { status: 400 },
      )
    }

    if (phoneNumber.replace(/\D/g, '').length < 8) {
      return NextResponse.json(
        { ok: false, message: 'Please enter a valid telephone number.' },
        { status: 400 },
      )
    }

    const supabase = getServerSupabaseClient()

    const { data: existing, error: existingError } = await supabase
      .from('users')
      .select('id, full_name, phone_number, phone_last4')
      .eq('phone_number', phoneNumber)
      .maybeSingle()

    if (existingError) {
      console.error('[Nearby][Register] Existing user lookup failed:', existingError)
      return NextResponse.json(
        { ok: false, message: 'We could not save your changes. Please try again.' },
        { status: 500 },
      )
    }

    if (existing?.id) {
      return NextResponse.json({
        ok: true,
        userId: existing.id,
        fullName: existing.full_name ?? fullName,
        phoneNumber: existing.phone_number ?? phoneNumber,
        phoneLast4: existing.phone_last4 ?? phoneLast4(phoneNumber),
      })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('users')
      .insert({
        full_name: fullName,
        phone_number: phoneNumber,
        phone_last4: phoneLast4(phoneNumber),
      })
      .select('id, full_name, phone_number, phone_last4')
      .single()

    if (insertError || !inserted?.id) {
      console.error('[Nearby][Register] User insert failed:', insertError)
      return NextResponse.json(
        { ok: false, message: 'We could not save your changes. Please try again.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      userId: inserted.id,
      fullName: inserted.full_name ?? fullName,
      phoneNumber: inserted.phone_number ?? phoneNumber,
      phoneLast4: inserted.phone_last4 ?? phoneLast4(phoneNumber),
    })
  } catch (error) {
    console.error('[Nearby][API][Register] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, message: 'Something did not go through. Please try again.' },
      { status: 500 },
    )
  }
}
