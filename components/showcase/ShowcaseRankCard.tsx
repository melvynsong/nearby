'use client'

import Image from 'next/image'
import type { ShowcaseItem } from '@/lib/showcase-utils'
import { formatDistanceKm } from '@/lib/showcase-utils'

type Props = {
  item: ShowcaseItem
  isNearby: boolean
  animationDelay?: number
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.3
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${i < full ? 'text-amber-400' : half && i === full ? 'text-amber-300' : 'text-neutral-300'}`} fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  )
}

export default function ShowcaseRankCard({ item, isNearby, animationDelay = 0 }: Props) {
  const photo = item.photos[0] ?? null
  const mapsUrl = item.lat != null && item.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.placeName)}`

  return (
    <div
      className={`group relative flex gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md ${
        isNearby ? 'border-amber-200 ring-1 ring-amber-100' : 'border-neutral-200'
      }`}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Rank badge */}
      <div
        className={`absolute -left-3 -top-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-sm ${
          item.rank === 1
            ? 'bg-amber-400 text-amber-900'
            : item.rank <= 3
            ? 'bg-neutral-800 text-white'
            : 'bg-neutral-100 text-neutral-600'
        }`}
      >
        {item.rank}
      </div>

      {/* Photo */}
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
        {photo ? (
          <Image
            src={photo}
            alt={item.placeName}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="96px"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🍽️</div>
        )}
        {isNearby && (
          <span className="absolute bottom-1 left-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">
            Near you
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900">{item.placeName}</p>
        <p className="text-xs text-neutral-500">{item.dishName}</p>

        {/* Rating row */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {item.googleRating != null ? (
            <span className="flex items-center gap-1">
              <StarRating rating={item.googleRating} />
              <span className="text-xs font-semibold text-neutral-700">{item.googleRating.toFixed(1)}</span>
              {item.googleRatingCount != null && (
                <span className="text-[11px] text-neutral-400">
                  ({item.googleRatingCount.toLocaleString()})
                </span>
              )}
            </span>
          ) : (
            <span className="text-xs text-neutral-400">No rating yet</span>
          )}

          {item.distanceKm != null && (
            <span className={`text-xs font-medium ${isNearby ? 'text-amber-600' : 'text-neutral-500'}`}>
              {formatDistanceKm(item.distanceKm)}
            </span>
          )}

          {item.saveCount > 0 && (
            <span className="text-[11px] text-neutral-400">
              Saved {item.saveCount}×
            </span>
          )}
        </div>

        {/* AI description */}
        {item.aiDescription && (
          <p className="mt-2 text-xs leading-relaxed text-neutral-500 line-clamp-2">
            {item.aiDescription}
          </p>
        )}

        {/* CTA */}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-neutral-400 underline decoration-dotted hover:text-neutral-700"
        >
          View on Maps
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
          </svg>
        </a>
      </div>
    </div>
  )
}
