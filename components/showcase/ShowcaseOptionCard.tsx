'use client'

import Link from 'next/link'
import { withBasePath } from '@/lib/base-path'

// Serializable subset of ShowcaseConfig — safe to pass from Server → Client
export type ShowcaseCardProps = {
  key: string
  title: string
  editorialDescription: string
  categoryUsageCount?: number
  tagline: string
  heroGradientFrom: string
  heroGradientTo: string
  emoji: string
}

type Props = { config: ShowcaseCardProps; index: number }

export default function ShowcaseOptionCard({ config, index }: Props) {
  const delay = index * 120

  return (
    <Link
      href={withBasePath(`/showcase/${config.key}`)}
      className="group relative flex flex-col justify-end overflow-hidden rounded-3xl min-h-[280px] cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      style={{
        animationDelay: `${delay}ms`,
        background: `linear-gradient(145deg, ${config.heroGradientFrom}, ${config.heroGradientTo})`,
      }}
    >
      {/* Texture overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 50%)',
        }}
      />

      {/* Large emoji decoration */}
      <div
        className="absolute top-6 right-6 text-6xl opacity-20 transition-transform duration-500 group-hover:scale-110 group-hover:opacity-30"
        aria-hidden
      >
        {config.emoji}
      </div>

      {/* Content */}
      <div className="relative z-10 p-7">
        {/* Tagline pill */}
        <span className="mb-3 inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/80">
          {config.tagline}
        </span>

        <h2 className="text-2xl font-bold leading-tight text-white drop-shadow-sm">
          {config.emoji} {config.title}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-white/75 line-clamp-2">
          {config.editorialDescription}
        </p>

        {/* CTA row */}
        <div className="mt-5 flex items-center gap-2">
          <span className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-neutral-900 shadow-sm transition-all duration-200 group-hover:bg-white group-hover:shadow-md">
            Explore
          </span>
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-white/70 transition-transform duration-300 group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* Hover shimmer */}
      <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)' }}
      />
    </Link>
  )
}
