'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { phoneLast4, slugify } from '@/lib/helpers'

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
  const [password, setPassword] = useState('')
  const [friends, setFriends] = useState<Friend[]>([{ id: '1', name: '', phone: '' }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    setPassword('')
    setFriends([{ id: '1', name: '', phone: '' }])
    setError('')
    setLoading(false)
  }

  const close = () => {
    reset()
    onClose()
  }

  const upsertUser = async (fullName: string, phone: string): Promise<string> => {
    const cleanedPhone = phone.trim()
    const last4 = phoneLast4(cleanedPhone)

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', cleanedPhone)
      .maybeSingle()

    if (existing?.id) return existing.id

    const { data: inserted, error: insertError } = await supabase
      .from('users')
      .insert({
        full_name: fullName,
        phone_number: cleanedPhone,
        phone_last4: last4,
      })
      .select('id')
      .single()

    if (insertError || !inserted?.id) {
      throw new Error(insertError?.message ?? `Could not create user ${fullName}`)
    }

    return inserted.id
  }

  const upsertMember = async (
    userId: string,
    displayName: string,
    phone4: string,
    groupId: string,
  ): Promise<string> => {
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('user_id', userId)
      .eq('group_id', groupId)
      .maybeSingle()

    if (existing?.id) return existing.id

    const { data: inserted, error: insertError } = await supabase
      .from('members')
      .insert({
        display_name: displayName,
        group_id: groupId,
        phone_last4: phone4,
        user_id: userId,
      })
      .select('id')
      .single()

    if (insertError || !inserted?.id) {
      throw new Error(insertError?.message ?? `Could not add member ${displayName}`)
    }

    return inserted.id
  }

  const upsertGroupMembership = async (userId: string, groupId: string, memberId: string) => {
    await supabase
      .from('group_memberships')
      .upsert({ user_id: userId, group_id: groupId, member_id: memberId }, { onConflict: 'user_id,group_id' })
  }

  const handleCreate = async () => {
    setError('')

    const name = groupName.trim()
    const accessCode = password.trim()

    if (!name) {
      setError('Please enter a group name.')
      return
    }

    if (!accessCode) {
      setError('Please set a group password.')
      return
    }

    setLoading(true)

    try {
      const { data: creatorMember, error: creatorError } = await supabase
        .from('members')
        .select('id, user_id, display_name, phone_last4, users ( phone_number )')
        .eq('id', sessionMemberId)
        .maybeSingle()

      if (creatorError || !creatorMember?.user_id) {
        throw new Error('Could not resolve your account details. Please log in again.')
      }

      const creatorPhone = (creatorMember.users as { phone_number?: string } | null)?.phone_number
      const creatorPhone4 = (creatorMember.phone_last4 as string | null) ?? (creatorPhone ? phoneLast4(creatorPhone) : null)
      if (!creatorPhone4) throw new Error('Creator phone details missing.')

      const creatorName = (creatorMember.display_name as string | null) ?? fallbackMemberName
      const slug = slugify(name)

      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({ name, slug, access_code: accessCode })
        .select('id')
        .single()

      if (groupError || !group?.id) {
        throw new Error(groupError?.message ?? 'Failed to create group.')
      }

      const groupId = group.id

      const creatorMemberId = await upsertMember(creatorMember.user_id as string, creatorName, creatorPhone4, groupId)
      await upsertGroupMembership(creatorMember.user_id as string, groupId, creatorMemberId)

      const validFriends = friends.filter((friend) => friend.name.trim() && friend.phone.trim())
      for (const friend of validFriends) {
        const friendPhone = friend.phone.trim()
        const friendName = friend.name.trim()
        const friendUserId = await upsertUser(friendName, friendPhone)
        const friendMemberId = await upsertMember(friendUserId, friendName, phoneLast4(friendPhone), groupId)
        await upsertGroupMembership(friendUserId, groupId, friendMemberId)
      }

      onGroupCreated({
        memberId: creatorMemberId,
        memberName: creatorName,
        groupId,
        groupName: name,
      })

      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group.')
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
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-700">Group name</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Friday Makan Crew"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-700">Group password</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Shared login password"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-neutral-500"
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
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
                    />
                    <input
                      type="tel"
                      value={friend.phone}
                      onChange={(e) => updateFriend(friend.id, 'phone', e.target.value)}
                      placeholder="Phone number"
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
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
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Creating group...' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  )
}
