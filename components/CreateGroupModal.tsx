'use client'

import { useState } from 'react'
import GroupInviteActions from '@/components/GroupInviteActions'
import { apiPath } from '@/lib/base-path'
import { UIMessages } from '@/lib/ui-messages'

type Friend = {
  id: string
  name: string
  phone: string
}

export type GroupEntry = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  sessionMemberId: string
  fallbackMemberName: string
  onGroupCreated: (entry: GroupEntry) => void
}

export default function CreateGroupModal({
  isOpen,
  onClose,
  sessionMemberId,
  fallbackMemberName,
  onGroupCreated,
}: Props) {
  const [groupName, setGroupName] = useState('')
  const [passcode, setPasscode] = useState('')
  const [friends, setFriends] = useState<Friend[]>([{ id: '1', name: '', phone: '' }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdEntry, setCreatedEntry] = useState<GroupEntry | null>(null)
  const [createdPasscode, setCreatedPasscode] = useState('')

  if (!isOpen) return null

  const addFriend = () => {
    setFriends((prev) => [...prev, { id: String(Date.now()), name: '', phone: '' }])
  }

  const removeFriend = (id: string) => {
    setFriends((prev) => prev.filter((f) => f.id !== id))
  }

  const updateFriend = (id: string, field: 'name' | 'phone', value: string) => {
    setFriends((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: value } : f)))
  }

  const reset = () => {
    setGroupName('')
    setPasscode('')
    setFriends([{ id: '1', name: '', phone: '' }])
    setError('')
    setLoading(false)
    setCreatedEntry(null)
    setCreatedPasscode('')
  }

  const close = () => {
    reset()
    onClose()
  }

  const handleCreate = async () => {
    setError('')

    const name = groupName.trim()
    const accessCode = passcode.trim()

    if (!name) {
      setError('Please enter a group name.')
      return
    }

    if (!accessCode) {
      setError('Please set a group passcode.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(apiPath('/api/groups/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionMemberId,
          fallbackMemberName,
          groupName: name,
          passcode: accessCode,
          friends,
        }),
      })

      const result = await response.json()
      const isSuccess = Boolean(response.ok && (result?.ok || (result?.groupId && result?.memberId)))
      if (!isSuccess) {
        setError(result?.message ?? 'We could not save your changes. Please try again.')
        setLoading(false)
        return
      }

      const entry = {
        memberId: result.memberId,
        memberName: result.memberName,
        groupId: result.groupId,
        groupName: result.groupName,
      }

      onGroupCreated(entry)
      setCreatedEntry(entry)
      setCreatedPasscode(accessCode)
    } catch (err) {
      console.error('[Nearby][Save] Modal group creation failed:', err)
      setError('We could not save your changes. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 px-4 py-8" onClick={close}>
      <div
        className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-lg transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Create new group</h2>
            <p className="mt-1 text-xs text-neutral-500">Set up your circle and switch instantly.</p>
          </div>
          <button onClick={close} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none">×</button>
        </div>

        <div className="mt-4 space-y-4">
          {createdEntry ? (
            <>
              <div className="rounded-2xl border border-[#d9e1ef] bg-[#eef3fb] p-3 text-center">
                <p className="text-sm font-semibold text-[#1f355d]">Group created successfully</p>
                <p className="mt-1 text-xs text-[#2f456f]">Share your invite now.</p>
              </div>
              <GroupInviteActions groupName={createdEntry.groupName} groupPasscode={createdPasscode} />
              <button
                onClick={close}
                className="w-full rounded-xl bg-[#1f355d] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#162746]"
              >
                Done
              </button>
            </>
          ) : (
            <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-700">Group name</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Friday Makan Crew"
              className="w-full rounded-xl border border-[#d6ddeb] px-3 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-700">Group passcode</label>
            <input
              type="text"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Shared login passcode"
              className="w-full rounded-xl border border-[#d6ddeb] px-3 py-2.5 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-neutral-700">Friends</p>
            <div className="space-y-2">
              {friends.map((friend, idx) => (
                <div key={friend.id} className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={friend.name}
                      onChange={(e) => updateFriend(friend.id, 'name', e.target.value)}
                      placeholder={`Friend ${idx + 1} name`}
                      className="w-full rounded-xl border border-[#d6ddeb] px-3 py-2 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
                    />
                    <input
                      type="tel"
                      value={friend.phone}
                      onChange={(e) => updateFriend(friend.id, 'phone', e.target.value)}
                      placeholder="Phone number"
                      className="w-full rounded-xl border border-[#d6ddeb] px-3 py-2 text-sm outline-none transition focus:border-[#1f355d] focus:ring-2 focus:ring-[#e7edf9]"
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
            <button onClick={addFriend} className="mt-3 text-xs text-neutral-500 underline hover:text-neutral-800">
              + Add another
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full rounded-xl bg-[#1f355d] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#162746] disabled:opacity-50"
          >
            {loading ? UIMessages.actionCreatingGroup : 'Create group'}
          </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
