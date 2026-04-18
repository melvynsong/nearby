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
        {/* Logo-only brand mark */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <Image
            src="/nearby_logo.png"
            alt="Nearby"
            width={32}
            height={32}
            priority
            className="h-7 w-auto md:h-8 transition-all duration-200 ease-out group-hover:opacity-90 group-hover:scale-[1.02]"
          />
          <span className="beta-pulse inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-600 dark:bg-orange-900/30 dark:text-orange-300">
            Beta
          </span>
        </Link>

        {/* Right slot */}
        {right && <div className="flex items-center gap-3 shrink-0">{right}</div>}
      </div>
    </header>
  )
}
