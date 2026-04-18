'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { phoneLast4 } from '@/lib/helpers'

export default function Register() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleRegister = async () => {
    setError('')
    const name = fullName.trim()
    const ph = phone.trim()

    if (!name) { setError('Please enter your name.'); return }
    if (ph.replace(/\D/g, '').length < 8) { setError('Please enter a valid phone number.'); return }

    const last4 = phoneLast4(ph)
    setSaving(true)

    try {
      // Check if user with this phone already exists — if so, reuse them
      let userId: string

      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('phone_number', ph)
        .maybeSingle()

      if (existing) {
        userId = existing.id
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('users')
          .insert({ full_name: name, phone_number: ph, phone_last4: last4 })
          .select('id')
          .single()

        if (insertErr || !inserted) {
          throw new Error(insertErr?.message ?? 'Failed to register.')
        }
        userId = inserted.id
      }

      // Persist registration info so create-group can use it
      localStorage.setItem('nearby_register', JSON.stringify({ userId, userName: name, phone4: last4, phone: ph }))
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-white border border-neutral-200 p-8 shadow-sm text-center">
          <p className="text-2xl font-semibold text-neutral-900">You're in ✓</p>
          <p className="mt-2 text-sm text-neutral-500">
            Account created. Next, create your group and add friends.
          </p>
          <button
            onClick={() => router.push('/create-group')}
            className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
          >
            Create a group
          </button>
          <button
            onClick={() => router.push('/')}
            className="mt-3 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-600"
          >
            Go to login
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white border border-neutral-200 p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">Create account</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Join Nearby and start saving food spots with your circle.
        </p>

        <div className="mt-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-2">
              Your full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Melvyn Song"
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-2">
              Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +65 9123 4567"
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              Used so friends can add you by phone number.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleRegister}
            disabled={saving}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-xs text-neutral-400">
            Already registered?{' '}
            <button onClick={() => router.push('/')} className="underline text-neutral-600">
              Log in
            </button>
          </p>
        </div>
      </div>
    </main>
  )
}
