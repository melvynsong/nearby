'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type GroupEntry = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

export default function Home() {
  const router = useRouter()
  const [last4, setLast4] = useState('')
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const session = localStorage.getItem('nearby_session')
    if (session) router.replace('/nearby')
  }, [router])

  const handleEnter = async () => {
    setError('')

    if (last4.length !== 4 || !/^\d{4}$/.test(last4)) {
      setError('Enter the last 4 digits of your mobile.')
      return
    }
    if (!passcode.trim()) {
      setError('Enter your passcode.')
      return
    }

    setLoading(true)

    // Fetch all members with this phone_last4
    const { data: members } = await supabase
      .from('members')
      .select('id, display_name, group_id, user_id')
      .eq('phone_last4', last4)

    if (!members || members.length === 0) {
      setError('Incorrect details.')
      setLoading(false)
      return
    }

    // Fetch all groups for those members
    const groupIds = members.map((m) => m.group_id)
    const { data: groups } = await supabase
      .from('groups')
      .select('id, name, access_code')
      .in('id', groupIds)

    // Fetch personal passcodes for users behind these member records.
    const userIds = [...new Set(members.map((m) => m.user_id).filter(Boolean))]
    const { data: users } = await supabase
      .from('users')
      .select('id, personal_passcode')
      .in('id', userIds)

    // Match either group passcode or personal passcode.
    let matched: (GroupEntry & { userId: string }) | null = null
    const trimmedPasscode = passcode.trim()

    for (const member of members) {
      const group = groups?.find((g) => g.id === member.group_id)
      const user = users?.find((u) => u.id === member.user_id)
      const matchGroupPasscode = group?.access_code === trimmedPasscode
      const matchPersonalPasscode = user?.personal_passcode === trimmedPasscode

      if (group && member.user_id && (matchGroupPasscode || matchPersonalPasscode)) {
        matched = {
          userId: member.user_id,
          memberId: member.id,
          memberName: member.display_name,
          groupId: group.id,
          groupName: group.name,
        }
        break
      }
    }

    if (!matched) {
      setError('Incorrect details.')
      setLoading(false)
      return
    }

    // Build allGroups from memberships for the matched user only.
    const { data: userMembers } = await supabase
      .from('members')
      .select('id, display_name, group_id')
      .eq('user_id', matched.userId)

    const userGroupIds = (userMembers ?? []).map((m) => m.group_id)
    const { data: userGroups } = await supabase
      .from('groups')
      .select('id, name')
      .in('id', userGroupIds)

    const allGroups: GroupEntry[] = (userMembers ?? [])
      .map((m) => {
        const g = userGroups?.find((g) => g.id === m.group_id)
        if (!g) return null
        return { memberId: m.id, memberName: m.display_name, groupId: g.id, groupName: g.name }
      })
      .filter(Boolean) as GroupEntry[]

    localStorage.setItem('nearby_session', JSON.stringify({
      memberId: matched.memberId,
      memberName: matched.memberName,
      groupId: matched.groupId,
      groupName: matched.groupName,
      allGroups,
    }))
    router.push('/nearby')
  }

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white border border-neutral-200 p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-neutral-900">Nearby</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Trusted food spots from your circle
        </p>

        <div className="mt-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-2">
              Last 4 digits of your mobile
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 1234"
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-2">
              Passcode
            </label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              This can be your personal passcode or your group's passcode.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleEnter}
            disabled={loading}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Entering...' : 'Enter Nearby'}
          </button>

          <p className="text-center text-xs text-neutral-400">
            New here?{' '}
            <button onClick={() => router.push('/register')} className="underline text-neutral-600">
              Create an account
            </button>
          </p>
        </div>
      </div>
    </main>
  )
}
