import { randomBytes, pbkdf2Sync } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient, getUserSupabaseClient } from '@/lib/server-supabase'

/**
 * Hash a passcode with PBKDF2 (Node built-in crypto, no extra deps).
 * Returns "<saltHex>:<hashHex>" for storage.
 */
function hashPasscode(passcode: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(passcode, salt, 120_000, 32, 'sha256').toString('hex')
  return `${salt}:${hash}`
}

export async function POST(request: NextRequest) {
  try {
    // ── Verify caller identity via Supabase bearer token ──────────────────
    const authHeader = request.headers.get('authorization') ?? ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

    if (!bearerToken) {
      return NextResponse.json(
        { ok: false, message: 'Authentication required.' },
        { status: 401 },
      )
    }

    const supabase = getServerSupabaseClient()

    // Use the anon/service client to verify the token and get the real user id.
    const { data: userData, error: userError } = await supabase.auth.getUser(bearerToken)
    if (userError || !userData?.user?.id) {
      console.error('[Nearby][API][PersonalPasscode] token verification failed:', userError)
      return NextResponse.json(
        { ok: false, message: 'Authentication required.' },
        { status: 401 },
      )
    }

    const verifiedUserId = userData.user.id

    // ── Validate passcode from body ───────────────────────────────────────
    const body = await request.json()
    const passcode = typeof body?.passcode === 'string' ? body.passcode.trim() : ''

    if (!passcode || passcode.length < 4) {
      return NextResponse.json(
        { ok: false, message: 'Passcode must be at least 4 characters.' },
        { status: 400 },
      )
    }

    // ── Hash and store ────────────────────────────────────────────────────
    const personal_passcode_hash = hashPasscode(passcode)

    // Use a user-scoped client so auth.uid() satisfies the RLS UPDATE policy.
    // Falls back gracefully if service-role key is present (which bypasses RLS).
    const userClient = getUserSupabaseClient(bearerToken)
    const preferredUpdate = await userClient
      .from('users')
      .update({
        personal_passcode_hash,
        personal_passcode: passcode,
        has_personal_passcode: true,
      })
      .eq('id', verifiedUserId)

    let updateError = preferredUpdate.error

    if (updateError?.code === 'PGRST204' || updateError?.code === '42703') {
      const fallbackUpdate = await userClient
        .from('users')
        .update({
          personal_passcode_hash,
          has_personal_passcode: true,
        })
        .eq('id', verifiedUserId)

      updateError = fallbackUpdate.error
    }

    if (updateError) {
      console.error('[Nearby][API][PersonalPasscode] update failed:', updateError)
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
