import { withBasePath } from '@/lib/base-path'

export default function AppFooter() {
  return (
    <footer className="border-t border-[#e6e9ef] bg-[#f5f6f8] py-6">
      <div className="nearby-shell flex flex-col items-center gap-2 text-center">
        <img
          src={withBasePath('/nearby_logo.png')}
          alt="Nearby"
          width={48}
          height={24}
          loading="lazy"
          className="h-6 w-auto object-contain opacity-85"
        />
        <p className="text-xs text-[#7b8291]">© 2026 ToGoStory. All rights reserved.</p>
      </div>
    </footer>
  )
}
