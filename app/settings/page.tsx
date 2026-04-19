'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import ErrorState from '@/components/ErrorState'
import { apiPath, withBasePath } from '@/lib/base-path'
import { markPasscodeSet } from '@/lib/auth-guard'
import { buildGroupInviteMessage } from '@/lib/invite'
import { supabase } from '@/lib/supabase'

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

type GroupMember = {
  id: string
  display_name: string
  membership_status: string
  group_onboarded: boolean
}

type PendingRequest = {
  id: string
  name: string
  requestedAt: string
  phoneNumber?: string
}

type GroupSnapshot = {
  name: string
  title: string
  passcode: string
  visibility: 'public' | 'private'
}

function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isPasscodeSetup = searchParams.get('setup') === 'passcode'

  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [personalPasscode, setPersonalPasscode] = useState('')
  const [personalPasscodeSaving, setPersonalPasscodeSaving] = useState(false)
  const [personalPasscodeError, setPersonalPasscodeError] = useState('')
  const [personalPasscodeSaved, setPersonalPasscodeSaved] = useState(false)
  const [showPasscode, setShowPasscode] = useState(false)

  const [groupMembersMap, setGroupMembersMap] = useState<Record<string, GroupMember[]>>({})
  const [groupName, setGroupName] = useState('')
  const [groupTitle, setGroupTitle] = useState('')
  const [groupPasscode, setGroupPasscode] = useState('')
  const [groupVisibility, setGroupVisibility] = useState<'public' | 'private'>('public')
  const [groupSnapshot, setGroupSnapshot] = useState<GroupSnapshot | null>(null)
  const [groupInfoEditing, setGroupInfoEditing] = useState(false)
  const [passcodeEditing, setPasscodeEditing] = useState(false)
  const [showGroupPasscode, setShowGroupPasscode] = useState(false)
  const [groupSettingsSaving, setGroupSettingsSaving] = useState(false)
  const [groupInfoError, setGroupInfoError] = useState('')
  const [groupInfoMessage, setGroupInfoMessage] = useState('')
  const [accessError, setAccessError] = useState('')
  const [accessMessage, setAccessMessage] = useState('')
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [pendingActionLoadingId, setPendingActionLoadingId] = useState<string | null>(null)
  const [categoryRefreshMessage, setCategoryRefreshMessage] = useState('')
  const [invitePhoneNumber, setInvitePhoneNumber] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  const [deleteGroupError, setDeleteGroupError] = useState('')

  const currentMembers = session ? (groupMembersMap[session.groupId] ?? []) : []
  const activeMembers = currentMembers.filter((member) => member.membership_status === 'active')
  const otherGroups = session
    ? (session.allGroups ?? []).filter((group) => group.groupId !== session.groupId)
    : []

  const syncSessionGroupName = (nextGroupName: string) => {
    setSession((prev) => {
      if (!prev) return prev

      const fallbackGroups = [{
        memberId: prev.memberId,
        memberName: prev.memberName,
        groupId: prev.groupId,
        groupName: prev.groupName,
      }]
      const nextAllGroups = (prev.allGroups ?? fallbackGroups).map((group) => (
        group.groupId === prev.groupId ? { ...group, groupName: nextGroupName } : group
      ))

      return {
        ...prev,
        groupName: nextGroupName,
        allGroups: nextAllGroups,
      }
    })

    try {
      const rawSession = localStorage.getItem('nearby_session')
      if (!rawSession) return

      const parsed = JSON.parse(rawSession) as Session
      const fallbackGroups = [{
        memberId: parsed.memberId,
        memberName: parsed.memberName,
        groupId: parsed.groupId,
        groupName: parsed.groupName,
      }]
      const nextAllGroups = (parsed.allGroups ?? fallbackGroups).map((group) => (
        group.groupId === parsed.groupId ? { ...group, groupName: nextGroupName } : group
      ))

      localStorage.setItem('nearby_session', JSON.stringify({
        ...parsed,
        groupName: nextGroupName,
        allGroups: nextAllGroups,
      }))
    } catch (error) {
      console.warn('[Nearby][Settings] Failed to sync group name locally:', error)
    }
  }

  const applyGroupSnapshot = (snapshot: GroupSnapshot) => {
    setGroupSnapshot(snapshot)
    setGroupName(snapshot.name)
    setGroupTitle(snapshot.title)
    setGroupPasscode(snapshot.passcode)
    setGroupVisibility(snapshot.visibility)
  }

  const restoreGroupEditors = () => {
    if (!groupSnapshot) return
    setGroupName(groupSnapshot.name)
    setGroupTitle(groupSnapshot.title)
    setGroupPasscode(groupSnapshot.passcode)
    setGroupVisibility(groupSnapshot.visibility)
  }

  const loadGroupMembers = async (groupId: string, force = false) => {
    if (!force && groupMembersMap[groupId]) return

    const { data, error } = await supabase
      .from('members')
      .select('id, display_name, user_id')
      .eq('group_id', groupId)

    if (error) {
      console.error('[Nearby][Settings] Failed to load group members:', error)
      return
    }

    if (!data || data.length === 0) {
      setGroupMembersMap((prev) => ({ ...prev, [groupId]: [] }))
      return
    }

    const userIds = (data as Array<{ user_id?: string | null }>)
      .map((member) => member.user_id)
      .filter(Boolean) as string[]

    let memberships = [] as Array<{ user_id: string; status?: string | null; group_onboarded?: boolean | null }>

    if (userIds.length > 0) {
      const preferredMemberships = await supabase
        .from('group_memberships')
        .select('user_id, status, group_onboarded')
        .eq('group_id', groupId)
        .in('user_id', userIds)

      memberships = (preferredMemberships.data ?? []) as Array<{ user_id: string; status?: string | null; group_onboarded?: boolean | null }>

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
    }

    setGroupMembersMap((prev) => ({
      ...prev,
      [groupId]: (data as Array<{ id: string; display_name: string; user_id: string }>).map((member) => {
        const membership = memberships.find((row) => row.user_id === member.user_id)
        return {
          id: member.id,
          display_name: member.display_name ?? '?',
          membership_status: membership?.status ?? 'active',
          group_onboarded: Boolean(membership?.group_onboarded ?? true),
        }
      }),
    }))
  }

  const loadGroupDetails = async (groupId: string, userId: string) => {
    try {
      const response = await fetch(apiPath('/api/settings/group-details'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, requesterUserId: userId }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setAccessError(result?.message ?? 'Could not load group settings.')
        return
      }

      const snapshot: GroupSnapshot = {
        name: (result.group?.name as string) ?? '',
        title: (result.group?.title as string) ?? '',
        passcode: (result.group?.passcode as string) ?? '',
        visibility: ((result.group?.visibility as 'public' | 'private') ?? 'public'),
      }

      applyGroupSnapshot(snapshot)
      syncSessionGroupName(snapshot.name)
      setPendingRequests((result.pending as PendingRequest[]) ?? [])
    } catch (error) {
      console.error('[Nearby][Settings] Group details load failed:', error)
      setAccessError('Could not load group settings.')
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
        setGroupName(parsed.groupName)

        const { data: member, error: memberError } = await supabase
          .from('members')
          .select('user_id, users ( full_name, phone_number )')
          .eq('id', parsed.memberId)
          .maybeSingle()

        if (!memberError && member?.user_id) {
          userId = member.user_id as string
          const memberUser = member.users as { full_name?: string; phone_number?: string } | null
          profileSource = {
            full_name: memberUser?.full_name ?? profileSource?.full_name,
            phone_number: memberUser?.phone_number ?? profileSource?.phone_number,
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
        await Promise.all([
          loadGroupMembers(parsed.groupId, true),
          loadGroupDetails(parsed.groupId, userId),
        ])
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
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.warn('[Nearby][Settings] signOut error (continuing):', error)
    }

    localStorage.removeItem('nearby_session')
    localStorage.removeItem('nearby_register')
    localStorage.removeItem('nearby_passcode_set')
    window.location.replace(withBasePath('/'))
  }

  const saveGroupSettings = async (section: 'info' | 'access') => {
    if (!session || !profile) return

    setGroupInfoError('')
    setGroupInfoMessage('')
    setAccessError('')
    setAccessMessage('')

    const nextName = groupName.trim()
    const nextTitle = groupTitle.trim()
    const nextPasscode = groupPasscode.trim()

    if (!nextName) {
      setGroupInfoError('Group name is required.')
      return
    }

    if (!nextPasscode) {
      setAccessError('Group passcode is required.')
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
          name: nextName,
          title: nextTitle,
          passcode: nextPasscode,
          visibility: groupVisibility,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        if (section === 'info') {
          setGroupInfoError(result?.message ?? 'Could not update group info.')
        } else {
          setAccessError(result?.message ?? 'Could not update access settings.')
        }
        return
      }

      const snapshot: GroupSnapshot = {
        name: nextName,
        title: nextTitle || nextName,
        passcode: nextPasscode,
        visibility: groupVisibility,
      }

      applyGroupSnapshot(snapshot)
      syncSessionGroupName(snapshot.name)

      if (section === 'info') {
        setGroupInfoEditing(false)
        setGroupInfoMessage('Group info updated.')
      } else {
        setPasscodeEditing(false)
        setAccessMessage('Access settings updated.')
      }
    } catch (error) {
      console.error('[Nearby][Settings] Group settings update failed:', error)
      if (section === 'info') {
        setGroupInfoError('Could not update group info.')
      } else {
        setAccessError('Could not update access settings.')
      }
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
      if (!response.ok || !result?.ok) {
        setAccessError(result?.message ?? 'Could not update join request.')
        return
      }

      setPendingRequests((prev) => prev.filter((request) => request.id !== membershipId))
      await loadGroupMembers(session.groupId, true)
    } catch (error) {
      console.error('[Nearby][Settings] Pending decision failed:', error)
      setAccessError('Could not update join request.')
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

  const copyGroupPasscode = async () => {
    setAccessError('')
    setAccessMessage('')

    if (!groupPasscode.trim()) {
      setAccessError('No passcode available to copy.')
      return
    }

    try {
      await navigator.clipboard.writeText(groupPasscode.trim())
      setAccessMessage('Passcode copied.')
    } catch (error) {
      console.error('[Nearby][Settings] Copy passcode failed:', error)
      setAccessError('Could not copy passcode right now.')
    }
  }

  const inviteMemberByPhone = async () => {
    setInviteError('')
    setInviteMessage('')

    const targetPhone = invitePhoneNumber.trim().replace(/[^\d+]/g, '')
    if (targetPhone.replace(/\D/g, '').length < 8) {
      setInviteError('Enter a valid phone number to invite.')
      return
    }

    const message = buildGroupInviteMessage(groupName || session?.groupName || 'Your Group', groupPasscode)

    try {
      await navigator.clipboard.writeText(message)
      setInviteMessage('Invite copied. Opening your messaging app.')
    } catch (error) {
      console.error('[Nearby][Settings] Copy invite failed:', error)
      setInviteError('Could not prepare the invite message.')
      return
    }

    try {
      window.location.href = `sms:${targetPhone}?&body=${encodeURIComponent(message)}`
    } catch (error) {
      console.error('[Nearby][Settings] SMS handoff failed:', error)
      setInviteMessage('Invite copied. Send it to that number from your messaging app.')
    }
  }

  const deleteGroup = async () => {
    if (!session) return

    setDeleteGroupError('')
    setDeletingGroupId(session.groupId)
    try {
      const response = await fetch(apiPath('/api/groups/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: session.groupId, memberId: session.memberId }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setDeleteGroupError(result?.message ?? 'Something went wrong. Please try again.')
        return
      }

      const rawSession = localStorage.getItem('nearby_session')
      if (rawSession) {
        const parsed = JSON.parse(rawSession) as Session
        const remaining = (parsed.allGroups ?? []).filter((group) => group.groupId !== session.groupId)

        if (remaining.length > 0) {
          const next = remaining[0]
          const nextSession = {
            ...parsed,
            memberId: next.memberId,
            memberName: next.memberName,
            groupId: next.groupId,
            groupName: next.groupName,
            allGroups: remaining,
          }
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
      setDeleteConfirmOpen(false)
    }
  }

  const formatRequestedAt = (value: string) => {
    if (!value) return ''

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ''

    return parsed.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  }

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
        <p className="mt-1 text-sm text-neutral-500">Update your profile and manage how your current group works.</p>

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
                    onChange={(event) => setProfile((prev) => prev ? { ...prev, fullName: event.target.value } : prev)}
                    className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700">Telephone number</label>
                  <input
                    type="tel"
                    value={profile.phoneNumber}
                    onChange={(event) => setProfile((prev) => prev ? { ...prev, phoneNumber: event.target.value } : prev)}
                    className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700">Personal passcode</label>
                  <div className="relative">
                    <input
                      type={showPasscode ? 'text' : 'password'}
                      value={personalPasscode}
                      onChange={(event) => setPersonalPasscode(event.target.value)}
                      placeholder="Leave blank to keep current passcode"
                      className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 pr-12 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600"
                    >
                      {showPasscode ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                    This passcode is for easy social access within the app, not a high-security password. Do not reuse one from banking, email, or other services.
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

            {session ? (
              <section className="space-y-4">
                <div className="rounded-2xl border border-[#dfe5f0] bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#677088]">Current group</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-neutral-900">{groupName || session.groupName}</h2>
                  {otherGroups.length > 0 && (
                    <p className="mt-2 text-sm text-neutral-500">
                      These settings apply to your current group. Switch groups in Nearby to manage {otherGroups.length === 1 ? 'the other group' : 'your other groups'}.
                    </p>
                  )}
                </div>

                <section className="rounded-2xl border border-[#dfe5f0] bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-neutral-900">1. Group Info</h2>
                      <p className="mt-1 text-sm text-neutral-500">Keep the basics clear: name and title.</p>
                    </div>
                    {!groupInfoEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setGroupInfoEditing(true)
                          setGroupInfoError('')
                          setGroupInfoMessage('')
                        }}
                        className="rounded-full border border-[#d6ddeb] bg-white px-3 py-1.5 text-xs font-medium text-[#1f355d] hover:bg-[#eef3fb]"
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {groupInfoEditing ? (
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Group name</label>
                        <input
                          type="text"
                          value={groupName}
                          onChange={(event) => setGroupName(event.target.value)}
                          className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Title / Description</label>
                        <textarea
                          value={groupTitle}
                          onChange={(event) => setGroupTitle(event.target.value)}
                          rows={3}
                          className="w-full rounded-xl border border-[#d6ddeb] px-4 py-3 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveGroupSettings('info')}
                          disabled={groupSettingsSaving}
                          className="flex-1 rounded-xl bg-[#1f355d] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#162746] disabled:opacity-50"
                        >
                          {groupSettingsSaving ? 'Saving...' : 'Save group info'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            restoreGroupEditors()
                            setGroupInfoEditing(false)
                            setGroupInfoError('')
                          }}
                          className="flex-1 rounded-xl border border-[#d6ddeb] bg-white px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-[#e6ebf4] bg-[#fafbfd] px-4 py-3">
                        <p className="text-xs text-neutral-500">Group Name</p>
                        <p className="mt-1 text-sm font-semibold text-neutral-900">{groupName || session.groupName}</p>
                      </div>
                      <div className="rounded-xl border border-[#e6ebf4] bg-[#fafbfd] px-4 py-3">
                        <p className="text-xs text-neutral-500">Title / Description</p>
                        <p className="mt-1 text-sm text-neutral-700">{groupTitle || 'No description yet.'}</p>
                      </div>
                    </div>
                  )}

                  {groupInfoError && <p className="mt-3 text-sm text-amber-700">{groupInfoError}</p>}
                  {groupInfoMessage && <p className="mt-3 text-sm text-[#1f355d]">{groupInfoMessage}</p>}

                  <div className="mt-5 border-t border-[#e6ebf4] pt-4">
                    <p className="text-xs font-medium text-neutral-500">Danger zone</p>
                    {deleteConfirmOpen ? (
                      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                        <p className="text-sm font-semibold text-rose-800">Delete this group?</p>
                        <p className="mt-1 text-xs leading-relaxed text-rose-700">
                          All places, members, and recommendations in this group will be permanently removed.
                        </p>
                        {deleteGroupError && <p className="mt-2 text-xs font-medium text-rose-700">{deleteGroupError}</p>}
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void deleteGroup()}
                            disabled={deletingGroupId === session.groupId}
                            className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
                          >
                            {deletingGroupId === session.groupId ? 'Deleting...' : 'Yes, delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteConfirmOpen(false)
                              setDeleteGroupError('')
                            }}
                            className="flex-1 rounded-xl border border-[#d6ddeb] bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirmOpen(true)
                          setDeleteGroupError('')
                        }}
                        className="mt-3 w-full rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2.5 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100"
                      >
                        Delete group
                      </button>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-[#dfe5f0] bg-white p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-neutral-900">2. Access &amp; Joining</h2>
                  <p className="mt-1 text-sm text-neutral-500">Choose how people join, then reveal extra controls only when needed.</p>

                  <div className="mt-4">
                    <p className="text-sm font-medium text-neutral-700">Access Type</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setGroupVisibility('public')
                          setAccessError('')
                          setAccessMessage('')
                        }}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${groupVisibility === 'public' ? 'border-[#1f355d] bg-[#ebf0f9] text-[#1f355d]' : 'border-[#d8deea] bg-white text-[#4d5871] hover:bg-[#f7f9fc]'}`}
                      >
                        Public
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGroupVisibility('private')
                          setAccessError('')
                          setAccessMessage('')
                        }}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${groupVisibility === 'private' ? 'border-[#1f355d] bg-[#ebf0f9] text-[#1f355d]' : 'border-[#d8deea] bg-white text-[#4d5871] hover:bg-[#f7f9fc]'}`}
                      >
                        Private
                      </button>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                      {groupVisibility === 'public'
                        ? 'Anyone with the passcode can join instantly'
                        : 'People must request access and be approved'}
                    </p>
                  </div>

                  <div className="mt-4 rounded-xl border border-[#e6ebf4] bg-[#fafbfd] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">Passcode</p>
                        <p className="mt-1 text-xs text-neutral-500">Share this only with people you want in the group.</p>
                      </div>
                      {!passcodeEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setPasscodeEditing(true)
                            setAccessError('')
                            setAccessMessage('')
                          }}
                          className="rounded-full border border-[#d6ddeb] bg-white px-3 py-1.5 text-xs font-medium text-[#1f355d] hover:bg-[#eef3fb]"
                        >
                          Change
                        </button>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <div className="min-w-0 flex-1 rounded-xl border border-[#d6ddeb] bg-white px-4 py-2.5 text-sm font-semibold tracking-[0.18em] text-neutral-900">
                        {showGroupPasscode ? (groupPasscode || 'No passcode') : '••••••••'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowGroupPasscode((prev) => !prev)}
                        className="rounded-xl border border-[#d6ddeb] bg-white px-3 py-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        {showGroupPasscode ? 'Hide' : 'Show'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyGroupPasscode()}
                        className="rounded-xl border border-[#d6ddeb] bg-white px-3 py-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        Copy
                      </button>
                    </div>

                    {passcodeEditing && (
                      <div className="mt-3 space-y-3">
                        <input
                          type={showGroupPasscode ? 'text' : 'password'}
                          value={groupPasscode}
                          onChange={(event) => setGroupPasscode(event.target.value)}
                          placeholder="Enter new group passcode"
                          className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void saveGroupSettings('access')}
                            disabled={groupSettingsSaving}
                            className="flex-1 rounded-xl bg-[#1f355d] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#162746] disabled:opacity-50"
                          >
                            {groupSettingsSaving ? 'Saving...' : 'Save access settings'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              restoreGroupEditors()
                              setPasscodeEditing(false)
                              setAccessError('')
                            }}
                            className="flex-1 rounded-xl border border-[#d6ddeb] bg-white px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {groupVisibility === 'private' && (
                    <div className="mt-4 rounded-xl border border-[#e6ebf4] bg-[#fafbfd] p-4">
                      <p className="text-sm font-semibold text-neutral-900">Invite Members</p>
                      <p className="mt-1 text-xs text-neutral-500">Send the current invite and passcode to a phone number.</p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          type="tel"
                          value={invitePhoneNumber}
                          onChange={(event) => setInvitePhoneNumber(event.target.value)}
                          placeholder="Phone number"
                          className="min-w-0 flex-1 rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                        />
                        <button
                          type="button"
                          onClick={() => void inviteMemberByPhone()}
                          className="rounded-xl bg-[#1f355d] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#162746]"
                        >
                          Invite
                        </button>
                      </div>
                      {inviteError && <p className="mt-2 text-sm text-amber-700">{inviteError}</p>}
                      {inviteMessage && <p className="mt-2 text-sm text-[#1f355d]">{inviteMessage}</p>}
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border border-[#e6ebf4] bg-[#fafbfd] p-4">
                    <p className="text-sm font-semibold text-neutral-900">Utilities</p>
                    <p className="mt-1 text-xs text-neutral-500">Housekeeping tools for this group.</p>
                    <button
                      type="button"
                      onClick={() => void refreshGroupCategories()}
                      className="mt-3 w-full rounded-xl border border-[#d6ddeb] bg-white px-4 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                    >
                      Refresh dish categories
                    </button>
                    {categoryRefreshMessage && <p className="mt-2 text-xs text-neutral-600">{categoryRefreshMessage}</p>}
                  </div>

                  {accessError && <p className="mt-3 text-sm text-amber-700">{accessError}</p>}
                  {accessMessage && <p className="mt-3 text-sm text-[#1f355d]">{accessMessage}</p>}
                </section>

                <section className="rounded-2xl border border-[#dfe5f0] bg-white p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-neutral-900">3. Members</h2>
                  <p className="mt-1 text-sm text-neutral-500">See who is active, who is still onboarding, and who is waiting for approval.</p>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-neutral-900">Active Members</h3>
                      <span className="rounded-full bg-[#eef3fb] px-2.5 py-1 text-xs font-medium text-[#1f355d]">
                        {activeMembers.length}
                      </span>
                    </div>

                    {activeMembers.length === 0 ? (
                      <p className="mt-3 text-sm text-neutral-500">No active members found.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {activeMembers.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[#e6ebf4] bg-[#fafbfd] px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-neutral-900">{member.display_name}</p>
                              <p className="mt-1 text-xs text-neutral-500">Active member</p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${member.group_onboarded ? 'bg-[#d4edde] text-[#1a6e3a]' : 'bg-[#fff3cd] text-[#8a6d1f]'}`}
                            >
                              {member.group_onboarded ? 'Onboarded' : 'Not onboarded'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {groupVisibility === 'private' && (
                    <div className="mt-6 border-t border-[#e6ebf4] pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-neutral-900">Pending Requests</h3>
                        <span className="rounded-full bg-[#fff3cd] px-2.5 py-1 text-xs font-medium text-[#8a6d1f]">
                          {pendingRequests.length}
                        </span>
                      </div>

                      {pendingRequests.length === 0 ? (
                        <p className="mt-3 text-sm text-neutral-500">No pending requests.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {pendingRequests.map((pending) => (
                            <div
                              key={pending.id}
                              className="rounded-xl border border-[#e6ebf4] bg-[#fafbfd] px-4 py-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-neutral-900">{pending.name}</p>
                                  {pending.phoneNumber && <p className="mt-1 text-xs text-neutral-500">{pending.phoneNumber}</p>}
                                  <p className="mt-1 text-xs text-neutral-500">
                                    Pending{formatRequestedAt(pending.requestedAt) ? ` since ${formatRequestedAt(pending.requestedAt)}` : ''}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-[#fff3cd] px-2.5 py-1 text-xs font-medium text-[#8a6d1f]">
                                  Pending
                                </span>
                              </div>
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void decidePending(pending.id, 'approve')}
                                  disabled={pendingActionLoadingId === pending.id}
                                  className="flex-1 rounded-xl bg-[#1f355d] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#162746] disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void decidePending(pending.id, 'reject')}
                                  disabled={pendingActionLoadingId === pending.id}
                                  className="flex-1 rounded-xl border border-[#d6ddeb] bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
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
                </section>
              </section>
            ) : (
              <section className="rounded-2xl border border-[#dfe5f0] bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-neutral-900">Group Settings</h2>
                <p className="mt-2 text-sm text-neutral-500">You are signed in, but you do not have an active group yet.</p>
                <button
                  type="button"
                  onClick={() => router.push(withBasePath('/join-group'))}
                  className="mt-4 w-full rounded-xl bg-[#1f355d] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#162746]"
                >
                  Join a group
                </button>
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