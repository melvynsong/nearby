'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
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

type GroupPerson = {
  userId: string
  memberId: string
  name: string
  phoneNumber: string
  role: 'owner' | 'member'
}

type GroupInvite = {
  id: string
  phoneNumber: string
  status: 'invited' | 'joined'
  name: string
  createdAt: string
  joinedAt: string | null
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

  const [groupName, setGroupName] = useState('')
  const [groupPasscode, setGroupPasscode] = useState('')
  const [groupVisibility, setGroupVisibility] = useState<'public' | 'private'>('public')
  const [groupSettingsSaving, setGroupSettingsSaving] = useState(false)
  const [groupSettingsError, setGroupSettingsError] = useState('')
  const [groupSettingsMessage, setGroupSettingsMessage] = useState('')
  const [groupInfoEditing, setGroupInfoEditing] = useState(false)
  const [showGroupPasscode, setShowGroupPasscode] = useState(false)
  const [people, setPeople] = useState<GroupPerson[]>([])
  const [invites, setInvites] = useState<GroupInvite[]>([])
  const [invitePhoneNumber, setInvitePhoneNumber] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [requesterRole, setRequesterRole] = useState<'owner' | 'member'>('member')
  const [peopleActionLoadingUserId, setPeopleActionLoadingUserId] = useState<string | null>(null)
  const [categoryRefreshMessage, setCategoryRefreshMessage] = useState('')
  const [deleteGroupError, setDeleteGroupError] = useState('')
  const [deletingGroup, setDeletingGroup] = useState(false)

  const groupInviteMessage = useMemo(
    () => buildGroupInviteMessage(groupName || session?.groupName || 'Your Group', groupPasscode || 'N/A'),
    [groupName, groupPasscode, session?.groupName],
  )

  const loadGroupDetails = async (groupId: string, userId: string) => {
    const response = await fetch(apiPath('/api/settings/group-details'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, requesterUserId: userId }),
    })

    const result = await response.json()
    if (!response.ok || !result?.ok) {
      throw new Error(result?.message ?? 'Could not load group settings.')
    }

    const nextName = (result.group?.name as string) ?? ''
    setGroupName(nextName)
    setGroupPasscode((result.group?.passcode as string) ?? '')
    setGroupVisibility(((result.group?.visibility as 'public' | 'private') ?? 'public'))
    setRequesterRole(((result.requesterRole as 'owner' | 'member') ?? 'member'))
    setPeople(((result.members as GroupPerson[]) ?? []).map((person) => ({
      userId: person.userId,
      memberId: person.memberId,
      name: person.name,
      phoneNumber: person.phoneNumber,
      role: person.role === 'owner' ? 'owner' : 'member',
    })))
    setInvites(((result.invites as GroupInvite[]) ?? []).map((invite) => ({
      id: invite.id,
      phoneNumber: invite.phoneNumber,
      status: invite.status === 'joined' ? 'joined' : 'invited',
      name: invite.name ?? '',
      createdAt: invite.createdAt,
      joinedAt: invite.joinedAt,
    })))

    setSession((prev) => {
      if (!prev) return prev
      const nextAllGroups = (prev.allGroups ?? []).map((group) => (
        group.groupId === prev.groupId ? { ...group, groupName: nextName || group.groupName } : group
      ))
      const next = {
        ...prev,
        groupName: nextName || prev.groupName,
        allGroups: nextAllGroups,
      }
      localStorage.setItem('nearby_session', JSON.stringify(next))
      return next
    })
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

      if (rawRegister) {
        const parsedRegister = JSON.parse(rawRegister) as RegisterData
        userId = parsedRegister.userId || userId
        profileSource = {
          full_name: parsedRegister.userName,
          phone_number: parsedRegister.phone,
        }
      }

      if (rawSession) {
        const parsed = JSON.parse(rawSession) as Session
        setSession(parsed)

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
        }
      }

      if (!userId) {
        throw new Error('SETTINGS_USER_ID_MISSING')
      }

      if (userId && (!profileSource?.full_name || !profileSource?.phone_number)) {
        const { data: userFallback } = await supabase
          .from('users')
          .select('id, full_name, phone_number')
          .eq('id', userId)
          .maybeSingle()

        if (userFallback?.id) {
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

  const saveGroupSettings = async () => {
    if (!session || !profile) return

    setGroupSettingsError('')
    setGroupSettingsMessage('')

    const nextName = groupName.trim()
    const nextPasscode = groupPasscode.trim()

    if (!nextName || !nextPasscode) {
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
          name: nextName,
          title: nextName,
          passcode: nextPasscode,
          visibility: groupVisibility,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setGroupSettingsError(result?.message ?? 'Could not update group settings.')
        return
      }

      setGroupSettingsMessage('Group settings updated.')
      setGroupInfoEditing(false)
      await loadGroupDetails(session.groupId, profile.userId)
    } catch (error) {
      console.error('[Nearby][Settings] Group settings update failed:', error)
      setGroupSettingsError('Could not update group settings.')
    } finally {
      setGroupSettingsSaving(false)
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

      setCategoryRefreshMessage(`Refreshed (${result.removed ?? 0} removed).`)
    } catch (error) {
      console.error('[Nearby][Settings] Category refresh failed:', error)
      setCategoryRefreshMessage('Could not refresh categories.')
    }
  }

  const copyGroupPasscode = async () => {
    setGroupSettingsError('')
    try {
      await navigator.clipboard.writeText(groupPasscode.trim())
      setGroupSettingsMessage('Passcode copied.')
    } catch (error) {
      console.error('[Nearby][Settings] Copy passcode failed:', error)
      setGroupSettingsError('Could not copy passcode right now.')
    }
  }

  const copyInviteMessage = async () => {
    setGroupSettingsError('')
    try {
      await navigator.clipboard.writeText(groupInviteMessage)
      setGroupSettingsMessage('Invite message copied.')
    } catch (error) {
      console.error('[Nearby][Settings] Copy invite failed:', error)
      setGroupSettingsError('Could not copy invite right now.')
    }
  }

  const addPrivateInvite = async () => {
    if (!session || !profile) return

    setGroupSettingsError('')
    setGroupSettingsMessage('')

    const phoneNumber = invitePhoneNumber.replace(/\D/g, '')
    if (phoneNumber.length < 8) {
      setGroupSettingsError('Enter a valid phone number.')
      return
    }

    setInviteSaving(true)
    try {
      const response = await fetch(apiPath('/api/settings/group-invites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: session.groupId,
          requesterUserId: profile.userId,
          phoneNumber,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setGroupSettingsError(result?.message ?? 'Could not add invite.')
        return
      }

      setInvitePhoneNumber('')
      setGroupSettingsMessage('Invite saved.')
      await loadGroupDetails(session.groupId, profile.userId)
    } catch (error) {
      console.error('[Nearby][Settings] Add invite failed:', error)
      setGroupSettingsError('Could not add invite.')
    } finally {
      setInviteSaving(false)
    }
  }

  const shareViaWhatsApp = () => {
    setGroupSettingsError('')
    try {
      const encoded = encodeURIComponent(groupInviteMessage)
      const isMobile = /iPhone|Android/i.test(navigator.userAgent)
      const url = isMobile
        ? `https://wa.me/?text=${encoded}`
        : `https://web.whatsapp.com/send?text=${encoded}`
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error('[Nearby][Settings] WhatsApp share failed:', error)
      setGroupSettingsError('Could not open WhatsApp share.')
    }
  }

  const updatePersonRole = async (targetUserId: string, action: 'promote_member' | 'promote_owner' | 'remove') => {
    if (!session || !profile) return

    setPeopleActionLoadingUserId(targetUserId)
    setGroupSettingsError('')
    setGroupSettingsMessage('')

    try {
      const response = await fetch(apiPath('/api/settings/group-members'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: session.groupId,
          requesterUserId: profile.userId,
          targetUserId,
          action,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setGroupSettingsError(result?.message ?? 'Could not update this person.')
        return
      }

      setGroupSettingsMessage('People updated.')
      await loadGroupDetails(session.groupId, profile.userId)
    } catch (error) {
      console.error('[Nearby][Settings] Person update failed:', error)
      setGroupSettingsError('Could not update this person.')
    } finally {
      setPeopleActionLoadingUserId(null)
    }
  }

  const deleteGroup = async () => {
    if (!session) return

    setDeleteGroupError('')
    setDeletingGroup(true)
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
      }
    } catch (error) {
      console.error('[Nearby][Settings][DeleteGroup] Request failed:', error)
      setDeleteGroupError('Something went wrong. Please try again.')
    } finally {
      setDeletingGroup(false)
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

  return (
    <main className="min-h-screen bg-[#f5f6f8] pb-20">
      <AppHeader
        right={
          <button
            onClick={() => void handleLogout()}
            className="inline-flex h-8 items-center rounded-full border border-[#ead6d2] bg-[#fff8f7] px-3 text-xs font-medium text-[#8a4a43] hover:bg-[#fdeeee]"
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

        {isPasscodeSetup && (
          <div className="mt-4 rounded-xl border border-[#d5dceb] bg-[#eef3fb] px-4 py-3 text-sm text-[#1f355d]">
            <span className="font-semibold">One more step:</span> set your personal passcode below.
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
                <input
                  type="text"
                  value={profile.fullName}
                  onChange={(event) => setProfile((prev) => prev ? { ...prev, fullName: event.target.value } : prev)}
                  placeholder="Name"
                  className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none"
                />
                <input
                  type="tel"
                  value={profile.phoneNumber}
                  onChange={(event) => setProfile((prev) => prev ? { ...prev, phoneNumber: event.target.value } : prev)}
                  placeholder="Telephone number"
                  className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none"
                />
                <div className="relative">
                  <input
                    type={showPasscode ? 'text' : 'password'}
                    value={personalPasscode}
                    onChange={(event) => setPersonalPasscode(event.target.value)}
                    placeholder="Personal passcode (optional)"
                    className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 pr-12 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400"
                  >
                    {showPasscode ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              {profileError && <p className="mt-3 text-sm text-amber-700">{profileError}</p>}
              {personalPasscodeError && <p className="mt-3 text-sm text-amber-700">{personalPasscodeError}</p>}
              {profileSaved && <p className="mt-3 text-sm text-[#1f355d]">Profile updated.</p>}
              {personalPasscodeSaved && <p className="mt-2 text-sm text-[#1f355d]">Personal passcode saved.</p>}
              <button
                onClick={saveProfile}
                disabled={profileSaving || personalPasscodeSaving}
                className="mt-4 w-full rounded-xl bg-[#1f355d] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {(profileSaving || personalPasscodeSaving) ? 'Saving...' : 'Save profile'}
              </button>
            </section>

            {session && (
              <>
                <section className="rounded-2xl border border-[#dfe5f0] bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-semibold text-neutral-900">1. Group Info</h2>
                    <button
                      type="button"
                      onClick={() => void refreshGroupCategories()}
                      className="h-8 w-8 rounded-full border border-[#d6ddeb] bg-white text-xs text-[#1f355d] hover:bg-[#eef3fb]"
                      title="Refresh dish categories"
                    >
                      ↻
                    </button>
                  </div>

                  {groupInfoEditing ? (
                    <div className="mt-4 space-y-3">
                      <input
                        type="text"
                        value={groupName}
                        onChange={(event) => setGroupName(event.target.value)}
                        placeholder="Group name"
                        className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveGroupSettings()}
                          disabled={groupSettingsSaving}
                          className="flex-1 rounded-xl bg-[#1f355d] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {groupSettingsSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGroupInfoEditing(false)
                            if (session) setGroupName(session.groupName)
                          }}
                          className="flex-1 rounded-xl border border-[#d6ddeb] bg-white px-4 py-3 text-sm font-medium text-neutral-700"
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                        <p className="text-xs font-medium text-rose-700">Delete group</p>
                        <button
                          type="button"
                          onClick={() => void deleteGroup()}
                          disabled={deletingGroup}
                          className="mt-2 w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {deletingGroup ? 'Deleting...' : 'Delete this group'}
                        </button>
                        {deleteGroupError && <p className="mt-2 text-xs text-rose-700">{deleteGroupError}</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center justify-between rounded-xl border border-[#e6ebf4] bg-[#fafbfd] px-4 py-3">
                      <p className="text-sm font-medium text-neutral-900">{groupName || session.groupName}</p>
                      <button
                        type="button"
                        onClick={() => setGroupInfoEditing(true)}
                        className="rounded-full border border-[#d6ddeb] bg-white px-3 py-1.5 text-xs font-medium text-[#1f355d]"
                      >
                        Edit
                      </button>
                    </div>
                  )}

                  {categoryRefreshMessage && <p className="mt-2 text-xs text-neutral-500">{categoryRefreshMessage}</p>}
                </section>

                <section className="rounded-2xl border border-[#dfe5f0] bg-white p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-neutral-900">2. Access &amp; People</h2>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setGroupVisibility('public')}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${groupVisibility === 'public' ? 'border-[#1f355d] bg-[#ebf0f9] text-[#1f355d]' : 'border-[#d8deea] bg-white text-[#4d5871]'}`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupVisibility('private')}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${groupVisibility === 'private' ? 'border-[#1f355d] bg-[#ebf0f9] text-[#1f355d]' : 'border-[#d8deea] bg-white text-[#4d5871]'}`}
                    >
                      Private
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    {groupVisibility === 'public'
                      ? 'Anyone with passcode can access.'
                      : 'Only invited phone numbers with passcode can join.'}
                  </p>

                  <div className="mt-4 rounded-xl border border-[#e6ebf4] bg-[#fafbfd] p-3">
                    <p className="text-xs text-neutral-500">Passcode</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="min-w-0 flex-1 rounded-xl border border-[#d6ddeb] bg-white px-4 py-2.5 text-sm font-semibold tracking-[0.18em] text-neutral-900">
                        {showGroupPasscode ? groupPasscode : '••••••••'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowGroupPasscode((prev) => !prev)}
                        className="rounded-xl border border-[#d6ddeb] bg-white px-3 py-2.5 text-xs font-medium text-neutral-700"
                      >
                        {showGroupPasscode ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void copyGroupPasscode()}
                        className="flex-1 rounded-xl border border-[#d6ddeb] bg-white px-3 py-2.5 text-xs font-medium text-neutral-700"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={shareViaWhatsApp}
                        className="flex-1 rounded-xl border border-[#d6ddeb] bg-white px-3 py-2.5 text-xs font-medium text-neutral-700"
                      >
                        Share via WhatsApp
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={shareViaWhatsApp}
                      className="rounded-xl border border-[#d6ddeb] bg-white px-3 py-2.5 text-sm font-medium text-neutral-700"
                    >
                      Invite via WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyInviteMessage()}
                      className="rounded-xl border border-[#d6ddeb] bg-white px-3 py-2.5 text-sm font-medium text-neutral-700"
                    >
                      Copy Invite Message
                    </button>
                  </div>

                  {groupVisibility === 'private' && (
                    <div className="mt-4 rounded-xl border border-[#e6ebf4] bg-[#fafbfd] p-3">
                      <p className="text-sm font-semibold text-neutral-900">Invite Members</p>
                      <div className="mt-2 flex gap-2">
                        <input
                          type="tel"
                          value={invitePhoneNumber}
                          onChange={(event) => setInvitePhoneNumber(event.target.value)}
                          placeholder="Phone number"
                          className="min-w-0 flex-1 rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void addPrivateInvite()}
                          disabled={inviteSaving}
                          className="rounded-xl bg-[#1f355d] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {inviteSaving ? 'Inviting...' : 'Invite'}
                        </button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {invites.map((invite) => (
                          <div key={invite.id} className="rounded-xl border border-[#e6ebf4] bg-white px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium text-neutral-900">{invite.name || invite.phoneNumber}</p>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${invite.status === 'joined' ? 'bg-[#d4edde] text-[#1a6e3a]' : 'bg-[#fff3cd] text-[#8a6d1f]'}`}>
                                {invite.status === 'joined' ? 'Joined' : 'Invited'}
                              </span>
                            </div>
                            {invite.name && <p className="mt-1 text-xs text-neutral-500">{invite.phoneNumber}</p>}
                          </div>
                        ))}
                        {invites.length === 0 && <p className="text-xs text-neutral-500">No invites yet.</p>}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 border-t border-[#e6ebf4] pt-4">
                    <h3 className="text-sm font-semibold text-neutral-900">Members</h3>
                    <div className="mt-2 space-y-2">
                      {people.map((person) => {
                        const label = person.name || person.phoneNumber || 'User'
                        const isOwner = person.role === 'owner'
                        const canRemove = !isOwner || requesterRole === 'owner'
                        return (
                          <div key={person.userId} className="rounded-xl border border-[#e6ebf4] bg-[#fafbfd] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-neutral-900">{label}</p>
                                {!!person.phoneNumber && <p className="truncate text-xs text-neutral-500">{person.phoneNumber}</p>}
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isOwner ? 'bg-[#fde9cd] text-[#8a5a12]' : 'bg-[#eef3fb] text-[#1f355d]'}`}>
                                {isOwner ? 'Owner' : 'Member'}
                              </span>
                            </div>

                            {(requesterRole === 'owner' || canRemove) && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {requesterRole === 'owner' && !isOwner && (
                                  <button
                                    type="button"
                                    onClick={() => void updatePersonRole(person.userId, 'promote_owner')}
                                    disabled={peopleActionLoadingUserId === person.userId}
                                    className="rounded-lg border border-[#d6ddeb] bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50"
                                  >
                                    Promote to Owner
                                  </button>
                                )}
                                {canRemove && (
                                  <button
                                    type="button"
                                    onClick={() => void updatePersonRole(person.userId, 'remove')}
                                    disabled={peopleActionLoadingUserId === person.userId}
                                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 disabled:opacity-50"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {people.length === 0 && <p className="text-sm text-neutral-500">No people yet.</p>}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void saveGroupSettings()}
                    disabled={groupSettingsSaving}
                    className="mt-4 w-full rounded-xl bg-[#1f355d] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {groupSettingsSaving ? 'Saving...' : 'Save Access & People'}
                  </button>

                  {groupSettingsError && <p className="mt-2 text-sm text-amber-700">{groupSettingsError}</p>}
                  {groupSettingsMessage && <p className="mt-2 text-sm text-[#1f355d]">{groupSettingsMessage}</p>}
                </section>
              </>
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
