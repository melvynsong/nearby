'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ErrorState from '@/components/ErrorState'
import AppHeader from '@/components/AppHeader'

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
  const [showLoginErrorCard, setShowLoginErrorCard] = useState(false)

  useEffect(() => {
    const session = localStorage.getItem('nearby_session')
    if (session) router.replace('/nearby')
  }, [router])

  const handleCreateGroupCta = () => {
    const session = localStorage.getItem('nearby_session')
    if (session) {
      router.push('/create-group')
      return
    }
    localStorage.setItem('nearby_after_auth', 'create-group')
    router.push('/register')
  }

  const handleEnter = async () => {
    setError('')
    setShowLoginErrorCard(false)

    if (last4.length !== 4 || !/^\d{4}$/.test(last4)) {
      setError('Enter the last 4 digits of your mobile.')
      return
    }
    if (!passcode.trim()) {
      setError('Enter your passcode.')
      return
    }

    setLoading(true)

    try {
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

      const nextAction = localStorage.getItem('nearby_after_auth')
      if (nextAction === 'create-group') {
        localStorage.removeItem('nearby_after_auth')
        router.push('/create-group')
        return
      }

      router.push('/nearby')
    } catch (err) {
      console.error('[Nearby][API] Login failed:', err)
      setError('We could not complete this just now. Please try again.')
      setShowLoginErrorCard(true)
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f8f6]">
      <AppHeader />
      <div className="flex flex-col items-center justify-center px-5 py-10">

      <section className="mb-8 w-full max-w-xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
          Discover good places nearby, together.
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-neutral-600 sm:text-base">
          Nearby helps you find, save, and share useful places around you - from food spots to meetup ideas and local finds. Build groups, add places, and make it easier for everyone to decide where to go next.
        </p>
        <div className="mx-auto mt-5 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
          <button
            onClick={handleCreateGroupCta}
            className="w-full rounded-xl bg-teal-700 px-5 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.02] hover:bg-teal-800 active:scale-[0.99]"
          >
            Create a Group
          </button>
          <button
            onClick={() => router.push('/add-place')}
            className="w-full rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Add a Place
          </button>
        </div>
      </section>

      <div className="w-full max-w-sm rounded-2xl bg-white border border-neutral-200 p-7 shadow-sm">
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Last 4 digits of your mobile
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 1234"
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Passcode
            </label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              Your personal passcode or your group's passcode.
            </p>
          </div>

          {error && !showLoginErrorCard && <p className="text-sm text-red-600">{error}</p>}

          {showLoginErrorCard && (
            <ErrorState
              title="Something did not go through"
              message="We could not complete this just now. Please try again."
              onPrimary={handleEnter}
            />
          )}

          <button
            onClick={handleEnter}
            disabled={loading}
            className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 active:bg-teal-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {loading ? 'Entering…' : 'Enter Nearby'}
          </button>

          <p className="text-center text-xs text-neutral-400">
            New here?{' '}
            <button onClick={() => router.push('/register')} className="font-medium text-teal-700 hover:underline">
              Create an account
            </button>
          </p>
        </div>
      </div>
      </div>
    </main>
  )
}
