'use client'

import BrandMark from '@/components/BrandMark'
import Link from 'next/link'

interface AppHeaderProps {
  /** Right-side slot - pass logout button, user name, etc. */
  right?: React.ReactNode
}

export default function AppHeader({ right }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#e6e9ef] bg-white/92 backdrop-blur-sm">
      <div className="nearby-shell h-16 flex items-center justify-between gap-3">
        <BrandMark size="header" />
        <div className="flex items-center gap-3 shrink-0">
          {right}
        </div>
      </div>
    </header>
  )
  // Logout handler (client only)
  function handleLogout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nearby_session');
      localStorage.removeItem('nearby_register');
      localStorage.removeItem('nearby_passcode_set');
      window.location.replace('/');
    }
  }
  return (
    <header className="sticky top-0 z-30 border-b border-[#e6e9ef] bg-white/92 backdrop-blur-sm">
      <div className="nearby-shell h-16 flex items-center justify-between gap-3">
        <BrandMark size="header" />
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleLogout}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50/70 px-3 text-xs font-medium text-rose-700 transition-all hover:bg-rose-100 active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            <span>Logout</span>
          </button>
          {right}
        </div>
      </div>
    </header>
  )
}
