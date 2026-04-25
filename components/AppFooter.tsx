
"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withBasePath } from '@/lib/base-path';

export default function AppFooter() {
  const [isChef, setIsChef] = useState(false);
  useEffect(() => {
    async function checkChef() {
      let userId = null;
      if (typeof window !== 'undefined') {
        const reg = localStorage.getItem('nearby_register');
        if (reg) {
          const parsed = JSON.parse(reg);
          userId = parsed?.userId || null;
        }
      }
      if (!userId) {
        const { data: sessionData } = await supabase.auth.getSession();
        userId = sessionData?.session?.user?.id || null;
      }
      if (!userId) {
        setIsChef(false);
        return;
      }
      const { data: adminRow } = await supabase
        .from('nearby_admins')
        .select('admin_role, is_active')
        .eq('user_id', userId)
        .eq('admin_role', 'chef')
        .eq('is_active', true)
        .maybeSingle();
      setIsChef(!!adminRow);
    }
    checkChef();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeof window !== 'undefined' && window.localStorage.getItem('nearby_register')]);

  return (
    <footer className="border-t border-[#e6e9ef] bg-[#f5f6f8] py-6">
      <div className="nearby-shell flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2">
          <img
            src={withBasePath('/nearby_logo.png')}
            alt="Nearby"
            width={48}
            height={24}
            loading="lazy"
            className="h-6 w-auto object-contain opacity-85"
          />
          <span className="ml-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700 border border-orange-200 uppercase tracking-wider">beta</span>
          {isChef && (
            <button
              type="button"
              className="ml-1 rounded-full border border-green-200 bg-green-50/80 px-2 py-0.5 text-[10px] font-semibold text-green-700 uppercase tracking-wider shadow-sm hover:bg-green-100 transition min-w-[48px]"
              onClick={() => window.location.assign('/nearby/adminchef')}
            >
              Chef
            </button>
          )}
        </div>
        <p className="text-xs text-[#7b8291]">© 2026 ToGoStory. All rights reserved.</p>
      </div>
    </footer>
  );
}
