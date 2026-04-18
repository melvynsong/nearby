'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ErrorState from '@/components/ErrorState'
import AppHeader from '@/components/AppHeader'
import NearbyHome from '@/app/nearby/page'
import { withBasePath } from '@/lib/base-path'

type GroupEntry = {
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

export default function Home() {
  const router = useRouter()
  const [last4, setLast4] = useState('')
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showLoginErrorCard, setShowLoginErrorCard] = useState(false)
  const [registerAccount, setRegisterAccount] = useState<RegisterData | null>(null)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    const session = localStorage.getItem('nearby_session')
    if (session) {
      setHasSession(true)
      return
    }

    const rawRegister = localStorage.getItem('nearby_register')
    if (rawRegister) {
      try {
        setRegisterAccount(JSON.parse(rawRegister) as RegisterData)
      } catch {
        setRegisterAccount(null)
      }
    }
  }, [router])

  if (hasSession) {
    return <NearbyHome />
  }

  const handleCreateGroupCta = () => {
    const session = localStorage.getItem('nearby_session')
    const register = localStorage.getItem('nearby_register')
    if (session || register) {
      router.push(withBasePath('/create-group'))
      return
    }
    localStorage.setItem('nearby_after_auth', 'create-group')
    router.push(withBasePath('/register'))
  }

  const handleJoinGroupCta = () => {
    const session = localStorage.getItem('nearby_session')
    const register = localStorage.getItem('nearby_register')
    if (session || register) {
      router.push(withBasePath('/join-group'))
      return
    }
    localStorage.setItem('nearby_after_auth', 'join-group')
    router.push(withBasePath('/register'))
  }

  const handleEnter = async () => {
    setError('')
    setShowLoginErrorCard(false)

    if (last4.length !== 4 || !/^\d{4}$/.test(last4)) {
      setError('Enter the last 4 digits of your mobile.')
      return
    }

    setLoading(true)

    try {
      // Fetch all members with this phone_last4
      const { data: members, error: membersError } = await supabase
        .from('members')
        .select('id, display_name, group_id, user_id')
        .eq('phone_last4', last4)

      if (membersError) {
        console.error('[Nearby][API] Members lookup failed:', membersError)
        throw new Error('LOGIN_MEMBERS_LOOKUP_FAILED')
      }

      if (!members || members.length === 0) {
        const { data: accountCandidates, error: accountCandidatesError } = await supabase
          .from('users')
          .select('id, full_name, phone_number, phone_last4')
          .eq('phone_last4', last4)
          .limit(2)

        if (accountCandidatesError) {
          console.error('[Nearby][API] Account-only lookup failed:', accountCandidatesError)
          throw new Error('LOGIN_ACCOUNT_LOOKUP_FAILED')
        }

        const matches = accountCandidates ?? []

        if (matches.length > 1) {
          setError('We found multiple accounts with this mobile ending. Join with your group passcode instead.')
          setLoading(false)
          return
        }

        const userOnly = matches[0]

        if (userOnly?.id) {
          localStorage.setItem('nearby_register', JSON.stringify({
            userId: userOnly.id,
            userName: userOnly.full_name ?? 'Member',
            phone4: userOnly.phone_last4 ?? last4,
            phone: userOnly.phone_number ?? '',
          }))
          setRegisterAccount({
            userId: userOnly.id,
            userName: userOnly.full_name ?? 'Member',
            phone4: userOnly.phone_last4 ?? last4,
            phone: userOnly.phone_number ?? '',
          })
          setLoading(false)
          return
        }

        setError('Incorrect details.')
        setLoading(false)
        return
      }

      // Fetch all groups for those members
      const groupIds = members.map((m) => m.group_id)
      const { data: groups, error: groupsError } = await supabase
        .from('groups')
        .select('id, name, access_code')
        .in('id', groupIds)

      if (groupsError) {
        console.error('[Nearby][API] Groups lookup failed:', groupsError)
        throw new Error('LOGIN_GROUPS_LOOKUP_FAILED')
      }

      // Match group passcode for one of the user's groups.
      let matched: (GroupEntry & { userId: string }) | null = null
      const trimmedPasscode = passcode.trim()

      if (!trimmedPasscode) {
        setError('Enter your group passcode.')
        setLoading(false)
        return
      }

      for (const member of members) {
        const group = groups?.find((g) => g.id === member.group_id)
        const matchGroupPasscode = group?.access_code === trimmedPasscode

        if (group && member.user_id && matchGroupPasscode) {
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
      const { data: userMembers, error: userMembersError } = await supabase
        .from('members')
        .select('id, display_name, group_id')
        .eq('user_id', matched.userId)

      if (userMembersError) {
        console.error('[Nearby][API] User members lookup failed:', userMembersError)
        throw new Error('LOGIN_USER_MEMBERS_LOOKUP_FAILED')
      }

      const userGroupIds = (userMembers ?? []).map((m) => m.group_id)
      const { data: userGroups, error: userGroupsError } = await supabase
        .from('groups')
        .select('id, name')
        .in('id', userGroupIds)

      if (userGroupsError) {
        console.error('[Nearby][API] User groups lookup failed:', userGroupsError)
        throw new Error('LOGIN_USER_GROUPS_LOOKUP_FAILED')
      }

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
      localStorage.setItem('nearby_register', JSON.stringify({
        userId: matched.userId,
        userName: matched.memberName,
        phone4: last4,
        phone: '',
      }))

      const nextAction = localStorage.getItem('nearby_after_auth')
      if (nextAction === 'create-group') {
        localStorage.removeItem('nearby_after_auth')
        router.push(withBasePath('/create-group'))
        return
      }

      if (nextAction === 'join-group') {
        localStorage.removeItem('nearby_after_auth')
        router.push(withBasePath('/join-group'))
        return
      }

      router.push(withBasePath('/nearby'))
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
            onClick={() => router.push(withBasePath('/add-place'))}
            className="w-full rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Add a Place
          </button>
        </div>
        <button
          onClick={handleJoinGroupCta}
          className="mt-3 text-sm font-medium text-teal-700 hover:underline"
        >
          Have a passcode? Join Group
        </button>
        {registerAccount && (
          <p className="mt-3 text-xs text-neutral-500">
            Signed in as {registerAccount.userName}. You do not have a group yet.
          </p>
        )}
      </section>

      {!registerAccount && (
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
              placeholder="5432"
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Group passcode
            </label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="9999"
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              Required if you are already in a group.
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
            <button onClick={() => router.push(withBasePath('/register'))} className="font-medium text-teal-700 hover:underline">
              Create an account
            </button>
          </p>
        </div>
      </div>
      )}
      </div>
    </main>
  )
}
