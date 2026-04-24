'use client'

import BrandMark from '@/components/BrandMark'

interface AppHeaderProps {
  /** Right-side slot - pass logout button, user name, etc. */
  right?: React.ReactNode
}

export default function AppHeader({ right }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#e6e9ef] bg-white/92 backdrop-blur-sm">
      <div className="nearby-shell h-16 flex items-center justify-between gap-3">
        <BrandMark size="header" />

        {/* Right slot */}
        {right && <div className="flex items-center gap-3 shrink-0">{right}</div>}
      </div>
    </header>
  )
}
