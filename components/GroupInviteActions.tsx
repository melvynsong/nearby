'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildGroupInviteMessage } from '@/lib/invite'

type GroupInviteActionsProps = {
  groupName: string
  groupPasscode: string
}

export default function GroupInviteActions({ groupName, groupPasscode }: GroupInviteActionsProps) {
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [canSystemShare, setCanSystemShare] = useState(false)

  const inviteMessage = useMemo(() => buildGroupInviteMessage(groupName, groupPasscode), [groupName, groupPasscode])

  useEffect(() => {
    setCanSystemShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const clearNotice = () => {
    setTimeout(() => {
      setFeedback('')
      setError('')
    }, 1800)
  }

  const handleWhatsAppShare = () => {
    setFeedback('')
    setError('')
    try {
      const encoded = encodeURIComponent(inviteMessage)
      const isMobile = /iPhone|Android/i.test(navigator.userAgent)
      const url = isMobile
        ? `https://wa.me/?text=${encoded}`
        : `https://web.whatsapp.com/send?text=${encoded}`
      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      if (!opened) {
        setError('Unable to open sharing. Please copy the invite instead.')
        clearNotice()
      }
    } catch (shareError) {
      console.error('[Nearby][Share] WhatsApp share failed:', shareError)
      setError('Unable to open sharing. Please copy the invite instead.')
      clearNotice()
    }
  }

  const handleCopyInvite = async () => {
    setFeedback('')
    setError('')
    try {
      await navigator.clipboard.writeText(inviteMessage)
      setFeedback('Invite copied')
      clearNotice()
    } catch (copyError) {
      console.error('[Nearby][Share] Copy invite failed:', copyError)
      setError('Unable to copy now. Please try again.')
      clearNotice()
    }
  }

  const handleSystemShare = async () => {
    if (!canSystemShare || !navigator.share) return
    setFeedback('')
    setError('')
    try {
      await navigator.share({
        title: `Group Invite - ${groupName}`,
        text: inviteMessage,
      })
    } catch (shareError) {
      console.error('[Nearby][Share] System share failed:', shareError)
      setError('Unable to open sharing. Please copy the invite instead.')
      clearNotice()
    }
  }

  const handleCopyPasscode = async () => {
    setFeedback('')
    setError('')
    try {
      await navigator.clipboard.writeText(groupPasscode)
      setFeedback('Passcode copied')
      clearNotice()
    } catch (copyError) {
      console.error('[Nearby][Share] Copy passcode failed:', copyError)
      setError('Unable to copy now. Please try again.')
      clearNotice()
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">Invite Members</p>
      <p className="mt-1 text-xs text-neutral-500">Share this group with your friends in one tap.</p>

      <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
        <p className="text-xs text-neutral-500">Group name</p>
        <p className="text-sm font-medium text-neutral-900">{groupName}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-neutral-500">Group passcode</p>
            <p className="text-base font-semibold tracking-wide text-neutral-900">{groupPasscode}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyPasscode()}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Copy Passcode
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleWhatsAppShare}
          className="w-full rounded-xl bg-[#1f355d] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#162746]"
        >
          Share Group
        </button>
        <button
          type="button"
          onClick={handleCopyInvite}
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Copy Invite
        </button>
        {canSystemShare && (
          <button
            type="button"
            onClick={() => void handleSystemShare()}
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Share
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        Make sure they have created their account before joining.
      </p>

      {feedback && <p className="mt-2 text-xs font-medium text-[#1f355d]">{feedback}</p>}
      {error && <p className="mt-2 text-xs font-medium text-amber-700">{error}</p>}
    </section>
  )
}
