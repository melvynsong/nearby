'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { phoneLast4 } from '@/lib/helpers'
import AppHeader from '@/components/AppHeader'

export default function Register() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [personalPasscode, setPersonalPasscode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleRegister = async () => {
    setError('')
    const name = fullName.trim()
    const ph = phone.trim()
    const code = personalPasscode.trim()

    if (!name) { setError('Please enter your name.'); return }
    if (ph.replace(/\D/g, '').length < 8) { setError('Please enter a valid phone number.'); return }
    if (code && code.length < 4) { setError('Personal passcode must be at least 4 characters.'); return }

    const last4 = phoneLast4(ph)
    setSaving(true)

    try {
      // Check if user with this phone already exists — if so, reuse them
      let userId: string

      const { data: existing } = await supabase
        .from('users')
        .select('id, personal_passcode')
        .eq('phone_number', ph)
        .maybeSingle()

      if (existing) {
        userId = existing.id
        if (code && !existing.personal_passcode) {
          await supabase
            .from('users')
            .update({ personal_passcode: code })
            .eq('id', userId)
        }
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('users')
          .insert({ full_name: name, phone_number: ph, phone_last4: last4, personal_passcode: code || null })
          .select('id')
          .single()

        if (insertErr || !inserted) {
          console.error('[Nearby][Save] Register insert failed:', insertErr)
          throw new Error('REGISTER_INSERT_FAILED')
        }
        userId = inserted.id
      }

      // Persist registration info so create-group can use it
      localStorage.setItem('nearby_register', JSON.stringify({ userId, userName: name, phone4: last4, phone: ph }))
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
      <main className="min-h-screen bg-[#f8f8f6]">
        <AppHeader />
        <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm rounded-2xl bg-white border border-neutral-200 p-7 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
            <span className="text-2xl">✓</span>
          </div>
          <p className="text-xl font-bold text-neutral-900">You&apos;re in!</p>
          <p className="mt-2 text-sm text-neutral-500">
            Account created. Next, sign in to continue.
          </p>
          <button
            onClick={() => router.push('/')}
            className="mt-6 w-full rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-3 text-sm font-semibold text-white transition-colors"
          >
            Go to sign in
          </button>
          <button
            onClick={() => router.push('/')}
            className="mt-3 w-full rounded-xl border border-neutral-200 hover:bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-600 transition-colors"
          >
            Go to login
          </button>
        </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f8f8f6]">
      <AppHeader />
      <div className="flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-neutral-200 p-7 shadow-sm">
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
              placeholder="e.g. Melvyn Song"
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Personal passcode <span className="font-normal text-neutral-400">(optional)</span>
            </label>
            <input
              type="password"
              value={personalPasscode}
              onChange={(e) => setPersonalPasscode(e.target.value)}
              placeholder="Use this for quick return access"
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              You can still join using your group&apos;s passcode.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +65 9123 4567"
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              Used so friends can add you by phone number.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleRegister}
            disabled={saving}
            className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 active:bg-teal-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-xs text-neutral-400">
            Already registered?{' '}
            <button onClick={() => router.push('/')} className="font-medium text-teal-700 hover:underline">
              Log in
            </button>
          </p>
        </div>
      </div>
      </div>
    </main>
  )
}
