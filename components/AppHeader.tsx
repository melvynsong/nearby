'use client'

import BrandMark from '@/components/BrandMark'

interface AppHeaderProps {
  /** Right-side slot — pass logout button, user name, etc. */
  right?: React.ReactNode
}

export default function AppHeader({ right }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-neutral-100">
      <div className="mx-auto max-w-md px-5 h-14 flex items-center justify-between gap-3">
        <BrandMark />

        {/* Right slot */}
        {right && <div className="flex items-center gap-3 shrink-0">{right}</div>}
      </div>
    </header>
  )
}
