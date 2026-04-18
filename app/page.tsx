'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ErrorState from '@/components/ErrorState'
import AppHeader from '@/components/AppHeader'
import NearbyHome from '@/app/nearby/page'
import { apiPath, withBasePath } from '@/lib/base-path'

type GroupEntry = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

type RegisterData = {
  userId: string
  userName: string
  phone4: string
  phone: string
}

type LoginMethod = 'personal' | 'group'

export default function Home() {
  const router = useRouter()
  const [last4, setLast4] = useState('')
  const [passcode, setPasscode] = useState('')
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('personal')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showLoginErrorCard, setShowLoginErrorCard] = useState(false)
  const [registerAccount, setRegisterAccount] = useState<RegisterData | null>(null)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    const session = localStorage.getItem('nearby_session')
    if (session) {
      setHasSession(true)
      return
    }

    const rawRegister = localStorage.getItem('nearby_register')
    if (rawRegister) {
      try {
        setRegisterAccount(JSON.parse(rawRegister) as RegisterData)
      } catch {
        setRegisterAccount(null)
      }
    }
  }, [router])

  if (hasSession) {
    return <NearbyHome />
  }

  const handleLogout = async () => {
    try { await supabase.auth.signOut() } catch (err) { console.warn('[Nearby][Home] signOut error:', err) }
    localStorage.removeItem('nearby_session')
    localStorage.removeItem('nearby_register')
    localStorage.removeItem('nearby_passcode_set')
    setRegisterAccount(null)
  }

  const handleCreateGroupCta = () => {
    const session = localStorage.getItem('nearby_session')
    const register = localStorage.getItem('nearby_register')
    if (session || register) {
      router.push(withBasePath('/create-group'))
      return
    }
    localStorage.setItem('nearby_after_auth', 'create-group')
    router.push(withBasePath('/register'))
  }

  const handleJoinGroupCta = () => {
    const session = localStorage.getItem('nearby_session')
    const register = localStorage.getItem('nearby_register')
    if (session || register) {
      router.push(withBasePath('/join-group'))
      return
    }
    localStorage.setItem('nearby_after_auth', 'join-group')
    router.push(withBasePath('/register'))
  }

  const handleEnter = async () => {
    setError('')
    setShowLoginErrorCard(false)

    if (last4.length !== 4 || !/^\d{4}$/.test(last4)) {
      setError('Enter the last 4 digits of your mobile.')
      return
    }

    if (!passcode.trim()) {
      setError(loginMethod === 'personal' ? 'Enter your personal passcode.' : 'Enter your group passcode.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(apiPath('/api/auth/enter'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          last4,
          method: loginMethod,
          personalPasscode: loginMethod === 'personal' ? passcode.trim() : '',
          groupPasscode: loginMethod === 'group' ? passcode.trim() : '',
        }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setError(result?.message ?? 'Incorrect details.')
        return
      }

      const register = result.register as RegisterData | null
      const session = result.session as (GroupEntry & { allGroups: GroupEntry[] }) | null

      if (!register?.userId) {
        setError('We could not complete this just now. Please try again.')
        return
      }

      localStorage.setItem('nearby_register', JSON.stringify(register))
      setRegisterAccount(register)

      if (!result.hasGroup || !session) {
        return
      }

      localStorage.setItem('nearby_session', JSON.stringify(session))

      const nextAction = localStorage.getItem('nearby_after_auth')
      if (nextAction === 'create-group') {
        localStorage.removeItem('nearby_after_auth')
        router.push(withBasePath('/create-group'))
        return
      }

      if (nextAction === 'join-group') {
        localStorage.removeItem('nearby_after_auth')
        router.push(withBasePath('/join-group'))
        return
      }

      router.push(withBasePath('/nearby'))
    } catch (err) {
      console.error('[Nearby][API] Login failed:', err)
      setError('We could not complete this just now. Please try again.')
      setShowLoginErrorCard(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f8f6]">
      <AppHeader />
      <div className="flex flex-col items-center justify-center px-5 py-10">

      <section className="mb-8 w-full max-w-xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
          Discover good places nearby, together.
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-neutral-600 sm:text-base">
          Nearby helps you find, save, and share useful places around you - from food spots to meetup ideas and local finds. Build groups, add places, and make it easier for everyone to decide where to go next.
        </p>
        <div className="mx-auto mt-5 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
          <button
            onClick={handleCreateGroupCta}
            className="w-full rounded-xl bg-teal-700 px-5 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.02] hover:bg-teal-800 active:scale-[0.99]"
          >
            Create a Group
          </button>
          <button
            onClick={() => router.push(withBasePath('/add-place'))}
            className="w-full rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Add a Place
          </button>
        </div>
        <button
          onClick={handleJoinGroupCta}
          className="mt-3 text-sm font-medium text-teal-700 hover:underline"
        >
          Have a passcode? Join Group
        </button>
        {registerAccount && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">
              Signed in as {registerAccount.userName}. You do not have a group yet.
            </p>
            <button
              onClick={() => void handleLogout()}
              className="shrink-0 text-xs font-medium text-neutral-500 hover:text-neutral-800 underline underline-offset-2"
            >
              Log out
            </button>
          </div>
        )}
      </section>

      {!registerAccount && (
      <div className="w-full max-w-sm rounded-2xl bg-white border border-neutral-200 p-7 shadow-sm">
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Last 4 digits of your mobile
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
              placeholder="5432"
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Sign in with
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLoginMethod('personal')}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${loginMethod === 'personal' ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'}`}
              >
                Personal passcode
              </button>
              <button
                type="button"
                onClick={() => setLoginMethod('group')}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${loginMethod === 'group' ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'}`}
              >
                Group passcode
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              {loginMethod === 'personal' ? 'Personal passcode' : 'Group passcode'}
            </label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder={loginMethod === 'personal' ? 'Your personal passcode' : '9999'}
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              {loginMethod === 'personal'
                ? 'Use the personal passcode you set in settings.'
                : 'Required if you are already in a group.'}
            </p>
          </div>

          {error && !showLoginErrorCard && <p className="text-sm text-red-600">{error}</p>}

          {showLoginErrorCard && (
            <ErrorState
              title="Something did not go through"
              message="We could not complete this just now. Please try again."
              onPrimary={handleEnter}
            />
          )}

          <button
            onClick={handleEnter}
            disabled={loading}
            className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 active:bg-teal-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {loading ? 'Entering…' : 'Enter Nearby'}
          </button>

          <p className="text-center text-xs text-neutral-400">
            New here?{' '}
            <button onClick={() => router.push(withBasePath('/register'))} className="font-medium text-teal-700 hover:underline">
              Create an account
            </button>
          </p>
        </div>
      </div>
      )}
      </div>
    </main>
  )
}
