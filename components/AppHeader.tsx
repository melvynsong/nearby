'use client'

import BrandMark from '@/components/BrandMark'
import Link from 'next/link'

interface AppHeaderProps {
  /** Right-side slot - pass logout button, user name, etc. */
  right?: React.ReactNode
  isAdminChef?: boolean
}

export default function AppHeader({ right, isAdminChef }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#e6e9ef] bg-white/92 backdrop-blur-sm">
      <div className="nearby-shell h-16 flex items-center justify-between gap-3">
        <BrandMark size="header" />
        <div className="flex items-center gap-3 shrink-0">
          {isAdminChef && (
            <Link
              href="/nearby/adminchef"
              className="rounded px-3 py-1 text-sm font-medium bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition"
            >
              AdminChef
            </Link>
          )}
          {right}
        </div>
      </div>
    </header>
  )
}
