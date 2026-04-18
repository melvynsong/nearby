'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { phoneLast4, slugify } from '@/lib/helpers'

type Friend = {
  id: string   // local key only
  name: string
  phone: string
}

type RegisterData = {
  userId: string
  userName: string
  phone4: string
  phone: string
}

type SessionData = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

export default function CreateGroup() {
  const router = useRouter()
  const [register, setRegister] = useState<RegisterData | null>(null)
  const [groupName, setGroupName] = useState('')
  const [passcode, setPasscode] = useState('')
  const [friends, setFriends] = useState<Friend[]>([{ id: '1', name: '', phone: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const loadCreator = async () => {
      const rawRegister = localStorage.getItem('nearby_register')
      if (rawRegister) {
        setRegister(JSON.parse(rawRegister))
        return
      }

      const rawSession = localStorage.getItem('nearby_session')
      if (!rawSession) return

      const session: SessionData = JSON.parse(rawSession)

      const { data: member } = await supabase
        .from('members')
        .select('id, user_id, display_name, phone_last4, users ( phone_number )')
        .eq('id', session.memberId)
        .maybeSingle()

      const userId = member?.user_id as string | undefined
      const phone = (member?.users as { phone_number?: string } | null)?.phone_number
      const phone4 = (member?.phone_last4 as string | null) ?? (phone ? phoneLast4(phone) : null)

      if (userId && phone && phone4) {
        setRegister({
          userId,
          userName: (member?.display_name as string | null) ?? session.memberName,
          phone,
          phone4,
        })
      }
    }

    loadCreator()
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

  // Upsert a user by phone number, return their id
  const upsertUser = async (fullName: string, phone: string): Promise<string> => {
    const last4 = phoneLast4(phone)
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', phone)
      .maybeSingle()

    if (existing) return existing.id

    const { data: inserted, error } = await supabase
      .from('users')
      .insert({ full_name: fullName, phone_number: phone, phone_last4: last4 })
      .select('id')
      .single()

    if (error || !inserted) throw new Error(`Could not create user for ${fullName}: ${error?.message}`)
    return inserted.id
  }

  // Upsert a member (user in a group), return member id
  const upsertMember = async (userId: string, displayName: string, phone4: string, groupId: string): Promise<string> => {
    // Check if member already exists for this user+group
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('user_id', userId)
      .eq('group_id', groupId)
      .maybeSingle()

    if (existing) return existing.id

    const { data: inserted, error } = await supabase
      .from('members')
      .insert({ display_name: displayName, group_id: groupId, phone_last4: phone4, user_id: userId })
      .select('id')
      .single()

    if (error || !inserted) throw new Error(`Could not add member ${displayName}: ${error?.message}`)
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
    if (!name) { setError('Please enter a group name.'); return }
    if (!passcode.trim()) { setError('Please set a group passcode.'); return }
    if (!register) { setError('Registration data missing. Please register first.'); return }

    setSaving(true)
    try {
      // 1. Create the group
      const slug = slugify(name)
      const { data: group, error: groupErr } = await supabase
        .from('groups')
        .insert({ name, slug, access_code: passcode.trim() })
        .select('id')
        .single()

      if (groupErr || !group) throw new Error(`Failed to create group: ${groupErr?.message}`)
      const groupId = group.id

      // 2. Add creator as member + group membership
      const creatorMemberId = await upsertMember(register.userId, register.userName, register.phone4, groupId)
      await upsertGroupMembership(register.userId, groupId, creatorMemberId)

      // 3. Add each valid friend
      const validFriends = friends.filter((f) => f.name.trim() && f.phone.trim())
      for (const friend of validFriends) {
        const friendPhone = friend.phone.trim()
        const friendLast4 = phoneLast4(friendPhone)
        const friendUserId = await upsertUser(friend.name.trim(), friendPhone)
        const friendMemberId = await upsertMember(friendUserId, friend.name.trim(), friendLast4, groupId)
        await upsertGroupMembership(friendUserId, groupId, friendMemberId)
      }

      // Keep logged-in session aware of the new group immediately.
      const rawSession = localStorage.getItem('nearby_session')
      if (rawSession) {
        const current = JSON.parse(rawSession)
        const existingGroups = Array.isArray(current.allGroups) ? current.allGroups : []
        const hasGroup = existingGroups.some((g: { groupId: string }) => g.groupId === groupId)
        const nextGroups = hasGroup
          ? existingGroups
          : [...existingGroups, { memberId: creatorMemberId, memberName: register.userName, groupId, groupName: name }]

        localStorage.setItem('nearby_session', JSON.stringify({ ...current, allGroups: nextGroups }))
      }

      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-[#f8f8f6] flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm rounded-2xl bg-white border border-neutral-200 p-7 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
            <span className="text-2xl">✓</span>
          </div>
          <p className="text-xl font-bold text-neutral-900">Group created!</p>
          <p className="mt-2 text-sm text-neutral-500">
            Your circle is ready. Start saving food spots together.
          </p>
          <button
            onClick={() => router.push('/nearby')}
            className="mt-6 w-full rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-3 text-sm font-semibold text-white transition-colors"
          >
            Go to Nearby
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f8f8f6] px-5 py-8 pb-20">
      <div className="max-w-sm mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-5 text-sm text-neutral-500 hover:text-neutral-800 transition-colors"
        >
          ← Back
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
                className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
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
                className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
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
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
                    />
                    <input
                      type="tel"
                      value={friend.phone}
                      onChange={(e) => updateFriend(friend.id, 'phone', e.target.value)}
                      placeholder="Phone number"
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
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
              className="mt-4 text-sm font-medium text-teal-700 hover:underline"
            >
              + Add another friend
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 active:bg-teal-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating group…' : 'Create group'}
          </button>
        </div>
      </div>
    </main>
  )
}
