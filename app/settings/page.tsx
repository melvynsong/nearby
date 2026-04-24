'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
// import AppHeader from '@/components/AppHeader'
import ErrorState from '@/components/ErrorState'
import { apiPath, withBasePath } from '@/lib/base-path'
import { markPasscodeSet } from '@/lib/auth-guard'
import { buildGroupInviteMessage } from '@/lib/invite'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

type GroupSummary = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

type Session = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
  allGroups?: GroupSummary[]
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
  displayStatus: 'invited' | 'onboarded' | 'joined_group'
  name: string
  createdAt: string
  joinedAt: string | null
}

type PeopleRow = {
  key: string
  userId: string | null
  name: string
  phoneNumber: string
  role: 'owner' | 'member' | null
  status: 'Invited' | 'Onboarded' | 'Joined Group'
}

type GroupDetailState = {
  loadState: 'idle' | 'loading' | 'loaded' | 'error'
  name: string
  passcode: string
  savedPasscode: string
  visibility: 'public' | 'private'
  role: 'owner' | 'member'
  people: GroupPerson[]
  invites: GroupInvite[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildUnifiedPeopleRows(people: GroupPerson[], invites: GroupInvite[]): PeopleRow[] {
  const rowsByPhone = new Map<string, PeopleRow>()
  const rowsByUserId = new Map<string, PeopleRow>()

  for (const person of people) {
    const row: PeopleRow = {
      key: `member-${person.userId}`,
      userId: person.userId,
      name: person.name || person.phoneNumber || 'Member',
      phoneNumber: person.phoneNumber || '',
      role: person.role,
      status: 'Joined Group',
    }
    rowsByUserId.set(person.userId, row)
    if (person.phoneNumber) rowsByPhone.set(person.phoneNumber, row)
  }

  for (const invite of invites) {
    const existingByPhone = rowsByPhone.get(invite.phoneNumber)
    if (existingByPhone) {
      existingByPhone.status = 'Joined Group'
      continue
    }
    const nextStatus: PeopleRow['status'] =
      invite.displayStatus === 'joined_group'
        ? 'Joined Group'
        : invite.displayStatus === 'onboarded'
        ? 'Onboarded'
        : 'Invited'
    const row: PeopleRow = {
      key: `invite-${invite.id}`,
      userId: null,
      name: invite.name || invite.phoneNumber,
      phoneNumber: invite.phoneNumber,
      role: null,
      status: nextStatus,
    }
    rowsByPhone.set(invite.phoneNumber, row)
  }

  const rows = Array.from(new Set([...rowsByUserId.values(), ...rowsByPhone.values()]))
  return rows.sort((a, b) => {
    const rank = (s: PeopleRow['status']) => (s === 'Joined Group' ? 0 : s === 'Onboarded' ? 1 : 2)
    const diff = rank(a.status) - rank(b.status)
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })
}

// ─── GroupCard ────────────────────────────────────────────────────────────────

function GroupCard({
  summary,
  userId,
  expanded,
  onExpand,
  onCollapse,
  onGroupDeleted,
  onGroupRenamed,
}: {
  summary: GroupSummary
  userId: string
  expanded: boolean
  onExpand: () => void
  onCollapse: () => void
  onGroupDeleted: (groupId: string) => void
  onGroupRenamed: (groupId: string, name: string) => void
}) {
  const { groupId, groupName: initialGroupName, memberId } = summary
  const loadingRef = useRef(false)

  const [detail, setDetail] = useState<GroupDetailState>({
    loadState: 'idle',
    name: initialGroupName,
    passcode: '',
    savedPasscode: '',
    visibility: 'public',
    role: 'member',
    people: [],
    invites: [],
  })

  // Form / action state (scoped to this group card)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(initialGroupName)
  const [editPasscode, setEditPasscode] = useState('')
  const [showGroupPasscode, setShowGroupPasscode] = useState(false)
  const [invitePhoneNumber, setInvitePhoneNumber] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState(false)
  const [peopleLoadingId, setPeopleLoadingId] = useState<string | null>(null)
  const [categoryMsg, setCategoryMsg] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const unifiedPeopleRows = useMemo(
    () => buildUnifiedPeopleRows(detail.people, detail.invites),
    [detail.people, detail.invites],
  )

  const groupInviteMessage = useMemo(
    () => buildGroupInviteMessage(detail.name || initialGroupName, detail.savedPasscode || 'N/A'),
    [detail.name, detail.savedPasscode, initialGroupName],
  )

  const passcodeDirty = detail.loadState === 'loaded' && editPasscode.trim() !== detail.savedPasscode.trim()

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadDetails = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    console.log('[GroupSettingsLoad]', { group_id: groupId, detail_mode: 'expanded' })
    setDetail((prev) => ({ ...prev, loadState: 'loading' }))
    try {
      const response = await fetch(apiPath('/api/settings/group-details'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, requesterUserId: userId }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) throw new Error(result?.message ?? 'Failed')

      const name = (result.group?.name as string) ?? ''
      const passcode = (result.group?.passcode as string) ?? ''
      const visibility = ((result.group?.visibility as 'public' | 'private') ?? 'public')
      const role = ((result.requesterRole as 'owner' | 'member') ?? 'member')

      setDetail({
        loadState: 'loaded',
        name,
        passcode,
        savedPasscode: passcode,
        visibility,
        role,
        people: ((result.members as GroupPerson[]) ?? []).map((p) => ({
          userId: p.userId,
          memberId: p.memberId,
          name: p.name,
          phoneNumber: p.phoneNumber,
          role: p.role === 'owner' ? 'owner' : 'member',
        })),
        invites: ((result.invites as GroupInvite[]) ?? []).map((inv) => ({
          id: inv.id,
          phoneNumber: inv.phoneNumber,
          status: inv.status === 'joined' ? 'joined' : 'invited',
          displayStatus:
            inv.displayStatus === 'joined_group'
              ? 'joined_group'
              : inv.displayStatus === 'onboarded'
              ? 'onboarded'
              : 'invited',
          name: inv.name ?? '',
          createdAt: inv.createdAt,
          joinedAt: inv.joinedAt,
        })),
      })
      setEditName(name)
      setEditPasscode(passcode)
      onGroupRenamed(groupId, name)
    } catch {
      setDetail((prev) => ({ ...prev, loadState: 'error' }))
    } finally {
      loadingRef.current = false
    }
  }, [groupId, userId, onGroupRenamed])

  useEffect(() => {
    if (expanded && detail.loadState === 'idle') {
      void loadDetails()
    }
  }, [expanded, detail.loadState, loadDetails])

  useEffect(() => {
    console.log('[GroupExpand]', { group_id: groupId, action: expanded ? 'expand' : 'collapse' })
  }, [expanded, groupId])

  // ── Actions ────────────────────────────────────────────────────────────────

  const saveGroupName = async () => {
    setError('')
    setMessage('')
    const nextName = editName.trim()
    if (!nextName) { setError('Group name is required.'); return }
    setSaving(true)
    try {
      const response = await fetch(apiPath('/api/settings/group-details'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, requesterUserId: userId, name: nextName, title: nextName, passcode: detail.savedPasscode.trim(), visibility: detail.visibility }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) { setError(result?.message ?? 'Could not update group.'); return }
      console.log('[GroupSettingsEdit]', { group_id: groupId, section_updated: 'name' })
      setMessage('Group name updated.')
      setEditing(false)
      await loadDetails()
    } catch { setError('Could not update group.') }
    finally { setSaving(false) }
  }

  const saveGroupPasscode = async () => {
    const nextPasscode = editPasscode.trim()
    if (!nextPasscode) { setError('Passcode is required.'); return }
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const response = await fetch(apiPath('/api/settings/group-details'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, requesterUserId: userId, name: detail.name.trim(), title: detail.name.trim(), passcode: nextPasscode, visibility: detail.visibility }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) { setError(result?.message ?? 'Could not update passcode.'); return }
      console.log('[GroupSettingsEdit]', { group_id: groupId, section_updated: 'passcode' })
      setMessage('Passcode updated.')
      await loadDetails()
    } catch { setError('Could not update passcode.') }
    finally { setSaving(false) }
  }

  const updateVisibility = async (nextVisibility: 'public' | 'private') => {
    if (nextVisibility === detail.visibility) return
    const prev = detail.visibility
    setDetail((d) => ({ ...d, visibility: nextVisibility }))
    setVisibilitySaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(apiPath('/api/settings/group-details'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, requesterUserId: userId, name: detail.name.trim(), title: detail.name.trim(), passcode: detail.savedPasscode.trim(), visibility: nextVisibility }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) throw new Error(result?.message)
      console.log('[GroupSettingsEdit]', { group_id: groupId, section_updated: 'visibility' })
      setMessage('Visibility updated.')
      await loadDetails()
    } catch {
      setDetail((d) => ({ ...d, visibility: prev }))
      setError('Could not update visibility.')
    } finally {
      setVisibilitySaving(false)
    }
  }

  const refreshCategories = async () => {
    setCategoryMsg('')
    try {
      const response = await fetch(apiPath('/api/settings/group-categories-refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, requesterUserId: userId }),
      })
      const result = await response.json()
      setCategoryMsg(response.ok && result?.ok ? `Refreshed (${result.removed ?? 0} removed).` : result?.message ?? 'Could not refresh.')
    } catch { setCategoryMsg('Could not refresh.') }
  }

  const shareInvitation = async () => {
    setError('')
    setMessage('')
    try {
      if (navigator.share) {
        await navigator.share({ text: groupInviteMessage })
        setMessage('Invitation ready to share')
        return
      }
      await navigator.clipboard.writeText(groupInviteMessage)
      setMessage('Invitation copied')
    } catch { setError('Could not prepare invitation.') }
  }

  const addPrivateInvite = async () => {
    setError('')
    setMessage('')
    const phone = invitePhoneNumber.replace(/\D/g, '')
    if (phone.length < 8) { setError('Enter a valid phone number.'); return }
    setInviteSaving(true)
    try {
      const response = await fetch(apiPath('/api/settings/group-invites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, requesterUserId: userId, phoneNumber: phone }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) { setError(result?.message ?? 'Could not add invite.'); return }
      setInvitePhoneNumber('')
      setMessage('Person invited.')
      await loadDetails()
    } catch { setError('Could not add invite.') }
    finally { setInviteSaving(false) }
  }

  const updatePersonRole = async (targetUserId: string, action: 'promote_member' | 'promote_owner' | 'remove') => {
    setPeopleLoadingId(targetUserId)
    setError('')
    setMessage('')
    try {
      const response = await fetch(apiPath('/api/settings/group-members'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, requesterUserId: userId, targetUserId, action }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) { setError(result?.message ?? 'Could not update.'); return }
      console.log('[GroupSettingsEdit]', { group_id: groupId, section_updated: 'members' })
      setMessage('People updated.')
      await loadDetails()
    } catch { setError('Could not update this person.') }
    finally { setPeopleLoadingId(null) }
  }

  const deleteGroup = async () => {
    setDeleteError('')
    setDeletingGroup(true)
    try {
      const response = await fetch(apiPath('/api/groups/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, memberId }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) { setDeleteError(result?.message ?? 'Something went wrong.'); return }
      onGroupDeleted(groupId)
    } catch { setDeleteError('Something went wrong.') }
    finally { setDeletingGroup(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isLoaded = detail.loadState === 'loaded'

  return (
    <div className="rounded-2xl border border-[#dfe5f0] bg-white shadow-sm overflow-hidden">

      {/* Collapsed header row */}
      <button
        type="button"
        onClick={expanded ? onCollapse : onExpand}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[#fafbfd] active:bg-[#f3f6fb]"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">
            {detail.name || initialGroupName}
          </p>
          {isLoaded && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                detail.role === 'owner' ? 'bg-[#fde9cd] text-[#8a5a12]' : 'bg-[#eef3fb] text-[#1f355d]'
              }`}>
                {detail.role === 'owner' ? 'Owner' : 'Member'}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                detail.visibility === 'private' ? 'bg-[#f3f0fb] text-[#5b3fa8]' : 'bg-[#e8f5ee] text-[#1a6e3a]'
              }`}>
                {detail.visibility === 'private' ? 'Private' : 'Public'}
              </span>
              {detail.people.length > 0 && (
                <span className="text-[10px] text-neutral-400">
                  {detail.people.length} member{detail.people.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
        <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full border border-[#d7deec] bg-[#f5f7fc] text-base font-bold text-[#1f355d] leading-none select-none">
          {expanded ? '−' : '+'}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[#eef1f8]">
          {detail.loadState === 'loading' && (
            <div className="flex items-center gap-2.5 px-5 py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#1f355d]" />
              <p className="text-sm text-neutral-400">{require('@/lib/ui-messages').UIMessages.loadingGroupSettings}</p>
            </div>
          )}

          {detail.loadState === 'error' && (
            <div className="px-5 py-5">
              <p className="text-sm text-rose-600">{require('@/lib/ui-messages').UIMessages.groupSettingsError}</p>
              <button
                type="button"
                onClick={() => { setDetail((d) => ({ ...d, loadState: 'idle' })); void loadDetails() }}
                className="mt-2 text-xs underline text-rose-500 hover:text-rose-700"
              >
                {require('@/lib/ui-messages').UIMessages.errorGeneric}
              </button>
            </div>
          )}

          {detail.loadState === 'loaded' && (
            <div className="px-5 pb-5 pt-4 space-y-6">

              {/* ── Group Info ──────────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Group Info</h3>
                  <button
                    type="button"
                    onClick={() => void refreshCategories()}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[#d6ddeb] bg-white text-sm text-[#1f355d] hover:bg-[#eef3fb]"
                    title="Refresh dish categories"
                  >
                    ↻
                  </button>
                </div>

                {editing ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Group name"
                      className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none focus:border-[#1f355d] focus:ring-2 focus:ring-[#e6edf9]"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveGroupName()}
                        disabled={saving}
                        className="flex-1 rounded-xl bg-[#1f355d] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditing(false); setEditName(detail.name) }}
                        className="flex-1 rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-[#f5f7fc]"
                      >
                        Cancel
                      </button>
                    </div>

                    {detail.role === 'owner' && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                        <p className="text-xs font-semibold text-rose-700 mb-2">Danger zone</p>
                        <button
                          type="button"
                          onClick={() => void deleteGroup()}
                          disabled={deletingGroup}
                          className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {deletingGroup ? 'Deleting…' : 'Delete this group'}
                        </button>
                        {deleteError && <p className="mt-2 text-xs text-rose-700">{deleteError}</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-[#e6ebf4] bg-[#fafbfd] px-4 py-3">
                    <p className="text-sm font-medium text-neutral-900">{detail.name}</p>
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="rounded-full border border-[#d6ddeb] bg-white px-3 py-1.5 text-xs font-medium text-[#1f355d] hover:bg-[#eef3fb]"
                    >
                      Edit
                    </button>
                  </div>
                )}
                {categoryMsg && <p className="mt-2 text-xs text-neutral-500">{categoryMsg}</p>}
              </div>

              {/* ── Access & People ─────────────────────────────────────────── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">Access &amp; People</h3>

                {/* Visibility */}
                <div className="grid grid-cols-2 gap-2">
                  {(['public', 'private'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => void updateVisibility(v)}
                      disabled={visibilitySaving}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition-colors ${
                        detail.visibility === v
                          ? 'border-[#1f355d] bg-[#ebf0f9] text-[#1f355d]'
                          : 'border-[#d8deea] bg-white text-[#4d5871] hover:bg-[#f5f7fc]'
                      }`}
                    >
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {detail.visibility === 'public'
                    ? 'Anyone with the passcode can access.'
                    : 'Only invited phone numbers with the passcode can join.'}
                </p>

                {/* Passcode */}
                <div className="mt-4 rounded-xl border border-[#e6ebf4] bg-[#fafbfd] p-3">
                  <p className="text-xs text-neutral-500 mb-2">Group Passcode</p>
                  <div className="flex items-center gap-2">
                    <input
                      type={showGroupPasscode ? 'text' : 'password'}
                      value={editPasscode}
                      onChange={(e) => setEditPasscode(e.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-[#d6ddeb] bg-white px-4 py-2.5 text-sm font-semibold tracking-[0.12em] text-neutral-900 outline-none focus:border-[#1f355d]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGroupPasscode((p) => !p)}
                      className="rounded-xl border border-[#d6ddeb] bg-white px-3 py-2.5 text-xs font-medium text-neutral-700 hover:bg-[#f5f7fc]"
                    >
                      {showGroupPasscode ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {passcodeDirty && (
                    <button
                      type="button"
                      onClick={() => void saveGroupPasscode()}
                      disabled={saving}
                      className="mt-2 w-full rounded-xl bg-[#1f355d] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save passcode'}
                    </button>
                  )}
                </div>

                {/* Share Invitation */}
                <button
                  type="button"
                  onClick={() => void shareInvitation()}
                  className="mt-3 w-full rounded-xl border border-[#d6ddeb] bg-white px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-[#f5f7fc] transition-colors"
                >
                  Share Invitation
                </button>

                {/* Private invite by phone */}
                {detail.visibility === 'private' && (
                  <div className="mt-4 rounded-xl border border-[#e6ebf4] bg-[#fafbfd] p-3">
                    <p className="text-sm font-semibold text-neutral-900 mb-2">Invite by phone</p>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={invitePhoneNumber}
                        onChange={(e) => setInvitePhoneNumber(e.target.value)}
                        placeholder="Phone number"
                        className="min-w-0 flex-1 rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none focus:border-[#1f355d]"
                      />
                      <button
                        type="button"
                        onClick={() => void addPrivateInvite()}
                        disabled={inviteSaving}
                        className="rounded-xl bg-[#1f355d] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {inviteSaving ? '…' : 'Invite'}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">Invite saves instantly and appears in People right away.</p>
                  </div>
                )}

                {/* People */}
                <div className="mt-5 border-t border-[#e6ebf4] pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">People</h4>
                  <div className="space-y-2">
                    {unifiedPeopleRows.map((person) => {
                      const isOwnerRow = person.role === 'owner'
                      const canManage = !!(person.userId && person.status === 'Joined Group')
                      const canRemove = canManage && (!isOwnerRow || detail.role === 'owner')
                      const canPromoteToOwner = detail.role === 'owner' && canManage && !isOwnerRow

                      return (
                        <div key={person.key} className="rounded-xl border border-[#e6ebf4] bg-[#fafbfd] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-neutral-900">
                                {person.name || person.phoneNumber || 'User'}
                              </p>
                              {person.phoneNumber && (
                                <p className="truncate text-xs text-neutral-500">{person.phoneNumber}</p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {person.role && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  person.role === 'owner'
                                    ? 'bg-[#fde9cd] text-[#8a5a12]'
                                    : 'bg-[#eef3fb] text-[#1f355d]'
                                }`}>
                                  {person.role === 'owner' ? 'Owner' : 'Member'}
                                </span>
                              )}
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                person.status === 'Joined Group'
                                  ? 'bg-[#d4edde] text-[#1a6e3a]'
                                  : person.status === 'Onboarded'
                                  ? 'bg-[#e8f0ff] text-[#224f96]'
                                  : 'bg-[#fff3cd] text-[#8a6d1f]'
                              }`}>
                                {person.status}
                              </span>
                            </div>
                          </div>
                          {(canPromoteToOwner || canRemove) && person.userId && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {canPromoteToOwner && (
                                <button
                                  type="button"
                                  onClick={() => void updatePersonRole(person.userId as string, 'promote_owner')}
                                  disabled={peopleLoadingId === person.userId}
                                  className="rounded-lg border border-[#d6ddeb] bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50 hover:bg-[#f5f7fc]"
                                >
                                  Promote to Owner
                                </button>
                              )}
                              {canRemove && (
                                <button
                                  type="button"
                                  onClick={() => void updatePersonRole(person.userId as string, 'remove')}
                                  disabled={peopleLoadingId === person.userId}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 disabled:opacity-50 hover:bg-rose-100"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {unifiedPeopleRows.length === 0 && (
                      <p className="text-sm text-neutral-500">No people yet.</p>
                    )}
                  </div>
                </div>

                {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}
                {message && <p className="mt-3 text-sm text-[#1f355d]">{message}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isPasscodeSetup = searchParams.get('setup') === 'passcode'

  const [allGroups, setAllGroups] = useState<GroupSummary[]>([])
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [personalPasscode, setPersonalPasscode] = useState('')
  const [personalPasscodeError, setPersonalPasscodeError] = useState('')
  const [personalPasscodeSaved, setPersonalPasscodeSaved] = useState(false)
  const [showPasscode, setShowPasscode] = useState(false)

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
        profileSource = { full_name: parsedRegister.userName, phone_number: parsedRegister.phone }
      }

      if (rawSession) {
        const parsed = JSON.parse(rawSession) as Session
        const groups: GroupSummary[] = parsed.allGroups?.length
          ? parsed.allGroups
          : [{ memberId: parsed.memberId, memberName: parsed.memberName, groupId: parsed.groupId, groupName: parsed.groupName }]
        setAllGroups(groups)
        setExpandedGroupId(parsed.groupId) // auto-expand active group
        console.log('[GroupSettingsList]', { groups_count: groups.length })

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

      if (!userId) throw new Error('SETTINGS_USER_ID_MISSING')

      if (!profileSource?.full_name || !profileSource?.phone_number) {
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

      setProfile({ userId, fullName: profileSource?.full_name ?? '', phoneNumber: profileSource?.phone_number ?? '' })
    } catch (error) {
      console.error('[Nearby][Settings] Failed to load:', error)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadSettings() }, [])

  const saveProfile = async () => {
    if (!profile) return
    setProfileSaved(false)
    setProfileError('')
    setPersonalPasscodeSaved(false)
    setPersonalPasscodeError('')

    const name = profile.fullName.trim()
    const phone = profile.phoneNumber.trim()
    if (!name) { setProfileError('Please enter your name.'); return }
    if (phone.replace(/\D/g, '').length < 8) { setProfileError('Please enter a valid telephone number.'); return }

    const code = personalPasscode.trim()
    if (code && code.length < 4) { setPersonalPasscodeError('Passcode must be at least 4 characters.'); return }

    setProfileSaving(true)
    try {
      const response = await fetch(apiPath('/api/settings/profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.userId, fullName: name, phoneNumber: phone }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) { setProfileError(result?.message ?? 'Could not save changes.'); return }

      if (code) {
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData?.session?.access_token ?? null
        if (!accessToken) { setPersonalPasscodeError('Your session has expired. Please sign in again.'); return }

        const passcodeResponse = await fetch(apiPath('/api/settings/personal-passcode'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ passcode: code }),
        })
        const passcodeResult = await passcodeResponse.json()
        if (!passcodeResponse.ok || !passcodeResult?.ok) {
          setPersonalPasscodeError(passcodeResult?.message ?? 'Could not save passcode.')
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
      setProfileError('Could not save changes.')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleLogout = async () => {
    try { await supabase.auth.signOut() } catch { /* ignore */ }
    localStorage.removeItem('nearby_session')
    localStorage.removeItem('nearby_register')
    localStorage.removeItem('nearby_passcode_set')
    window.location.replace(withBasePath('/'))
  }

  const handleGroupDeleted = useCallback((groupId: string) => {
    const rawSession = localStorage.getItem('nearby_session')
    if (!rawSession) return
    const parsed = JSON.parse(rawSession) as Session
    const remaining = (parsed.allGroups ?? []).filter((g) => g.groupId !== groupId)
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
  }, [])

  const handleGroupRenamed = useCallback((groupId: string, name: string) => {
    setAllGroups((prev) => prev.map((g) => g.groupId === groupId ? { ...g, groupName: name } : g))
    const raw = localStorage.getItem('nearby_session')
    if (raw) {
      const parsed = JSON.parse(raw) as Session
      const nextAllGroups = (parsed.allGroups ?? []).map((g) => g.groupId === groupId ? { ...g, groupName: name } : g)
      const next = { ...parsed, ...(parsed.groupId === groupId ? { groupName: name } : {}), allGroups: nextAllGroups }
      localStorage.setItem('nearby_session', JSON.stringify(next))
    }
  }, [])

  return (
    <main className="min-h-screen bg-[#f5f6f8] pb-20">
      <div className="nearby-shell pt-5">
        {/* Back navigation */}
        <button
          onClick={() => router.push(withBasePath('/nearby'))}
          className="mb-5 inline-flex h-8 items-center gap-1.5 rounded-full border border-[#d7deec] bg-white px-3 text-xs font-medium text-[#44506a] shadow-sm transition-colors hover:bg-[#edf2fb]"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>Back</span>
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Settings</h1>

        {isPasscodeSetup && (
          <div className="mt-4 rounded-xl border border-[#d5dceb] bg-[#eef3fb] px-4 py-3 text-sm text-[#1f355d]">
            <span className="font-semibold">One more step:</span> set your personal passcode below.
          </div>
        )}

        {loading ? (
          <div className="mt-10 flex items-center gap-2.5">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#1f355d]" />
            <p className="text-sm text-neutral-400">{require('@/lib/ui-messages').UIMessages.loadingGroupSettings}</p>
          </div>
        ) : loadError ? (
          <div className="mt-6">
            <ErrorState
              title={require('@/lib/ui-messages').UIMessages.errorGeneric}
              message={require('@/lib/ui-messages').UIMessages.errorGroupSettings}
              onPrimary={() => void loadSettings()}
              secondaryLabel="Go Back"
              onSecondary={() => router.push(withBasePath('/nearby'))}
            />
          </div>
        ) : profile ? (
          <div className="mt-6 space-y-5">
            {/* ── Profile ─────────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-[#dfe5f0] bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-4">Profile</h2>
              <div className="space-y-3">
                <input
                  type="text"
                  value={profile.fullName}
                  onChange={(e) => setProfile((prev) => prev ? { ...prev, fullName: e.target.value } : prev)}
                  placeholder="Name"
                  className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none focus:border-[#1f355d] focus:ring-2 focus:ring-[#e6edf9]"
                />
                <input
                  type="tel"
                  value={profile.phoneNumber}
                  onChange={(e) => setProfile((prev) => prev ? { ...prev, phoneNumber: e.target.value } : prev)}
                  placeholder="Telephone number"
                  className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 text-sm outline-none focus:border-[#1f355d] focus:ring-2 focus:ring-[#e6edf9]"
                />
                <div className="relative">
                  <input
                    type={showPasscode ? 'text' : 'password'}
                    value={personalPasscode}
                    onChange={(e) => setPersonalPasscode(e.target.value)}
                    placeholder="Personal passcode (optional)"
                    className="w-full rounded-xl border border-[#d6ddeb] px-4 py-2.5 pr-12 text-sm outline-none focus:border-[#1f355d] focus:ring-2 focus:ring-[#e6edf9]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600"
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
                onClick={() => void saveProfile()}
                disabled={profileSaving}
                className="mt-4 w-full rounded-xl bg-[#1f355d] px-4 py-3 text-sm font-medium text-white disabled:opacity-50 hover:bg-[#162847]"
              >
                {profileSaving ? 'Saving…' : 'Save profile'}
              </button>
            </section>

            {/* ── My Groups ───────────────────────────────────────────────── */}
            {allGroups.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">My Groups</h2>
                  <span className="text-[11px] text-neutral-400">
                    {allGroups.length} group{allGroups.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  {allGroups.map((group) => (
                    <GroupCard
                      key={group.groupId}
                      summary={group}
                      userId={profile.userId}
                      expanded={expandedGroupId === group.groupId}
                      onExpand={() => setExpandedGroupId(group.groupId)}
                      onCollapse={() => setExpandedGroupId(null)}
                      onGroupDeleted={handleGroupDeleted}
                      onGroupRenamed={handleGroupRenamed}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Create New Group CTA ─────────────────────────────────────── */}
            <button
              type="button"
              onClick={() => router.push(withBasePath('/create-group'))}
              className="w-full rounded-2xl border border-dashed border-[#b8c5e0] bg-white px-5 py-4 text-sm font-medium text-[#1f355d] transition-colors hover:bg-[#eef3fb]"
            >
              + Create New Group
            </button>
          </div>
        ) : null}
      </div>
    </main>
  )
}

// ─── Wrapper ──────────────────────────────────────────────────────────────────

function SettingsPageWrapper() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f5f6f8]" />}>
      <SettingsPage />
    </Suspense>
  )
}

export default SettingsPageWrapper
