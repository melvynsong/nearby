import Link from 'next/link'
import { withBasePath } from '@/lib/base-path'

type BrandMarkProps = {
  clickable?: boolean
  size?: 'hero' | 'header'
}

export default function BrandMark({ clickable = true, size = 'header' }: BrandMarkProps) {
  const logoClass = size === 'hero'
    ? 'h-14 w-auto object-contain shrink-0'
    : 'h-8 w-auto object-contain shrink-0'
  const betaClass = size === 'hero'
    ? 'beta-pulse inline-flex items-center rounded-full bg-[var(--brand-orange-bg)] border border-[var(--brand-orange-border)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--brand-orange)] -translate-y-2'
    : 'beta-pulse inline-flex items-center rounded-full bg-[var(--brand-orange-bg)] border border-[var(--brand-orange-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-orange)] -translate-y-1'

  const content = (
    <>
      <img
        src={withBasePath('/nearby_logo.png')}
        alt="Nearby"
        width={64}
        height={64}
        loading="eager"
        className={`${logoClass} transition-all duration-200 ease-out group-hover:opacity-90 group-hover:scale-[1.02]`}
      />
      <span className={`${betaClass} whitespace-nowrap`}>
        Beta
      </span>
    </>
  )

  if (!clickable) {
    return <div className="flex items-center gap-2 shrink-0">{content}</div>
  }

  return (
    <Link href={withBasePath('/')} className="group flex items-center gap-2 shrink-0">
      {content}
    </Link>
  )
}
