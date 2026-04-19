'use client'

import { useState } from 'react'
import type { ShowcaseItem } from '@/lib/showcase-utils'
import { formatDistanceKm } from '@/lib/showcase-utils'

type Props = {
  items: ShowcaseItem[]
  locationMode?: boolean
}

function mapsUrl(item: ShowcaseItem): string {
  if (item.lat != null && item.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.placeName)}`
}

// Determine tile span class based on rank or distance — creates the collage feel
function tileClass(rank: number, displayRank?: number): string {
  const position = displayRank ?? rank
  if (position === 1) return 'col-span-2 row-span-2'   // hero tile: 2×2
  if (position === 2) return 'col-span-2 row-span-1'   // wide tile
  if (position === 3) return 'col-span-1 row-span-2'   // tall tile
  return 'col-span-1 row-span-1'                       // standard tile
}

// Mobile span (2-col grid)
function mobileTileClass(rank: number, displayRank?: number): string {
  const position = displayRank ?? rank
  if (position === 1) return 'col-span-2'
  return 'col-span-1'
}

type TileProps = {
  item: ShowcaseItem
  rank: number
  displayRank?: number
}

function MosaicTile({ item, rank, displayRank }: TileProps) {
  const [overlayVisible, setOverlayVisible] = useState(false)
  const photo = item.photos[0] ?? null
  const url = mapsUrl(item)
  const isTop3 = (displayRank ?? rank) <= 3
  const showDistance = displayRank != null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      // Desktop: use rank-based or distance-based span. Mobile: only position 1 is wide.
      className={`group relative overflow-hidden bg-[#1a2438] cursor-pointer focus-visible:ring-2 focus-visible:ring-[#1f355d]
        ${mobileTileClass(rank, displayRank)} sm:${tileClass(rank, displayRank)}
      `}
      onMouseEnter={() => setOverlayVisible(true)}
      onMouseLeave={() => setOverlayVisible(false)}
      onTouchStart={() => setOverlayVisible(true)}
      onTouchEnd={() => setTimeout(() => setOverlayVisible(false), 1200)}
      aria-label={`${item.placeName} — ${item.dishName}`}
    >
      {/* Photo */}
      {photo ? (
        <img
          src={photo}
          alt={item.placeName}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-20">🍽️</div>
      )}

      {/* Permanent dark gradient at bottom — always visible info */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent pointer-events-none" />

      {/* Permanent bottom info strip */}
      <div className="absolute inset-x-0 bottom-0 p-2 sm:p-3 pointer-events-none">
        <p className={`font-semibold text-white leading-tight drop-shadow-sm line-clamp-1 ${isTop3 ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'}`}>
          {item.placeName}
        </p>
        {!showDistance && item.googleRating != null && (
          <div className="mt-1 text-[10px] sm:text-xs font-semibold text-amber-300">
            ★ {item.googleRating.toFixed(1)}
          </div>
        )}
      </div>

      {/* Premium mode-specific badge (bottom-right) */}
      <div className="absolute bottom-2 right-2 pointer-events-none">
        {showDistance ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200/45 bg-cyan-950/55 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 backdrop-blur-sm shadow-md">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            {item.distanceKm != null ? formatDistanceKm(item.distanceKm) : 'No distance'}
          </span>
        ) : item.googleRating != null ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/50 bg-black/45 px-2.5 py-1 text-[10px] font-semibold text-amber-200 backdrop-blur-sm shadow-md">
            <span>★</span>
            <span>{item.googleRating.toFixed(1)}</span>
            {item.googleRatingCount != null && (
              <span className="text-[9px] font-medium text-amber-100/80">({item.googleRatingCount.toLocaleString()})</span>
            )}
          </span>
        ) : null}
      </div>

      {/* Hover / tap overlay — additional info */}
      <div className={`absolute inset-0 transition-opacity duration-200 pointer-events-none ${overlayVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-[#1f355d]/60" />
        <div className="absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
          {/* Rank + dish */}
          <div className="flex items-start gap-2">
            <span className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow ${
              rank === 1 ? 'bg-amber-400 text-amber-900' : 'bg-white/20 text-white'
            }`}>
              {rank}
            </span>
            <span className="text-xs text-white/80 pt-1">{item.dishName}</span>
          </div>

          {/* AI description */}
          {item.aiDescription && (
            <p className="text-[11px] leading-relaxed text-white/80 line-clamp-3">
              {item.aiDescription}
            </p>
          )}

          {/* Open Maps CTA */}
          <div className="flex items-center gap-1 text-[11px] font-semibold text-white mt-auto">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
            Open in Maps
          </div>
        </div>
      </div>

      {/* Rank badge — always visible, top-left */}
      {rank <= 3 && (
        <div className="absolute top-2 left-2">
          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 shadow ${
            rank === 1 ? 'bg-amber-400 text-amber-900' : 'bg-black/50 text-white'
          }`}>
            #{rank}
          </span>
        </div>
      )}
    </a>
  )
}

export default function ShowcasePhotoMosaic({ items, locationMode }: Props) {
  if (!items.length) return null

  let displayItems = [...items].sort((a, b) => a.rank - b.rank)
  const displayRankMap = new Map<string, number>()

  if (locationMode) {
    // Sort by distance (nearest first) and assign display ranks
    const itemsWithDistance = items
      .filter((item) => item.distanceKm != null)
      .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY))
    const itemsWithoutDistance = items
      .filter((item) => item.distanceKm == null)
      .sort((a, b) => a.rank - b.rank)

    displayItems = [...itemsWithDistance, ...itemsWithoutDistance]
    displayItems.forEach((item, idx) => {
      displayRankMap.set(item.placeId, idx + 1)
    })
  }

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 gap-[2px] w-full"
      style={{ gridAutoRows: 'clamp(140px, 22vw, 220px)' }}
    >
      {displayItems.map((item) => (
        <MosaicTile
          key={item.placeId}
          item={item}
          rank={item.rank}
          displayRank={locationMode ? displayRankMap.get(item.placeId) : undefined}
        />
      ))}
    </div>
  )
}
