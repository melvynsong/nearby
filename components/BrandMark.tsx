import Image from 'next/image'
import Link from 'next/link'

type BrandMarkProps = {
  clickable?: boolean
}

export default function BrandMark({ clickable = true }: BrandMarkProps) {
  const content = (
    <>
      <Image
        src="/nearby_logo.png"
        alt="Nearby"
        width={64}
        height={64}
        priority
        className="h-7 w-auto object-contain md:h-8 shrink-0 transition-all duration-200 ease-out group-hover:opacity-90 group-hover:scale-[1.02]"
      />
      <span className="beta-pulse inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-600 dark:bg-orange-900/30 dark:text-orange-300 whitespace-nowrap">
        Beta
      </span>
    </>
  )

  if (!clickable) {
    return <div className="flex items-center gap-2 shrink-0">{content}</div>
  }

  return (
    <Link href="/" className="group flex items-center gap-2 shrink-0">
      {content}
    </Link>
  )
}
