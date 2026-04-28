'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import AppHeader from '@/components/AppHeader'
import ErrorState from '@/components/ErrorState'
import GroupInviteActions from '@/components/GroupInviteActions'
import { supabase } from '@/lib/supabase'
import { apiPath, withBasePath } from '@/lib/base-path'
import { UIMessages } from '@/lib/ui-messages'

type Friend = {
  id: string   // local key only
  name: string
  phone: string
}

type SessionData = {
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

function authName(user: User | null): string {
  if (!user) return ''
  const fromMeta = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.name === 'string'
    ? user.user_metadata.name
    : ''
  if (fromMeta.trim()) return fromMeta.trim()
  if (typeof user.email === 'string' && user.email.trim()) return user.email.trim()
  return ''
}

function authPhone(user: User | null): string {
  if (!user) return ''
  const fromMeta = typeof user.user_metadata?.phone_number === 'string'
    ? user.user_metadata.phone_number
    : typeof user.user_metadata?.phone === 'string'
    ? user.user_metadata.phone
    : ''
  if (fromMeta.trim()) return fromMeta.trim()
  if (typeof user.phone === 'string' && user.phone.trim()) return user.phone.trim()
  return ''
}

export default function CreateGroup() {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [register, setRegister] = useState<RegisterData | null>(null)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [authUserName, setAuthUserName] = useState('')
  const [authUserPhone, setAuthUserPhone] = useState('')
  const [authAccessToken, setAuthAccessToken] = useState<string | null>(null)
  const [groupName, setGroupName] = useState('')
  const [passcode, setPasscode] = useState('')
  const [friends, setFriends] = useState<Friend[]>([{ id: '1', name: '', phone: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [gated, setGated] = useState(false)
  const [createdGroupName, setCreatedGroupName] = useState('')
  const [createdGroupPasscode, setCreatedGroupPasscode] = useState('')

  useEffect(() => {
    const loadContext = async () => {
      const rawSession = localStorage.getItem('nearby_session')
      if (rawSession) {
        try {
          setSession(JSON.parse(rawSession) as SessionData)
        } catch {
          setSession(null)
        }
      }

      const rawRegister = localStorage.getItem('nearby_register')
      if (rawRegister) {
        try {
          setRegister(JSON.parse(rawRegister) as RegisterData)
        } catch {
          setRegister(null)
        }
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const sessionUser = sessionData?.session?.user ?? null
      const sessionUserId = sessionUser?.id ?? null

      console.log('[Nearby][CreateGroup] auth.getSession result:', {
        hasSession: !!sessionData?.session,
        sessionUserId,
        error: sessionError,
      })

      setAuthUserId(sessionUserId)
      setAuthUserName(authName(sessionUser))
      setAuthUserPhone(authPhone(sessionUser))
      setAuthAccessToken(sessionData?.session?.access_token ?? null)

      const hasLocalAuth = !!rawSession || !!rawRegister
      const hasSupabaseAuth = !!sessionUserId
      console.log('[Nearby][CreateGroup] gate inputs:', {
        hasLocalSession: !!rawSession,
        hasLocalRegister: !!rawRegister,
        hasSupabaseAuth,
      })

      if (!hasLocalAuth && !hasSupabaseAuth) {
        console.warn('[Nearby][CreateGroup] blocked: no local auth and no Supabase auth session')
        localStorage.setItem('nearby_after_auth', 'create-group')
        setGated(true)
        return
      }

    }

    void loadContext()
  }, [])

  useEffect(() => {
    console.log('[NavigationUI]', { component: 'create-group-back-control', upgraded_from: 'text-link', upgraded_to: 'pill' })
  }, [])

  const addFriend = () => {
    setFriends((prev) => [...prev, { id: String(Date.now()), name: '', phone: '' }])
  }

  const removeFriend = (id: string) => {
    setFriends((prev) => prev.filter((f) => f.id !== id))
  }

  const updateFriend = (id: string, field: 'name' | 'phone', value: string) => {
    setFriends((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: value } : f)))
  }

  const handleCreate = async () => {
    setError('')
    const name = groupName.trim()
    if (!name) { setError('Please enter a group name.'); return }
    if (!passcode.trim()) { setError('Please set a group passcode.'); return }

    const hasSupabaseAuth = !!authUserId
    const hasLegacyAuth = !!session || !!register

    if (!hasSupabaseAuth && !hasLegacyAuth) {
      console.warn('[Nearby][CreateGroup] blocked in handleCreate: no auth context')
      setError('Please create an account or sign in before creating a group.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch(apiPath('/api/groups/create'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authAccessToken ? { Authorization: `Bearer ${authAccessToken}` } : {}),
        },
        body: JSON.stringify({
          sessionMemberId: session?.memberId,
          requesterUserId: register?.userId,
          requesterAuthUserId: authUserId,
          requesterProfileName: register?.userName ?? authUserName,
          requesterProfilePhone: register?.phone ?? authUserPhone,
          fallbackMemberName: session?.memberName ?? register?.userName ?? authUserName ?? 'Member',
          groupName: name,
          passcode: passcode.trim(),
          friends,
        }),
      })

      const result = await response.json()
      const isSuccess = Boolean(response.ok && (result?.ok || (result?.groupId && result?.memberId)))
      if (!isSuccess) {
        setError(result?.message ?? 'We could not save your changes. Please try again.')
        setSaving(false)
        return
      }

      // Keep logged-in session aware of the new group immediately.
      const rawSession = localStorage.getItem('nearby_session')
      if (rawSession) {
        const current = JSON.parse(rawSession)
        const existingGroups = Array.isArray(current.allGroups) ? current.allGroups : []
        const hasGroup = existingGroups.some((g: { groupId: string }) => g.groupId === result.groupId)
        const nextGroups = hasGroup
          ? existingGroups
          : [...existingGroups, {
              memberId: result.memberId,
              memberName: result.memberName,
              groupId: result.groupId,
              groupName: result.groupName,
            }]

        localStorage.setItem('nearby_session', JSON.stringify({ ...current, allGroups: nextGroups }))
      }

      setCreatedGroupName(result.groupName)
      setCreatedGroupPasscode(passcode.trim())
      setDone(true)
    } catch (err) {
      console.error('[Nearby][Save] Group creation failed:', err)
      setError('We could not save your changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (gated) {
    return (
      <main className="min-h-screen bg-[#f8f8f6]">
        <AppHeader />
        <div className="nearby-shell pt-10">
          <ErrorState
            title="Please sign in first"
            message="Please create an account or sign in before creating a group."
            primaryLabel="Create Account"
            onPrimary={() => router.push(withBasePath('/register'))}
            secondaryLabel="Sign In"
            onSecondary={() => router.push(withBasePath('/'))}
          />
        </div>
      </main>
    )
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
          <p className="text-xl font-bold text-neutral-900">Group created!</p>
          <p className="mt-2 text-sm text-neutral-500">
            Your circle is ready. Start saving food spots together.
          </p>
          <div className="mt-5 text-left">
            <GroupInviteActions
              groupName={createdGroupName || groupName || 'Your Group'}
              groupPasscode={createdGroupPasscode || passcode}
            />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-2">
            <button
              onClick={() => router.push(withBasePath('/add-place'))}
              className="w-full rounded-xl bg-[#1f355d] hover:bg-[#162746] px-4 py-3 text-sm font-semibold text-white transition-colors"
            >
              Add Place
            </button>
            <button
              onClick={() => router.push(withBasePath('/nearby'))}
              className="w-full rounded-xl border border-[#d6ddeb] bg-white px-4 py-3 text-sm font-semibold text-[#1f355d] transition-colors hover:bg-[#eef3fb]"
            >
              Go to Nearby
            </button>
          </div>
        </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] px-5 py-8 pb-20">
      <AppHeader />
      <div className="nearby-shell">
        <button
          onClick={() => router.back()}
          className="mb-5 inline-flex h-8 items-center gap-1.5 rounded-full border border-[#d7deec] bg-white px-3 text-xs font-medium text-[#44506a] shadow-sm transition-colors hover:bg-[#edf2fb]"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>Back</span>
        </button>

        <h1 className="text-xl font-bold text-neutral-900 mb-1">Create a group</h1>
        <p className="text-sm text-neutral-500 mb-5">
          Set up your circle. Friends you add will be able to log in and see your saved spots.
        </p>

        <div className="space-y-4">
          {/* Group details */}
          <div className="rounded-2xl bg-white border border-neutral-200 p-5 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Group name
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Friday Makan Crew"
                className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9] transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Group passcode
              </label>
              <input
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Share this with friends to join"
                className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9] transition"
              />
              <p className="mt-1.5 text-xs text-neutral-400">
                Friends use this passcode + their last 4 digits to log in.
              </p>
            </div>
          </div>

          {/* Friends */}
          <div className="rounded-2xl bg-white border border-neutral-200 p-5 shadow-sm">
            <p className="text-sm font-medium text-neutral-700 mb-3">Add friends</p>
            <div className="space-y-3">
              {friends.map((friend, idx) => (
                <div key={friend.id} className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={friend.name}
                      onChange={(e) => updateFriend(friend.id, 'name', e.target.value)}
                      placeholder={`Friend ${idx + 1} name`}
                      className="w-full rounded-xl border border-[#d6ddeb] px-3 py-2 text-sm outline-none focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9] transition"
                    />
                    <input
                      type="tel"
                      value={friend.phone}
                      onChange={(e) => updateFriend(friend.id, 'phone', e.target.value)}
                      placeholder="Phone number"
                      className="w-full rounded-xl border border-[#d6ddeb] px-3 py-2 text-sm outline-none focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9] transition"
                    />
                  </div>
                  {friends.length > 1 && (
                    <button
                      onClick={() => removeFriend(friend.id)}
                      className="mt-1 text-neutral-400 hover:text-neutral-700 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addFriend}
              className="mt-4 text-sm font-medium text-[#1f355d] hover:underline"
            >
              + Add another friend
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full rounded-xl bg-[#1f355d] hover:bg-[#162746] active:bg-[#12203a] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {saving ? UIMessages.actionCreatingGroup : 'Create group'}
          </button>
        </div>
      </div>
    </main>
  )
}
