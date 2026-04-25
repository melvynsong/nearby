"use client";
import { withBasePath } from '@/lib/base-path'

export default function AppFooter() {
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
          <button
            type="button"
            className="ml-1 rounded-full border border-green-200 bg-green-50/80 px-2 py-0.5 text-[10px] font-semibold text-green-700 uppercase tracking-wider shadow-sm hover:bg-green-100 transition min-w-[48px]"
            onClick={() => window.open('https://www.togostory.com/chef', '_blank')}
          >
            Chef
          </button>
        </div>
        <p className="text-xs text-[#7b8291]">© 2026 ToGoStory. All rights reserved.</p>
      </div>
    </footer>
  );
}
