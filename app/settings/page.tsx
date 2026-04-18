'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import ErrorState from '@/components/ErrorState'
import GroupInviteActions from '@/components/GroupInviteActions'
import { apiPath, withBasePath } from '@/lib/base-path'
import { supabase } from '@/lib/supabase'
import { markPasscodeSet } from '@/lib/auth-guard'

type Session = {
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

type UserProfile = {
  userId: string
  fullName: string
  phoneNumber: string
}

function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isPasscodeSetup = searchParams.get('setup') === 'passcode'

  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)

  const [personalPasscode, setPersonalPasscode] = useState('')
  const [personalPasscodeSaving, setPersonalPasscodeSaving] = useState(false)
  const [personalPasscodeError, setPersonalPasscodeError] = useState('')
  const [personalPasscodeSaved, setPersonalPasscodeSaved] = useState(false)

  const [groupPasscode, setGroupPasscode] = useState('')
  const [groupPasscodeSaving, setGroupPasscodeSaving] = useState(false)
  const [groupPasscodeError, setGroupPasscodeError] = useState('')
  const [groupPasscodeSaved, setGroupPasscodeSaved] = useState(false)

  const [isGroupCreator, setIsGroupCreator] = useState(false)
  const [inviteGroupName, setInviteGroupName] = useState('')
  const [inviteGroupPasscode, setInviteGroupPasscode] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [loadError, setLoadError] = useState(false)

  const loadInviteDetails = async (groupId: string, userId: string) => {
    setInviteLoading(true)
    setInviteError('')
    try {
      const response = await fetch(apiPath('/api/settings/group-invite'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, requesterUserId: userId }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setInviteError(result?.message ?? 'We could not load invite details right now. Please try again.')
        return
      }

      setInviteGroupName(result.groupName)
      setInviteGroupPasscode(result.groupPasscode)
    } catch (error) {
      console.error('[Nearby][Settings] Invite details load failed:', error)
      setInviteError('We could not load invite details right now. Please try again.')
    } finally {
      setInviteLoading(false)
    }
  }

  const loadSettings = async () => {
    try {
      setLoadError(false)
      setLoading(true)

      const rawSession = localStorage.getItem('nearby_session')
      const rawRegister = localStorage.getItem('nearby_register')

      if (!rawSession && !rawRegister) {
        router.replace(withBasePath('/'))
        return
      }

      let userId = ''
      let profileSource: { full_name?: string; phone_number?: string } | null = null

      if (rawSession) {
        const parsed = JSON.parse(rawSession) as Session
        setSession(parsed)

        const { data: member, error: memberError } = await supabase
          .from('members')
          .select('user_id, users ( full_name, phone_number )')
          .eq('id', parsed.memberId)
          .maybeSingle()

        if (memberError || !member?.user_id) {
          console.error('[Nearby][Settings] Failed to load member info:', memberError)
          throw new Error('SETTINGS_MEMBER_LOAD_FAILED')
        }

        userId = member.user_id as string
        profileSource = member.users as { full_name?: string; phone_number?: string } | null
      } else if (rawRegister) {
        const reg = JSON.parse(rawRegister) as RegisterData
        userId = reg.userId

        if (!userId) {
          throw new Error('SETTINGS_USER_ID_MISSING')
        }

        const { data: userOnly, error: userOnlyError } = await supabase
          .from('users')
          .select('id, full_name, phone_number')
          .eq('id', userId)
          .maybeSingle()

        if (userOnlyError || !userOnly?.id) {
          console.error('[Nearby][Settings] Failed to load account profile:', userOnlyError)
          throw new Error('SETTINGS_ACCOUNT_LOAD_FAILED')
        }

        profileSource = {
          full_name: userOnly.full_name ?? reg.userName,
          phone_number: userOnly.phone_number ?? reg.phone,
        }
      }

      if (userId && (!profileSource?.full_name || !profileSource?.phone_number)) {
        const { data: userFallback, error: userFallbackError } = await supabase
          .from('users')
          .select('id, full_name, phone_number')
          .eq('id', userId)
          .maybeSingle()

        if (userFallbackError) {
          console.error('[Nearby][Settings] Profile fallback load failed:', userFallbackError)
        } else if (userFallback?.id) {
          profileSource = {
            full_name: userFallback.full_name ?? profileSource?.full_name,
            phone_number: userFallback.phone_number ?? profileSource?.phone_number,
          }
        }
      }

      setProfile({
        userId,
        fullName: profileSource?.full_name ?? 'Member',
        phoneNumber: profileSource?.phone_number ?? '',
      })

      if (rawSession) {
        const parsed = JSON.parse(rawSession) as Session
        const { data: group, error: groupError } = await supabase
          .from('groups')
          .select('created_by_user_id')
          .eq('id', parsed.groupId)
          .maybeSingle()

        if (groupError?.message?.includes('created_by_user_id')) {
          // Backward compatibility: if migration not applied yet, keep settings usable.
          console.warn('[Nearby][Settings] groups.created_by_user_id missing. Falling back to non-creator mode.')
          setIsGroupCreator(false)
          return
        }

        if (groupError) {
          console.error('[Nearby][Settings] Failed to load group ownership:', groupError)
          // Do not block the whole settings screen when ownership lookup fails.
          setIsGroupCreator(false)
          return
        }

        const creatorId = (group as { created_by_user_id?: string | null } | null)?.created_by_user_id ?? null
        const creator = Boolean(creatorId && creatorId === userId)
        setIsGroupCreator(creator)
        if (creator) {
          await loadInviteDetails(parsed.groupId, userId)
        }
      } else {
        setIsGroupCreator(false)
      }
    } catch (error) {
      console.error('[Nearby][Settings] Failed to load:', error)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSettings()
  }, [])

  const savePersonalPasscode = async () => {
    if (!profile) return

    setPersonalPasscodeSaved(false)
    setPersonalPasscodeError('')

    const code = personalPasscode.trim()
    if (!code) {
      setPersonalPasscodeError('Please enter a passcode.')
      return
    }
    if (code.length < 4) {
      setPersonalPasscodeError('Passcode must be at least 4 characters.')
      return
    }

    setPersonalPasscodeSaving(true)
    try {
      // Get current Supabase session token for server-side identity verification.
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token ?? null

      if (!accessToken) {
        setPersonalPasscodeError('Your session has expired. Please sign in again.')
        return
      }

      const response = await fetch(apiPath('/api/settings/personal-passcode'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ passcode: code }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setPersonalPasscodeError(result?.message ?? 'We could not save your passcode. Please try again.')
        return
      }

      markPasscodeSet()
      setPersonalPasscode('')
      setPersonalPasscodeSaved(true)

      if (isPasscodeSetup) {
        const hasSession = !!localStorage.getItem('nearby_session')
        router.push(withBasePath(hasSession ? '/nearby' : '/'))
      }
    } catch (error) {
      console.error('[Nearby][Save][PersonalPasscode] Request failed:', error)
      setPersonalPasscodeError('We could not save your passcode. Please try again.')
    } finally {
      setPersonalPasscodeSaving(false)
    }
  }

  const saveProfile = async () => {
    if (!profile) return

    setProfileSaved(false)
    setProfileError('')

    const name = profile.fullName.trim()
    const phone = profile.phoneNumber.trim()
    if (!name) {
      setProfileError('Please enter your name.')
      return
    }

    if (phone.replace(/\D/g, '').length < 8) {
      setProfileError('Please enter a valid telephone number.')
      return
    }

    setProfileSaving(true)
    try {
      const response = await fetch(apiPath('/api/settings/profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.userId,
          fullName: name,
          phoneNumber: phone,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setProfileError(result?.message ?? 'We could not save your changes. Please try again.')
        return
      }

      const raw = localStorage.getItem('nearby_session')
      if (raw) {
        const parsed = JSON.parse(raw) as Session
        localStorage.setItem('nearby_session', JSON.stringify({ ...parsed, memberName: name }))
      }

      setProfileSaved(true)
    } catch (error) {
      console.error('[Nearby][Save][Profile] Request failed:', error)
      setProfileError('We could not save your changes. Please try again.')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.warn('[Nearby][Settings] signOut error (continuing):', err)
    }
    localStorage.removeItem('nearby_session')
    localStorage.removeItem('nearby_register')
    localStorage.removeItem('nearby_passcode_set')
    router.push(withBasePath('/'))
  }

  const saveGroupPasscode = async () => {
    if (!session || !profile) return

    setGroupPasscodeSaved(false)
    setGroupPasscodeError('')

    const nextPasscode = groupPasscode.trim()
    if (!nextPasscode) {
      setGroupPasscodeError('Please enter a group passcode.')
      return
    }

    setGroupPasscodeSaving(true)
    try {
      const response = await fetch(apiPath('/api/settings/group-passcode'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: session.groupId,
          requesterUserId: profile.userId,
          nextPasscode,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setGroupPasscodeError(result?.message ?? 'We could not save your changes. Please try again.')
        return
      }

      setGroupPasscodeSaved(true)
      setInviteGroupPasscode(nextPasscode)
      setGroupPasscode('')
    } catch (error) {
      console.error('[Nearby][Save][GroupPasscode] Request failed:', error)
      setGroupPasscodeError('We could not save your changes. Please try again.')
    } finally {
      setGroupPasscodeSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f8f6] pb-20">
      <AppHeader
        right={
          <button
            onClick={() => void handleLogout()}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-100 active:scale-[0.98]"
          >
            Log out
          </button>
        }
      />
      <div className="mx-auto w-full max-w-md px-5 pt-5">
        <button
          onClick={() => router.push(withBasePath('/nearby'))}
          className="mb-5 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          ← Back
        </button>

        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Update your profile and group passcode settings.</p>

        {isPasscodeSetup && (
          <div className="mt-4 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-sm text-teal-800">
            <span className="font-semibold">One more step:</span> set your personal passcode below to start using Nearby.
          </div>
        )}
        {loading ? (
          <p className="mt-6 text-sm text-neutral-400">Loading settings...</p>
        ) : loadError ? (
          <div className="mt-6">
            <ErrorState
              title="Something did not go through"
              message="We could not load your settings just now. Please try again."
              onPrimary={() => void loadSettings()}
              secondaryLabel="Go Back"
              onSecondary={() => router.push(withBasePath('/nearby'))}
            />
          </div>
        ) : profile ? (
          <div className="mt-6 space-y-4">
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Profile</h2>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700">Name</label>
                  <input
                    type="text"
                    value={profile.fullName}
                    onChange={(e) => setProfile((prev) => prev ? { ...prev, fullName: e.target.value } : prev)}
                    className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700">Telephone number</label>
                  <input
                    type="tel"
                    value={profile.phoneNumber}
                    onChange={(e) => setProfile((prev) => prev ? { ...prev, phoneNumber: e.target.value } : prev)}
                    className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  />
                </div>

              </div>

              {profileError && <p className="mt-3 text-sm text-amber-700">{profileError}</p>}
              {profileSaved && <p className="mt-3 text-sm text-teal-700">Profile updated.</p>}

              <button
                onClick={saveProfile}
                disabled={profileSaving}
                className="mt-4 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
              >
                {profileSaving ? 'Saving...' : 'Save profile'}
              </button>
            </section>

            <section className={`rounded-2xl border bg-white p-5 shadow-sm ${isPasscodeSetup ? 'border-teal-400 ring-2 ring-teal-100' : 'border-neutral-200'}`}>
              <h2 className="text-sm font-semibold text-neutral-900">Your personal passcode</h2>
              <p className="mt-1 text-xs text-neutral-500">
                {isPasscodeSetup
                  ? 'Set a personal passcode to unlock Nearby. You will use this to log in.'
                  : 'Used to log in to Nearby. Choose something only you know.'}
              </p>

              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                  {isPasscodeSetup ? 'Create your personal passcode' : 'New personal passcode'}
                </label>
                <input
                  type="password"
                  value={personalPasscode}
                  onChange={(e) => setPersonalPasscode(e.target.value)}
                  placeholder="At least 4 characters"
                  className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
                <p className="mt-1.5 text-xs text-neutral-400">
                  This is separate from your group passcode. Keep it private.
                </p>
              </div>

              {personalPasscodeError && <p className="mt-3 text-sm text-amber-700">{personalPasscodeError}</p>}
              {personalPasscodeSaved && !isPasscodeSetup && <p className="mt-3 text-sm text-teal-700">Personal passcode saved.</p>}

              <button
                onClick={savePersonalPasscode}
                disabled={personalPasscodeSaving}
                className="mt-4 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
              >
                {personalPasscodeSaving ? 'Saving...' : isPasscodeSetup ? 'Set passcode and continue' : 'Save personal passcode'}
              </button>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Group passcode</h2>
              <p className="mt-1 text-xs text-neutral-500">Current group: {session?.groupName}</p>

              {isGroupCreator ? (
                <>
                  <div className="mt-4">
                    <label className="mb-1.5 block text-sm font-medium text-neutral-700">New group passcode</label>
                    <input
                      type="text"
                      value={groupPasscode}
                      onChange={(e) => setGroupPasscode(e.target.value)}
                      placeholder="Enter new group passcode"
                      className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    />
                  </div>

                  {groupPasscodeError && <p className="mt-3 text-sm text-amber-700">{groupPasscodeError}</p>}
                  {groupPasscodeSaved && <p className="mt-3 text-sm text-teal-700">Group passcode updated.</p>}

                  <button
                    onClick={saveGroupPasscode}
                    disabled={groupPasscodeSaving}
                    className="mt-4 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
                  >
                    {groupPasscodeSaving ? 'Saving...' : 'Save group passcode'}
                  </button>
                </>
              ) : (
                <p className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                  Only the group creator can change the group passcode.
                </p>
              )}
            </section>

            {isGroupCreator && (
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                {inviteLoading ? (
                  <p className="text-sm text-neutral-500">Loading invite details...</p>
                ) : inviteError ? (
                  <ErrorState
                    title="Something did not go through"
                    message={inviteError}
                    onPrimary={() => {
                      if (session && profile) void loadInviteDetails(session.groupId, profile.userId)
                    }}
                  />
                ) : (
                  <GroupInviteActions
                    groupName={inviteGroupName || session?.groupName || 'Your Group'}
                    groupPasscode={inviteGroupPasscode}
                  />
                )}
              </section>
            )}
          </div>
        ) : null}
      </div>
    </main>
  )
}

export default function SettingsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SettingsPage />
    </Suspense>
  )
}
