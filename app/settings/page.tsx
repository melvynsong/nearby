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
  allGroups?: Array<{
    memberId: string
    memberName: string
    groupId: string
    groupName: string
  }>
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
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [showPasscode, setShowPasscode] = useState(false)
  const [showGroupPasscode, setShowGroupPasscode] = useState(false)
  const [groupMembersMap, setGroupMembersMap] = useState<Record<string, Array<{ id: string; display_name: string; membership_status: string; group_onboarded: boolean }>>>({})
  const [deleteConfirmGroupId, setDeleteConfirmGroupId] = useState<string | null>(null)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  const [deleteGroupError, setDeleteGroupError] = useState('')
  const [groupTitle, setGroupTitle] = useState('')
  const [groupVisibility, setGroupVisibility] = useState<'public' | 'private'>('public')
  const [groupSettingsSaving, setGroupSettingsSaving] = useState(false)
  const [groupSettingsSaved, setGroupSettingsSaved] = useState(false)
  const [groupSettingsError, setGroupSettingsError] = useState('')
  const [pendingRequests, setPendingRequests] = useState<Array<{ id: string; name: string; requestedAt: string }>>([])
  const [pendingActionLoadingId, setPendingActionLoadingId] = useState<string | null>(null)
  const [categoryRefreshMessage, setCategoryRefreshMessage] = useState('')
  const loadGroupMembers = async (groupId: string) => {
    if (groupMembersMap[groupId]) return
    const { data, error } = await supabase
      .from('members')
      .select('id, display_name, user_id')
      .eq('group_id', groupId)
    if (error || !data) return

    const userIds = (data as any[]).map((m) => m.user_id).filter(Boolean)
    const preferredMemberships = await supabase
      .from('group_memberships')
      .select('user_id, status, group_onboarded')
      .eq('group_id', groupId)
      .in('user_id', userIds)

    let memberships = (preferredMemberships.data ?? []) as Array<{ user_id: string; status?: string | null; group_onboarded?: boolean | null }>
    if (preferredMemberships.error?.code === '42703' || preferredMemberships.error?.code === 'PGRST204') {
      const fallbackMemberships = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', groupId)
        .in('user_id', userIds)
      memberships = ((fallbackMemberships.data ?? []) as Array<{ user_id: string }>).map((row) => ({
        user_id: row.user_id,
        status: 'active',
        group_onboarded: true,
      }))
    }

    setGroupMembersMap((prev) => ({
      ...prev,
      [groupId]: (data as any[]).map((m) => ({
        id: m.id as string,
        display_name: (m.display_name as string) ?? '?',
        membership_status: memberships.find((row) => row.user_id === m.user_id)?.status ?? 'active',
        group_onboarded: Boolean(memberships.find((row) => row.user_id === m.user_id)?.group_onboarded ?? true),
      })),
    }))
  }

  const [inviteGroupName, setInviteGroupName] = useState('')
  const [inviteGroupPasscode, setInviteGroupPasscode] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [loadError, setLoadError] = useState(false)

  const loadGroupDetails = async (groupId: string, userId: string) => {
    try {
      const response = await fetch(apiPath('/api/settings/group-details'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, requesterUserId: userId }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) return
      setGroupTitle((result.group?.title as string) ?? '')
      setGroupVisibility(((result.group?.visibility as 'public' | 'private') ?? 'public'))
      setGroupPasscode((result.group?.passcode as string) ?? '')
      setPendingRequests((result.pending as Array<{ id: string; name: string; requestedAt: string }>) ?? [])
    } catch (error) {
      console.error('[Nearby][Settings] Group details load failed:', error)
    }
  }

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
      let parsedRegister: RegisterData | null = null

      if (rawRegister) {
        parsedRegister = JSON.parse(rawRegister) as RegisterData
        if (parsedRegister?.userId) {
          userId = parsedRegister.userId
          profileSource = {
            full_name: parsedRegister.userName,
            phone_number: parsedRegister.phone,
          }
        }
      }

      if (rawSession) {
        const parsed = JSON.parse(rawSession) as Session
        setSession(parsed)
        setExpandedGroupId(parsed.groupId)

        const { data: member, error: memberError } = await supabase
          .from('members')
          .select('user_id, users ( full_name, phone_number )')
          .eq('id', parsed.memberId)
          .maybeSingle()

        if (!memberError && member?.user_id) {
          userId = member.user_id as string
          profileSource = {
            full_name: (member.users as { full_name?: string; phone_number?: string } | null)?.full_name ?? profileSource?.full_name,
            phone_number: (member.users as { full_name?: string; phone_number?: string } | null)?.phone_number ?? profileSource?.phone_number,
          }
        } else {
          console.warn('[Nearby][Settings] Member lookup unavailable, using register fallback:', memberError)
        }
      } else if (rawRegister) {
        const reg = parsedRegister ?? (JSON.parse(rawRegister) as RegisterData)
        userId = reg.userId || userId

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

      if (!userId) {
        throw new Error('SETTINGS_USER_ID_MISSING')
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
        fullName: profileSource?.full_name ?? '',
        phoneNumber: profileSource?.phone_number ?? '',
      })

      if (rawSession) {
        const parsed = JSON.parse(rawSession) as Session
        await loadInviteDetails(parsed.groupId, userId)
        await loadGroupDetails(parsed.groupId, userId)
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

  const saveProfile = async () => {
    if (!profile) return

    setProfileSaved(false)
    setProfileError('')
    setPersonalPasscodeSaved(false)
    setPersonalPasscodeError('')

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

    const code = personalPasscode.trim()
    if (code && code.length < 4) {
      setPersonalPasscodeError('Passcode must be at least 4 characters.')
      return
    }

    setProfileSaving(true)
    setPersonalPasscodeSaving(true)
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

      if (code) {
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData?.session?.access_token ?? null

        if (!accessToken) {
          setPersonalPasscodeError('Your session has expired. Please sign in again.')
          return
        }

        const passcodeResponse = await fetch(apiPath('/api/settings/personal-passcode'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ passcode: code }),
        })

        const passcodeResult = await passcodeResponse.json()
        if (!passcodeResponse.ok || !passcodeResult?.ok) {
          setPersonalPasscodeError(passcodeResult?.message ?? 'We could not save your passcode. Please try again.')
          return
        }

        markPasscodeSet()
        setPersonalPasscode('')
        setPersonalPasscodeSaved(true)
      }

      const raw = localStorage.getItem('nearby_session')
      if (raw) {
        const parsed = JSON.parse(raw) as Session
        localStorage.setItem('nearby_session', JSON.stringify({ ...parsed, memberName: name }))
      }

      const rawRegister = localStorage.getItem('nearby_register')
      if (rawRegister) {
        const parsedRegister = JSON.parse(rawRegister) as RegisterData
        localStorage.setItem('nearby_register', JSON.stringify({ ...parsedRegister, userName: name, phone }))
      }

      setProfileSaved(true)

      if (isPasscodeSetup && code) {
        const hasSession = !!localStorage.getItem('nearby_session')
        router.push(withBasePath(hasSession ? '/nearby' : '/'))
      }
    } catch (error) {
      console.error('[Nearby][Save][Profile] Request failed:', error)
      setProfileError('We could not save your changes. Please try again.')
    } finally {
      setProfileSaving(false)
      setPersonalPasscodeSaving(false)
    }
  }

  const handleLogout = async () => {
    console.log('[Nearby][Settings] Logout clicked')
    try {
      const { error } = await supabase.auth.signOut()
      console.log('[Nearby][Settings] supabase.auth.signOut result:', error ?? 'ok')
    } catch (err) {
      console.warn('[Nearby][Settings] signOut error (continuing):', err)
    }
    localStorage.removeItem('nearby_session')
    localStorage.removeItem('nearby_register')
    localStorage.removeItem('nearby_passcode_set')
    console.log('[Nearby][Settings] localStorage cleared, redirecting to:', withBasePath('/'))
    window.location.replace(withBasePath('/'))
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

  const saveGroupSettings = async () => {
    if (!session || !profile) return
    setGroupSettingsError('')
    setGroupSettingsSaved(false)
    if (!session.groupName.trim() || !groupPasscode.trim()) {
      setGroupSettingsError('Group name and passcode are required.')
      return
    }

    setGroupSettingsSaving(true)
    try {
      const response = await fetch(apiPath('/api/settings/group-details'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: session.groupId,
          requesterUserId: profile.userId,
          name: session.groupName,
          title: groupTitle,
          passcode: groupPasscode,
          visibility: groupVisibility,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setGroupSettingsError(result?.message ?? 'Could not update group settings.')
        return
      }

      setInviteGroupPasscode(groupPasscode)
      setGroupSettingsSaved(true)
    } catch (error) {
      console.error('[Nearby][Settings] Group settings update failed:', error)
      setGroupSettingsError('Could not update group settings.')
    } finally {
      setGroupSettingsSaving(false)
    }
  }

  const decidePending = async (membershipId: string, decision: 'approve' | 'reject') => {
    if (!session || !profile) return
    setPendingActionLoadingId(membershipId)
    try {
      const response = await fetch(apiPath('/api/groups/membership/decision'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          membershipId,
          groupId: session.groupId,
          requesterUserId: profile.userId,
          decision,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) return
      setPendingRequests((prev) => prev.filter((p) => p.id !== membershipId))
      await loadGroupMembers(session.groupId)
    } catch (error) {
      console.error('[Nearby][Settings] Pending decision failed:', error)
    } finally {
      setPendingActionLoadingId(null)
    }
  }

  const refreshGroupCategories = async () => {
    if (!session || !profile) return
    setCategoryRefreshMessage('')
    try {
      const response = await fetch(apiPath('/api/settings/group-categories-refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: session.groupId, requesterUserId: profile.userId }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setCategoryRefreshMessage(result?.message ?? 'Could not refresh categories.')
        return
      }
      setCategoryRefreshMessage(`Categories refreshed. Removed ${result.removed ?? 0} unused categories.`)
    } catch (error) {
      console.error('[Nearby][Settings] Category refresh failed:', error)
      setCategoryRefreshMessage('Could not refresh categories.')
    }
  }

  const deleteGroup = async (group: { groupId: string; memberId: string; groupName: string }) => {
    setDeleteGroupError('')
    setDeletingGroupId(group.groupId)
    try {
      const response = await fetch(apiPath('/api/groups/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.groupId, memberId: group.memberId }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setDeleteGroupError(result?.message ?? 'Something went wrong. Please try again.')
        return
      }

      // Remove from session
      const rawSession = localStorage.getItem('nearby_session')
      if (rawSession) {
        const parsed = JSON.parse(rawSession) as Session
        const remaining = (parsed.allGroups ?? []).filter((g) => g.groupId !== group.groupId)
        if (remaining.length > 0) {
          const next = remaining[0]
          const nextSession = { ...parsed, memberId: next.memberId, memberName: next.memberName, groupId: next.groupId, groupName: next.groupName, allGroups: remaining }
          localStorage.setItem('nearby_session', JSON.stringify(nextSession))
          localStorage.setItem('nearby_last_group_id', next.groupId)
          window.location.replace(withBasePath('/nearby'))
        } else {
          localStorage.removeItem('nearby_session')
          localStorage.removeItem('nearby_last_group_id')
          window.location.replace(withBasePath('/'))
        }
      } else {
        window.location.replace(withBasePath('/'))
      }
    } catch (error) {
      console.error('[Nearby][Settings][DeleteGroup] Request failed:', error)
      setDeleteGroupError('Something went wrong. Please try again.')
    } finally {
      setDeletingGroupId(null)
      setDeleteConfirmGroupId(null)
    }
  }

  const allGroups = session?.allGroups ?? (session ? [{ memberId: session.memberId, memberName: session.memberName, groupId: session.groupId, groupName: session.groupName }] : [])
  return (
    <main className="min-h-screen bg-[#f5f6f8] pb-20">
      <AppHeader
        right={
          <button
            onClick={() => void handleLogout()}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#ead6d2] bg-[#fff8f7] px-3 text-xs font-medium text-[#8a4a43] shadow-sm transition-all hover:bg-[#fdeeee] active:scale-[0.98]"
          >
            Log out
          </button>
        }
      />
      <div className="nearby-shell pt-5">
        <button
          onClick={() => router.push(withBasePath('/nearby'))}
          className="mb-5 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          ← Back
        </button>

        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Update your profile and group passcode settings.</p>

        {isPasscodeSetup && (
          <div className="mt-4 rounded-xl border border-[#d5dceb] bg-[#eef3fb] px-4 py-3 text-sm text-[#1f355d]">
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
            <section className="rounded-2xl border border-[#dfe5f0] bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Profile</h2>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700">Name</label>
                  <input
                    type="text"
                    value={profile.fullName}
                    onChange={(e) => setProfile((prev) => prev ? { ...prev, fullName: e.target.value } : prev)}
                    className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700">Telephone number</label>
                  <input
                    type="tel"
                    value={profile.phoneNumber}
                    onChange={(e) => setProfile((prev) => prev ? { ...prev, phoneNumber: e.target.value } : prev)}
                    className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700">Personal passcode</label>
                  <div className="relative">
                    <input
                      type={showPasscode ? 'text' : 'password'}
                      value={personalPasscode}
                      onChange={(e) => setPersonalPasscode(e.target.value)}
                      placeholder="Leave blank to keep current passcode"
                      className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 pr-12 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600"
                    >
                      {showPasscode ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
                    This passcode is for easy social access within the app — not a high-security password. Please don&apos;t reuse a password from banking, email, or other services. Choose something easy for you to remember.
                  </p>
                </div>

              </div>

              {profileError && <p className="mt-3 text-sm text-amber-700">{profileError}</p>}
              {personalPasscodeError && <p className="mt-3 text-sm text-amber-700">{personalPasscodeError}</p>}
              {profileSaved && <p className="mt-3 text-sm text-[#1f355d]">Profile updated.</p>}
              {personalPasscodeSaved && <p className="mt-2 text-sm text-[#1f355d]">Personal passcode saved.</p>}

              <button
                onClick={saveProfile}
                disabled={profileSaving || personalPasscodeSaving}
                className="mt-4 w-full rounded-xl bg-[#1f355d] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#162746] disabled:opacity-50"
              >
                {(profileSaving || personalPasscodeSaving) ? 'Saving...' : 'Save changes'}
              </button>
            </section>

            <section className="rounded-2xl border border-[#dfe5f0] bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Groups</h2>
              <p className="mt-1 text-xs text-neutral-500">Tap a group to expand details and passcode controls.</p>

              <div className="mt-3 space-y-2">
                {allGroups.map((group) => {
                  const isExpanded = expandedGroupId === group.groupId
                  const isCurrentGroup = session?.groupId === group.groupId

                  return (
                    <div key={group.groupId} className="rounded-xl border border-[#dfe5f0] bg-[#fafbfd]">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedGroupId((prev) => {
                            const next = prev === group.groupId ? null : group.groupId
                            if (next) {
                              void loadGroupMembers(next)
                              if (isCurrentGroup && profile) {
                                void loadGroupDetails(next, profile.userId)
                              }
                            }
                            return next
                          })
                        }}
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[#1f355d]">{group.groupName}</p>
                          <p className="text-xs text-neutral-500">{isCurrentGroup ? 'Current group' : 'Switch in Nearby to manage this group'}</p>
                        </div>
                        <span className="text-sm text-neutral-400">{isExpanded ? '−' : '+'}</span>
                      </button>

                      {isExpanded && (
                        <>
                        <div className="border-t border-[#e6ebf4] px-4 py-3">
                          {isCurrentGroup ? (
                              <>
                                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Group title</label>
                                <input
                                  type="text"
                                  value={groupTitle}
                                  onChange={(e) => setGroupTitle(e.target.value)}
                                  placeholder="Optional short title"
                                  className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                                />

                                <label className="mt-3 mb-1.5 block text-sm font-medium text-neutral-700">Visibility</label>
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setGroupVisibility('public')}
                                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${groupVisibility === 'public' ? 'border-[#1f355d] bg-[#ebf0f9] text-[#1f355d]' : 'border-[#d8deea] bg-white text-[#4d5871] hover:bg-[#f7f9fc]'}`}
                                  >
                                    Public
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setGroupVisibility('private')}
                                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${groupVisibility === 'private' ? 'border-[#1f355d] bg-[#ebf0f9] text-[#1f355d]' : 'border-[#d8deea] bg-white text-[#4d5871] hover:bg-[#f7f9fc]'}`}
                                  >
                                    Private
                                  </button>
                                </div>

                                <label className="mb-1.5 block text-sm font-medium text-neutral-700">New group passcode</label>
                                <div className="relative">
                                  <input
                                    type={showGroupPasscode ? 'text' : 'password'}
                                    value={groupPasscode}
                                    onChange={(e) => setGroupPasscode(e.target.value)}
                                    placeholder="Enter new group passcode"
                                    className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 pr-12 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowGroupPasscode((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600"
                                  >
                                    {showGroupPasscode ? 'Hide' : 'Show'}
                                  </button>
                                </div>
                                <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
                                  Group passcodes are for social convenience — not high security. Share it only with people you want in the group, and avoid reusing passwords from other services.
                                </p>

                                {groupPasscodeError && <p className="mt-3 text-sm text-amber-700">{groupPasscodeError}</p>}
                                {groupPasscodeSaved && <p className="mt-3 text-sm text-[#1f355d]">Group passcode updated.</p>}
                                {groupSettingsError && <p className="mt-3 text-sm text-amber-700">{groupSettingsError}</p>}
                                {groupSettingsSaved && <p className="mt-2 text-sm text-[#1f355d]">Group settings updated.</p>}

                                <button
                                  onClick={saveGroupPasscode}
                                  disabled={groupPasscodeSaving}
                                  className="mt-4 w-full rounded-xl bg-[#1f355d] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#162746] disabled:opacity-50"
                                >
                                  {groupPasscodeSaving ? 'Saving...' : 'Save group passcode'}
                                </button>

                                <button
                                  onClick={saveGroupSettings}
                                  disabled={groupSettingsSaving}
                                  className="mt-2 w-full rounded-xl border border-[#1f355d] bg-white px-4 py-3 text-sm font-medium text-[#1f355d] transition-colors hover:bg-[#eef3fb] disabled:opacity-50"
                                >
                                  {groupSettingsSaving ? 'Saving...' : 'Save group settings'}
                                </button>

                                <button
                                  onClick={refreshGroupCategories}
                                  className="mt-2 w-full rounded-xl border border-[#d6ddeb] bg-white px-4 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                                >
                                  Refresh dish categories
                                </button>
                                {categoryRefreshMessage && <p className="mt-2 text-xs text-neutral-600">{categoryRefreshMessage}</p>}

                                <div className="mt-4">
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
                                </div>

                                {groupVisibility === 'private' && (
                                  <div className="mt-4 rounded-xl border border-[#dfe5f0] bg-[#fafbfd] p-3">
                                    <p className="text-sm font-semibold text-neutral-900">Pending requests</p>
                                    {pendingRequests.length === 0 ? (
                                      <p className="mt-1 text-xs text-neutral-500">No pending requests.</p>
                                    ) : (
                                      <div className="mt-2 space-y-2">
                                        {pendingRequests.map((pending) => (
                                          <div key={pending.id} className="rounded-lg border border-[#e6ebf4] bg-white p-2">
                                            <p className="text-sm text-neutral-800">{pending.name}</p>
                                            <div className="mt-2 flex gap-2">
                                              <button
                                                onClick={() => void decidePending(pending.id, 'approve')}
                                                disabled={pendingActionLoadingId === pending.id}
                                                className="flex-1 rounded-lg bg-[#1f355d] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                                              >
                                                Approve
                                              </button>
                                              <button
                                                onClick={() => void decidePending(pending.id, 'reject')}
                                                disabled={pendingActionLoadingId === pending.id}
                                                className="flex-1 rounded-lg border border-[#d6ddeb] bg-white px-3 py-2 text-xs font-medium text-neutral-700 disabled:opacity-50"
                                              >
                                                Reject
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => router.push(withBasePath('/nearby'))}
                              className="w-full rounded-xl border border-[#d6ddeb] bg-white px-4 py-2.5 text-sm font-medium text-[#1f355d] hover:bg-[#eef3fb]"
                            >
                              Go to Nearby and switch to this group
                            </button>
                          )}
                        </div>

                        {/* Delete group */}
                        <div className="mt-4 border-t border-[#e6ebf4] pt-3">
                          {deleteConfirmGroupId === group.groupId ? (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                              <p className="text-sm font-semibold text-rose-800">Delete &ldquo;{group.groupName}&rdquo;?</p>
                              <p className="mt-1 text-xs text-rose-700 leading-relaxed">
                                All data associated with this group — places, members, and recommendations — will be permanently removed.
                              </p>
                              {deleteGroupError && (
                                <p className="mt-2 text-xs text-rose-700 font-medium">{deleteGroupError}</p>
                              )}
                              <div className="mt-3 flex gap-2">
                                <button
                                  onClick={() => void deleteGroup(group)}
                                  disabled={deletingGroupId === group.groupId}
                                  className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
                                >
                                  {deletingGroupId === group.groupId ? 'Deleting…' : 'Yes, delete'}
                                </button>
                                <button
                                  onClick={() => { setDeleteConfirmGroupId(null); setDeleteGroupError('') }}
                                  className="flex-1 rounded-xl border border-[#d6ddeb] bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setDeleteConfirmGroupId(group.groupId); setDeleteGroupError('') }}
                              className="w-full rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-100 transition-colors"
                            >
                              Delete group
                            </button>
                          )}
                        </div>

                        {/* Member badges */}
                        {(() => {
                          const members = groupMembersMap[group.groupId]
                          if (!members || members.length === 0) return null
                          return (
                            <div className="mt-4 border-t border-[#e6ebf4] pt-3">
                              <p className="text-xs font-medium text-neutral-500 mb-2">Members</p>
                              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                                {members.map((m) => (
                                  <div key={m.id} className="flex flex-col items-center gap-1 shrink-0">
                                    <div
                                      className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold ${
                                        m.membership_status === 'active'
                                          ? 'bg-[#d4edde] text-[#1a6e3a]'
                                          : m.membership_status === 'pending'
                                          ? 'bg-[#fff3cd] text-[#8a6d1f]'
                                          : 'bg-[#e5e8ed] text-[#7a8398]'
                                      }`}
                                      title={`${m.display_name} — ${m.membership_status === 'active' ? (m.group_onboarded ? 'Active' : 'Not onboarded') : m.membership_status === 'pending' ? 'Pending' : 'Removed'}`}
                                    >
                                      {m.display_name.slice(0, 2).toUpperCase()}
                                    </div>
                                    <span className={`text-[10px] leading-none font-medium ${m.membership_status === 'active' ? 'text-[#1a6e3a]' : m.membership_status === 'pending' ? 'text-[#8a6d1f]' : 'text-[#9aa0b0]'}`}>
                                      {m.membership_status === 'active' ? (m.group_onboarded ? 'Active' : 'Not onboarded') : m.membership_status === 'pending' ? 'Pending' : 'Removed'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
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
