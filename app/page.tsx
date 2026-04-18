'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()
  const [last4, setLast4] = useState('')
  const [password, setPassword] = useState('')
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
    if (!password) {
      setError('Enter your group password.')
      return
    }

    setLoading(true)

    const { data: members } = await supabase
      .from('members')
      .select('id, display_name, group_id')
      .eq('phone_last4', last4)

    if (!members || members.length === 0) {
      setError('Incorrect details.')
      setLoading(false)
      return
    }

    const groupIds = members.map((m) => m.group_id)
    const { data: groups } = await supabase
      .from('groups')
      .select('id, name, access_code')
      .in('id', groupIds)

    let matched: { memberId: string; memberName: string; groupId: string; groupName: string } | null = null

    for (const member of members) {
      const group = groups?.find((g) => g.id === member.group_id)
      if (group && group.access_code === password) {
        matched = {
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

    localStorage.setItem('nearby_session', JSON.stringify(matched))
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
              Group password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleEnter}
            disabled={loading}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Entering...' : 'Enter Nearby'}
          </button>
        </div>
      </div>
    </main>
  )
}
