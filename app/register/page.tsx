'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { phoneLast4 } from '@/lib/helpers'
import AppHeader from '@/components/AppHeader'
import { apiPath, withBasePath } from '@/lib/base-path'

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
    if (ph.replace(/\D/g, '').length < 8) { setError('Please enter a valid telephone number.'); return }

    const last4 = phoneLast4(ph)
    setSaving(true)

    try {
      const response = await fetch(apiPath('/api/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: name,
          phoneNumber: ph,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok || !result?.userId) {
        console.error('[Nearby][Save] Register API failed:', result)
        setError(result?.message ?? 'We could not save your changes. Please try again.')
        return
      }

      // Persist registration info so create-group can use it
      localStorage.setItem('nearby_register', JSON.stringify({
        userId: result.userId,
        userName: result.fullName ?? name,
        phone4: result.phoneLast4 ?? last4,
        phone: result.phoneNumber ?? ph,
      }))
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
          <p className="mt-2 text-sm text-neutral-500">Account created. You can now create or join a group.</p>
          <button
            onClick={() => router.push(withBasePath('/'))}
            className="mt-6 w-full rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-3 text-sm font-semibold text-white transition-colors"
          >
            Continue
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
              placeholder="Joe Doe"
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
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
            <button onClick={() => router.push(withBasePath('/'))} className="font-medium text-teal-700 hover:underline">
              Log in
            </button>
          </p>
        </div>
      </div>
      </div>
    </main>
  )
}
