'use client'

import { useState } from 'react'
import { mapUrl } from '@/lib/nearby-helpers'

export type ShareableSpot = {
  placeName: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  googlePlaceId?: string | null
}

type Props = {
  categoryTitle: string
  spots: ShareableSpot[]
  /** Optional cap on how many spots to include in the WhatsApp message. */
  maxSpots?: number
  className?: string
}

const DEFAULT_MAX = 12

function buildMessage(categoryTitle: string, spots: ShareableSpot[]): string {
  const lines: string[] = []
  lines.push(`*Top ${categoryTitle} in Singapore*`)
  lines.push('Curated by Nearby')
  lines.push('')

  spots.forEach((spot, idx) => {
    lines.push(`${idx + 1}. ${spot.placeName}`)
    if (spot.address) lines.push(`   ${spot.address}`)
    const link = mapUrl(spot.lat ?? null, spot.lng ?? null, spot.placeName, spot.googlePlaceId ?? null)
    if (link) lines.push(`   📍 ${link}`)
    lines.push('')
  })

  lines.push('Find more on Nearby — https://togostory.com/nearby')

  return lines.join('\n').trim()
}

export default function ShareCategoryButton({
  categoryTitle,
  spots,
  maxSpots = DEFAULT_MAX,
  className = '',
}: Props) {
  const [copied, setCopied] = useState(false)
  const disabled = !spots || spots.length === 0

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return

    const trimmed = spots.slice(0, maxSpots)
    const message = buildMessage(categoryTitle, trimmed)
    const encoded = encodeURIComponent(message)
    const waUrl = `https://wa.me/?text=${encoded}`

    console.log('[ShareCategoryButton] sharing', {
      categoryTitle,
      spotCount: trimmed.length,
      truncated: spots.length > trimmed.length,
    })

    // Always copy to clipboard so users can paste anywhere too.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch (err) {
      console.warn('[ShareCategoryButton] clipboard failed', err)
    }

    // Open WhatsApp share sheet.
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={
        'inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#1ebe5a] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ' +
        className
      }
      aria-label={`Share ${categoryTitle} list to WhatsApp`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
        <path d="M20.5 3.5A11 11 0 0 0 3.6 17.6L2 22l4.5-1.6A11 11 0 1 0 20.5 3.5Zm-8.5 18a9.4 9.4 0 0 1-4.8-1.3l-.3-.2-2.7 1 .9-2.6-.2-.3A9.4 9.4 0 1 1 12 21.5Zm5.4-7c-.3-.1-1.7-.8-2-.9s-.5-.1-.7.1l-1 1.2c-.2.2-.4.3-.7.1a7.7 7.7 0 0 1-3.8-3.3c-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.8.4 3.5 3.5 0 0 0-1.1 2.6c0 1.5 1.1 3 1.3 3.2.2.2 2.2 3.4 5.4 4.7 2 .8 2.7.9 3.7.7.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3Z" />
      </svg>
      {copied ? 'Copied + opening…' : 'Share to WhatsApp'}
    </button>
  )
}
