'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ErrorState from '@/components/ErrorState'
import BrandMark from '@/components/BrandMark'
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

    // Ensure stale hasSession is cleared if localStorage was wiped (e.g. after logout)
    setHasSession(false)

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
    console.log('[Nearby][Home] Logout clicked')
    try {
      const { error } = await supabase.auth.signOut()
      console.log('[Nearby][Home] supabase.auth.signOut result:', error ?? 'ok')
    } catch (err) {
      console.warn('[Nearby][Home] signOut error:', err)
    }
    localStorage.removeItem('nearby_session')
    localStorage.removeItem('nearby_register')
    localStorage.removeItem('nearby_passcode_set')
    console.log('[Nearby][Home] localStorage cleared')
    setRegisterAccount(null)
    setHasSession(false)
    console.log('[Nearby][Home] Redirecting to home')
    window.location.replace(withBasePath('/'))
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

  const ensureSupabaseSession = async (): Promise<boolean> => {
    const { data: existing } = await supabase.auth.getSession()
    if (existing?.session) return true

    const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously()
    if (signInError || !signInData?.session) {
      console.error('[Nearby][Auth] Anonymous sign-in failed on entry:', signInError)
      return false
    }

    return true
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

      // Ensure client has an authenticated Supabase session for RLS-protected writes.
      const hasAuthSession = await ensureSupabaseSession()
      if (!hasAuthSession) {
        setError('Sign-in session could not be prepared. Please try again.')
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
    <main className="min-h-screen bg-[#f5f6f8] py-10">
      <div className="nearby-shell flex flex-col items-center">
        <div className="mb-8 mt-2">
          <BrandMark clickable={false} size="hero" />
        </div>

        {registerAccount ? (
          <section className="w-full rounded-3xl border border-[#e5e9f0] bg-white p-6 text-center shadow-[0_20px_40px_rgba(24,39,75,0.06)]">
            <h1 className="text-xl font-semibold tracking-tight text-[#1a2438]">You are signed in</h1>
            <p className="mt-2 text-sm text-[#677088]">
              Signed in as {registerAccount.userName}. You do not have a group yet.
            </p>
            <div className="mt-5 space-y-2">
              <button
                onClick={handleCreateGroupCta}
                className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-primary-ink)]"
              >
                Create Group
              </button>
              <button
                onClick={handleJoinGroupCta}
                className="w-full rounded-xl border border-[#d7ddea] bg-white px-4 py-3 text-sm font-semibold text-[#1f355d] transition-colors hover:bg-[#f3f6fb]"
              >
                Join Group
              </button>
              <button
                onClick={() => void handleLogout()}
                className="w-full rounded-xl border border-[#ead6d2] bg-[#fff8f7] px-4 py-3 text-sm font-medium text-[#8a4a43] transition-colors hover:bg-[#fdeeee]"
              >
                Log out
              </button>
            </div>
          </section>
        ) : (
          <section className="w-full rounded-3xl border border-[#e5e9f0] bg-white p-6 shadow-[0_20px_40px_rgba(24,39,75,0.06)]">
            <h1 className="text-center text-lg font-semibold tracking-tight text-[#1a2438]">Sign in to Nearby</h1>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#364158]">1. Sign in method</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLoginMethod('personal')}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${loginMethod === 'personal' ? 'border-[#1f355d] bg-[#ebf0f9] text-[#1f355d]' : 'border-[#d8deea] bg-white text-[#4d5871] hover:bg-[#f7f9fc]'}`}
                  >
                    Personal
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginMethod('group')}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${loginMethod === 'group' ? 'border-[#1f355d] bg-[#ebf0f9] text-[#1f355d]' : 'border-[#d8deea] bg-white text-[#4d5871] hover:bg-[#f7f9fc]'}`}
                  >
                    Group
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#364158]">2. Last 4 digits</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
                  placeholder="5432"
                  className="w-full rounded-xl border border-[#d8deea] px-4 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e6edf9]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#364158]">
                  3. {loginMethod === 'personal' ? 'Personal passcode' : 'Group passcode'}
                </label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder={loginMethod === 'personal' ? 'Your personal passcode' : 'Your group passcode'}
                  className="w-full rounded-xl border border-[#d8deea] px-4 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e6edf9]"
                />
              </div>

              {error && !showLoginErrorCard && <p className="text-sm text-rose-700">{error}</p>}

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
                className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-primary-ink)] disabled:opacity-50"
              >
                {loading ? 'Entering…' : 'Enter Nearby'}
              </button>

              <p className="text-center text-xs text-[#7a8398]">
                New here?{' '}
                <button onClick={() => router.push(withBasePath('/register'))} className="font-semibold text-[var(--brand-primary)] hover:underline">
                  Create an account
                </button>
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
