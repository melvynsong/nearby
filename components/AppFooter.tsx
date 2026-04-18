import { withBasePath } from '@/lib/base-path'

export default function AppFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-[#f8f8f6] py-6">
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-5 text-center">
        <img
          src={withBasePath('/nearby_logo.png')}
          alt="Nearby"
          width={48}
          height={24}
          loading="lazy"
          className="h-6 w-auto object-contain"
        />
        <p className="text-sm text-neutral-500">Discover and share great places nearby</p>
        <p className="text-xs text-neutral-400">Copyright 2026</p>
      </div>
    </footer>
  )
}
