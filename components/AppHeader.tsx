'use client'

import Image from 'next/image'
import Link from 'next/link'

interface AppHeaderProps {
  /** Right-side slot — pass logout button, user name, etc. */
  right?: React.ReactNode
}

export default function AppHeader({ right }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-neutral-100">
      <div className="mx-auto max-w-md px-5 h-14 flex items-center justify-between gap-3">
        {/* Logo */}
        <Link href="/nearby" className="flex items-center gap-2.5 group shrink-0">
          <Image
            src="/nearby_logo.png"
            alt="Nearby"
            width={28}
            height={28}
            priority
            className="rounded-lg transition-transform group-hover:scale-105"
          />
          <span className="text-base font-semibold tracking-tight text-neutral-900 group-hover:text-teal-700 transition-colors">
            Nearby
          </span>
          <span className="beta-pulse inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-orange-600">
            Beta
          </span>
        </Link>

        {/* Right slot */}
        {right && <div className="flex items-center gap-3 shrink-0">{right}</div>}
      </div>
    </header>
  )
}
