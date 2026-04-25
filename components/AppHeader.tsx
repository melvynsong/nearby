"use client";

import BrandMark from '@/components/BrandMark';
import { useEffect, useState } from 'react';


export default function AppHeader({ forceShowPills = false }: { forceShowPills?: boolean } = {}) {
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    async function resolveName() {
      let name = null;
      try {
        const reg = typeof window !== 'undefined' ? localStorage.getItem('nearby_register') : null;
        if (reg) {
          const parsed = JSON.parse(reg);
          name = parsed?.fullName || parsed?.name || null;
        }
      } catch {}
      // Fallback: try to get from Supabase session
      if (!name) {
        try {
          const { data: sessionData } = await import('@/lib/supabase').then(m => m.supabase.auth.getSession());
          name = sessionData?.session?.user?.user_metadata?.full_name || null;
        } catch {}
      }
      setUserName(name);
    }
    resolveName();
  }, []);

  function handleLogout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nearby_session');
      localStorage.removeItem('nearby_register');
      localStorage.removeItem('nearby_passcode_set');
      window.location.replace('https://www.togostory.com/nearby/');
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[#e6e9ef] bg-white/92 backdrop-blur-sm">
      <div className="nearby-shell h-16 flex items-center justify-between gap-3">
        <BrandMark size="header" />
        <div className="flex items-center gap-3 shrink-0">
          {userName && (
            <span className="text-xs text-neutral-700 font-medium mr-1">You are logged in as <span className="font-bold">{userName}</span></span>
          )}
          {(userName || forceShowPills) && (
            <>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/80 px-3 text-xs font-medium text-blue-700 transition-all hover:bg-blue-100 active:scale-[0.98]"
                onClick={() => window.location.assign('https://www.togostory.com/nearby/settings')}
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>Group Settings</span>
              </button>
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
            </>
          )}
        </div>
      </div>
    </header>
  );
}
