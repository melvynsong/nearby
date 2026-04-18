'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import ErrorState from '@/components/ErrorState'
import { apiPath } from '@/lib/base-path'

type SessionData = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
  allGroups?: Array<{ memberId: string; memberName: string; groupId: string; groupName: string }>
}

type RegisterData = {
  userId: string
  userName: string
  phone4: string
  phone: string
}

export default function JoinGroupPage() {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [register, setRegister] = useState<RegisterData | null>(null)
  const [passcode, setPasscode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [gated, setGated] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('nearby_session')
    if (raw) {
      setSession(JSON.parse(raw) as SessionData)
      return
    }

    const rawRegister = localStorage.getItem('nearby_register')
    if (rawRegister) {
      try {
        setRegister(JSON.parse(rawRegister) as RegisterData)
        return
      } catch {
        setRegister(null)
      }
    }

    localStorage.setItem('nearby_after_auth', 'join-group')
    setGated(true)
  }, [])

  const handleJoin = async () => {
    setError('')

    const code = passcode.trim()
    if (!code) {
      setError('Please enter a group passcode.')
      return
    }

    if (!session && !register) {
      setError('Please create an account or sign in before joining a group.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(apiPath('/api/groups/join'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionMemberId: session?.memberId,
          requesterUserId: register?.userId,
          groupPasscode: code,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setError(result?.message ?? 'We could not complete this just now. Please try again.')
        setLoading(false)
        return
      }

      const allGroups = Array.isArray(session?.allGroups) ? session!.allGroups : []
      const hasGroup = allGroups.some((g) => g.groupId === result.groupId)
      const nextGroups = hasGroup
        ? allGroups
        : [...allGroups, {
            memberId: result.memberId,
            memberName: result.memberName,
            groupId: result.groupId,
            groupName: result.groupName,
          }]

      localStorage.setItem('nearby_session', JSON.stringify({
        ...(session ?? {}),
        memberId: result.memberId,
        memberName: result.memberName,
        groupId: result.groupId,
        groupName: result.groupName,
        allGroups: nextGroups,
      }))

      router.push('/nearby')
    } catch (joinError) {
      console.error('[Nearby][Join] Join group failed:', joinError)
      setError('We could not complete this just now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (gated) {
    return (
      <main className="min-h-screen bg-[#f8f8f6]">
        <AppHeader />
        <div className="mx-auto max-w-sm px-5 pt-10">
          <ErrorState
            title="Please sign in first"
            message="Please create an account or sign in before joining a group."
            primaryLabel="Create Account"
            onPrimary={() => router.push('/register')}
            secondaryLabel="Sign In"
            onSecondary={() => router.push('/')}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f8f8f6]">
      <AppHeader />
      <div className="mx-auto max-w-sm px-5 pt-8">
        <button
          onClick={() => router.back()}
          className="mb-5 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          ← Back
        </button>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold text-neutral-900">Join Group</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Enter your group passcode to join.
          </p>

          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">Group passcode</label>
            <input
              type="text"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="9999"
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <p className="mt-2 text-xs text-neutral-500">
              Make sure you have created your account before joining.
            </p>
          </div>

          {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}

          <button
            onClick={handleJoin}
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
          >
            {loading ? 'Joining...' : 'Join Group'}
          </button>
        </div>
      </div>
    </main>
  )
}
