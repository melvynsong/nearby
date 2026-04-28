'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ErrorState from '@/components/ErrorState'
import BrandMark from '@/components/BrandMark'
import NearbyHome from '@/app/nearby/page'
import { apiPath, withBasePath } from '@/lib/base-path'
import { UIMessages } from '@/lib/ui-messages'

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

export default function Home() {
  const router = useRouter()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showLoginErrorCard, setShowLoginErrorCard] = useState(false)
  const [registerAccount, setRegisterAccount] = useState<RegisterData | null>(null)
  const [hasSession, setHasSession] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    let cancelled = false

    const bootstrapSession = async () => {
      try {
        const rawSession = localStorage.getItem('nearby_session')
        if (rawSession) {
          setHasSession(true)
          return
        }

        setHasSession(false)

        const rawRegister = localStorage.getItem('nearby_register')
        if (!rawRegister) {
          setRegisterAccount(null)
          return
        }

        let parsedRegister: RegisterData | null = null
        try {
          parsedRegister = JSON.parse(rawRegister) as RegisterData
        } catch {
          localStorage.removeItem('nearby_register')
          setRegisterAccount(null)
          return
        }

        setRegisterAccount(parsedRegister)

        if (!parsedRegister?.userId) {
          return
        }

        const response = await fetch(apiPath('/api/auth/restore-session'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: parsedRegister.userId }),
        })

        const result = await response.json()
        if (!response.ok || !result?.ok) {
          console.error('[Nearby][Home] restore-session failed:', result)
          return
        }

        if (cancelled) return

        const register = result.register as RegisterData | null
        const session = result.session as (GroupEntry & { allGroups: GroupEntry[] }) | null

        if (register?.userId) {
          localStorage.setItem('nearby_register', JSON.stringify(register))
          setRegisterAccount(register)
        }

        if (result.hasGroup && session) {
          localStorage.setItem('nearby_session', JSON.stringify(session))
          localStorage.setItem('nearby_last_group_id', session.groupId)
          localStorage.removeItem('nearby_after_auth')
          setHasSession(true)
          router.replace(withBasePath('/nearby'))
        }
      } catch (error) {
        console.error('[Nearby][Home] bootstrap failed:', error)
      } finally {
        if (!cancelled) {
          setBootstrapping(false)
        }
      }
    }

    void bootstrapSession()

    return () => {
      cancelled = true
    }
  }, [router])

  if (hasSession) {
    return <NearbyHome />
  }

  if (bootstrapping) {
    return (
      <main className="min-h-screen bg-[#f5f6f8] py-10">
        <div className="nearby-shell flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-[#677088]">{UIMessages.actionLoadingSession}</p>
        </div>
      </main>
    )
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
    localStorage.removeItem('nearby_after_auth')
    localStorage.removeItem('nearby_last_group_id')
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

    const normalizedPhoneNumber = phoneNumber.replace(/\D/g, '')
    const normalizedPasscode = passcode.trim()

    console.log('[Login Attempt]', {
      phoneNumber: normalizedPhoneNumber,
      passcode: normalizedPasscode,
      method: 'personal',
    })

    if (normalizedPhoneNumber.length < 8) {
      setError('Enter your telephone number.')
      return
    }

    if (!normalizedPasscode) {
      setError('Enter your personal passcode.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(apiPath('/api/auth/enter'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: normalizedPhoneNumber,
          method: 'personal',
          personalPasscode: normalizedPasscode,
          groupPasscode: '',
        }),
      })

      const result = await response.json()
      console.log('[DB Result]', result)
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
        localStorage.removeItem('nearby_session')
        localStorage.removeItem('nearby_last_group_id')
        return
      }

      localStorage.setItem('nearby_session', JSON.stringify(session))
      localStorage.setItem('nearby_last_group_id', session.groupId)
      localStorage.removeItem('nearby_after_auth')
      setHasSession(true)

      router.replace(withBasePath('/nearby'))
    } catch (err) {
      console.error('[Login Error]', err)
      setError('We could not complete this just now. Please try again.')
      setShowLoginErrorCard(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] py-10">
      <div className="nearby-shell flex flex-col items-center">
        <div className="mb-6 mt-2">
          <BrandMark clickable={false} size="hero" />
        </div>

        <div className="mb-8 text-center px-2">
          <h1 className="text-2xl font-bold tracking-tight text-[#1a2438] leading-snug">
            Discover good places nearby, together.
          </h1>
          <p className="mt-3 text-sm text-[#677088] leading-relaxed">
            Nearby helps you find, save, and share useful places around you - from food spots to meetup ideas and local finds. Build groups, add places, and make it easier for everyone to decide where to go next.
          </p>
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
                <label className="mb-1.5 block text-sm font-medium text-[#364158]">1. Telephone number</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="91234567"
                  className="w-full rounded-xl border border-[#d8deea] px-4 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e6edf9]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#364158]">2. Personal passcode</label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Your personal passcode"
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


        {/* Showcase teaser */}
        <Link
          href={withBasePath('/showcase')}
          className="group mt-6 w-full flex items-center gap-3 rounded-2xl overflow-hidden cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #1f355d 0%, #2d4f8a 100%)' }}
        >
          <div className="flex-1 px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-1">
              Singapore Food
            </p>
            <p className="text-sm font-bold text-white leading-snug">
              Explore Top Dishes
            </p>
            <p className="text-[11px] text-white/60 mt-0.5">
              Community-curated food showcases
            </p>
          </div>
          <div className="flex items-center gap-1 pr-4 text-white/50 group-hover:text-white/80 transition-colors">
            <span className="text-2xl">🍜</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>
    </main>
  )
}
