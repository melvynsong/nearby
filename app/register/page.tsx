'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { phoneLast4 } from '@/lib/helpers'
import AppHeader from '@/components/AppHeader'
import { supabase } from '@/lib/supabase'
import { withBasePath } from '@/lib/base-path'

export default function Register() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const waitForAuthenticatedUser = async (timeoutMs = 5000) => {
    return new Promise<string | null>((resolve) => {
      let settled = false

      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        subscription.unsubscribe()
        console.warn('[Nearby][Register] Timed out waiting for auth state change')
        resolve(null)
      }, timeoutMs)

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[Nearby][Register] onAuthStateChange event:', event, {
          hasSession: !!session,
          sessionUserId: session?.user?.id ?? null,
        })

        const userId = session?.user?.id ?? null
        if (!userId || settled) return

        settled = true
        clearTimeout(timeout)
        subscription.unsubscribe()
        resolve(userId)
      })
    })
  }

  const handleRegister = async () => {
    setError('')
    const name = fullName.trim()
    const ph = phone.trim()

    if (!name) { setError('Please enter your name.'); return }
    if (ph.replace(/\D/g, '').length < 8) { setError('Please enter a valid telephone number.'); return }

    const last4 = phoneLast4(ph)
    setSaving(true)

    try {
      console.log('[Nearby][Register] Supabase client env check:', {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      })

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      console.log('[Nearby][Register] getSession result:', {
        hasSession: !!sessionData?.session,
        sessionUserId: sessionData?.session?.user?.id ?? null,
        error: sessionError,
      })

      if (sessionError) {
        console.warn('[Nearby][Register] Branch: getSession error')
      }

      let authUserId = sessionData?.session?.user?.id ?? null

      if (authUserId) {
        console.log('[Nearby][Register] Branch: existing session user found')
      }

      if (!authUserId) {
        console.log('[Nearby][Register] Branch: no session user, attempting auth signup')

        const signUpResult = await supabase.auth.signInAnonymously({
          options: {
            data: {
              full_name: name,
              phone_number: ph,
            },
          },
        })

        const signUpUserId = signUpResult.data.user?.id ?? null
        const signUpSessionUserId = signUpResult.data.session?.user?.id ?? null

        console.log('[Nearby][Register] signInAnonymously response:', {
          error: signUpResult.error,
          dataUser: signUpResult.data.user ?? null,
          dataSession: signUpResult.data.session ?? null,
          userId: signUpUserId,
          sessionUserId: signUpSessionUserId,
        })

        if (signUpResult.error) {
          console.warn('[Nearby][Register] Branch: signup error')
          const rawMessage = signUpResult.error.message?.trim() || 'Unknown auth error'
          setError(`Auth sign-up failed: ${rawMessage}`)
          return
        }

        if (signUpUserId && signUpSessionUserId) {
          console.log('[Nearby][Register] Branch: signup returned user + session')
        } else if (signUpUserId && !signUpSessionUserId) {
          console.warn('[Nearby][Register] Branch: signup returned user but no session')
        } else {
          console.warn('[Nearby][Register] Branch: signup returned no user and no session')
        }

        authUserId = signUpUserId ?? signUpSessionUserId

        if (!authUserId && signUpResult.data.user && !signUpResult.data.session) {
          const { data: retrySessionData, error: retrySessionError } = await supabase.auth.getSession()
          console.log('[Nearby][Register] getSession retry after signup:', {
            hasSession: !!retrySessionData?.session,
            sessionUserId: retrySessionData?.session?.user?.id ?? null,
            error: retrySessionError,
          })
          authUserId = retrySessionData?.session?.user?.id ?? null
        }
      }

      if (!authUserId) {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        console.log('[Nearby][Register] getUser result:', {
          userId: userData.user?.id ?? null,
          error: userError,
        })
        if (userData.user?.id) {
          console.log('[Nearby][Register] Branch: user available via getUser')
        } else {
          console.warn('[Nearby][Register] Branch: getUser returned no user')
        }
        authUserId = userData.user?.id ?? null
      }

      if (!authUserId) {
        console.log('[Nearby][Register] Branch: waiting for auth state change')
        authUserId = await waitForAuthenticatedUser()
      }

      if (!authUserId) {
        console.warn('[Nearby][Register] Branch: no auth user after all checks')
        setError('Account was created but session is not ready yet. Please wait a moment and try again.')
        return
      }

      const payload = {
        id: authUserId,
        full_name: name,
        phone_number: ph,
        phone_last4: last4,
      }

      console.log('[Nearby][Register] Insert payload:', payload)
      console.log('[Nearby][Register] payload.id matches auth user id:', payload.id === authUserId)

      const { data: upserted, error: upsertError } = await supabase
        .from('users')
        .upsert(payload, { onConflict: 'id' })
        .select('id, full_name, phone_number, phone_last4')
        .single()

      if (upsertError || !upserted?.id) {
        console.error('[Nearby][Register] User insert failed:', {
          error: upsertError,
          payload,
          authUserId,
        })
        setError('We could not save your changes. Please try again.')
        return
      }

      console.log('[Nearby][Register] User insert success:', {
        userId: upserted.id,
        fullName: upserted.full_name,
        phoneNumber: upserted.phone_number,
      })

      // Persist registration info so create-group can use it
      localStorage.setItem('nearby_register', JSON.stringify({
        userId: upserted.id,
        userName: upserted.full_name ?? name,
        phone4: upserted.phone_last4 ?? last4,
        phone: upserted.phone_number ?? ph,
      }))
      // Personal passcode is not set yet – force setup before continuing.
      localStorage.removeItem('nearby_passcode_set')
      setDone(true)
    } catch (err) {
      console.error('[Nearby][Save] Register failed:', err)
      setError('We could not save your changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-[#f5f6f8]">
        <AppHeader />
        <div className="flex items-center justify-center px-5 py-12">
        <div className="nearby-shell rounded-2xl bg-white border border-[#dfe5f0] p-7 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#eef3fb]">
            <span className="text-2xl">✓</span>
          </div>
          <p className="text-xl font-bold text-neutral-900">You&apos;re in!</p>
          <p className="mt-2 text-sm text-neutral-500">Account created. Set a personal passcode to continue — you'll use it to log in to Nearby.</p>
          <button
            onClick={() => router.push(withBasePath('/settings?setup=passcode'))}
            className="mt-6 w-full rounded-xl bg-[#1f355d] hover:bg-[#162746] px-4 py-3 text-sm font-semibold text-white transition-colors"
          >
            Set my passcode
          </button>
        </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8]">
      <AppHeader />
      <div className="flex items-center justify-center px-5 py-12">
      <div className="nearby-shell rounded-2xl bg-white border border-[#dfe5f0] p-7 shadow-sm">
        <h1 className="text-xl font-bold text-neutral-900">Create account</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Join Nearby and start saving food spots with your circle.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Your full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Joe Doe"
              className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9] transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765432"
              className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9] transition"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              Used so friends can add you by phone number.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleRegister}
            disabled={saving}
            className="w-full rounded-xl bg-[#1f355d] hover:bg-[#162746] active:bg-[#12203a] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-xs text-neutral-400">
            Already registered?{' '}
            <button onClick={() => router.push(withBasePath('/'))} className="font-medium text-[#1f355d] hover:underline">
              Log in
            </button>
          </p>
        </div>
      </div>
      </div>
    </main>
  )
}
