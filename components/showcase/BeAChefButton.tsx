'use client'

import { useState } from 'react'
import BeAChefSheet from '@/components/showcase/BeAChefSheet'

type Props = {
  photoUrl: string | null
  placeName?: string | null
  dishHint?: string | null
  className?: string
}

function ChefHatIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 14a4 4 0 1 1 1.6-7.66A5 5 0 0 1 17 7a4 4 0 0 1 1 7.87" />
      <path d="M6 14h12v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4Z" />
      <path d="M9 18v2M15 18v2" />
    </svg>
  )
}

export default function BeAChefButton({
  photoUrl,
  placeName,
  dishHint,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const disabled = !photoUrl

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={
          'inline-flex items-center gap-1.5 rounded-full bg-neutral-900/90 px-3 py-1.5 text-[11px] font-semibold text-white shadow-md backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ' +
          className
        }
        aria-label="Be a Chef — see how this dish is made"
      >
        <ChefHatIcon className="h-3.5 w-3.5" />
        <span>Be a Chef</span>
      </button>

      <BeAChefSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        photoUrl={photoUrl}
        placeName={placeName}
        dishHint={dishHint}
      />
    </>
  )
}
