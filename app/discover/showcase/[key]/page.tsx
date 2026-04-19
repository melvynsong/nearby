'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import ShowcaseRankCard from '@/components/showcase/ShowcaseRankCard'
import ShowcaseLocationPrompt from '@/components/showcase/ShowcaseLocationPrompt'
import { getShowcaseConfig } from '@/lib/showcase-config'
import { attachDistances, type ShowcaseItem } from '@/lib/showcase-utils'
import { apiPath, withBasePath } from '@/lib/base-path'

const LOCATION_PREF_KEY = 'nearby_showcase_location_pref'

type LocationPref = 'allowed' | 'declined' | null

type ShowcaseResponse = {
  ok: boolean
  items: ShowcaseItem[]
  title: string
  insufficient?: boolean
  config: { key: string; tagline: string; description?: string }
}

function useShowcaseLocation(
  items: ShowcaseItem[],
  onItems: (updated: ShowcaseItem[]) => void,
) {
  const [locationPref, setLocationPref] = useState<LocationPref>(null)
  const [locating, setLocating] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(LOCATION_PREF_KEY) as LocationPref
    setLocationPref(stored)
    if (stored === 'allowed' && items.length > 0) {
      requestLocation(items, onItems)
    } else if (stored === null) {
      setShowPrompt(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  const requestLocation = useCallback((currentItems: ShowcaseItem[], cb: (i: ShowcaseItem[]) => void) => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const updated = attachDistances(currentItems, pos.coords.latitude, pos.coords.longitude)
        cb(updated)
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 120000 },
    )
  }, [])

  const handleAllow = useCallback(() => {
    localStorage.setItem(LOCATION_PREF_KEY, 'allowed')
    setLocationPref('allowed')
    setShowPrompt(false)
    requestLocation(items, onItems)
  }, [items, onItems, requestLocation])

  const handleDecline = useCallback(() => {
    localStorage.setItem(LOCATION_PREF_KEY, 'declined')
    setLocationPref('declined')
    setShowPrompt(false)
  }, [])

  return { showPrompt, locating, locationPref, handleAllow, handleDecline }
}

export default function ShowcasePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params)
  const config = getShowcaseConfig(key)

  const [data, setData] = useState<ShowcaseResponse | null>(null)
  const [items, setItems] = useState<ShowcaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [descriptionsLoaded, setDescriptionsLoaded] = useState(false)

  // Fetch showcase data
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    fetch(apiPath(`/api/showcase/${key}`))
      .then((r) => r.json())
      .then((json: ShowcaseResponse) => {
        if (cancelled) return
        setData(json)
        setItems(json.items ?? [])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) { setError(true); setLoading(false) }
      })

    return () => { cancelled = true }
  }, [key])

  // Load AI descriptions after initial render
  useEffect(() => {
    if (!items.length || descriptionsLoaded) return
    setDescriptionsLoaded(true)

    const descItems = items.slice(0, 10).map((item) => ({
      placeId: item.placeId,
      placeName: item.placeName,
      dishName: item.dishName,
      googleRating: item.googleRating,
    }))

    fetch(apiPath('/api/showcase/describe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: descItems }),
    })
      .then((r) => r.json())
      .then((json: { descriptions?: Record<string, string> }) => {
        if (!json.descriptions) return
        setItems((prev) =>
          prev.map((item) => ({
            ...item,
            aiDescription: json.descriptions![item.placeId] ?? item.aiDescription,
          })),
        )
      })
      .catch(() => {}) // Non-fatal
  }, [items.length, descriptionsLoaded])

  const { showPrompt, locating, handleAllow, handleDecline } = useShowcaseLocation(items, setItems)

  if (!config) {
    return (
      <main className="min-h-screen bg-white px-5 py-16 text-center">
        <p className="text-neutral-500">Showcase not found.</p>
        <Link href={withBasePath('/discover')} className="mt-4 block text-sm underline text-neutral-700">← Back to Showcases</Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f8f7f5] pb-20">

      {/* Hero */}
      <div
        className="relative overflow-hidden px-5 pb-10 pt-10"
        style={{ background: `linear-gradient(160deg, ${config.heroGradientFrom} 0%, ${config.heroGradientTo} 100%)` }}
      >
        {/* Back */}
        <Link
          href={withBasePath('/discover')}
          className="inline-flex items-center gap-1.5 mb-6 text-xs font-medium text-white/60 hover:text-white/90 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Showcases
        </Link>

        {/* Emoji decoration */}
        <div className="absolute right-8 top-8 text-8xl opacity-15 select-none" aria-hidden>
          {config.emoji}
        </div>

        {/* Tagline */}
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/80">
            {config.tagline}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold leading-tight text-white drop-shadow-sm">
          {loading ? `${config.emoji} ${config.title}` : (data?.title ?? `${config.emoji} ${config.title}`)}
        </h1>

        {/* Description */}
        {config.editorialDescription && (
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70">
            {config.editorialDescription}
          </p>
        )}

        {/* Count badge */}
        {!loading && items.length > 0 && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5">
            <span className="text-sm font-bold text-white">{items.length}</span>
            <span className="text-xs text-white/60">curated spots</span>
            {locating && <span className="text-xs text-white/50 animate-pulse">· finding nearby…</span>}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 pt-5 space-y-4">

        {/* Location prompt */}
        {showPrompt && !loading && items.length > 0 && (
          <ShowcaseLocationPrompt onAllow={handleAllow} onDecline={handleDecline} />
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <div
              className="h-8 w-8 animate-spin rounded-full"
              style={{ border: '2px solid #e5e7eb', borderTopColor: '#1f355d' }}
            />
            <p className="text-sm text-neutral-400">Loading showcase…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center">
            <p className="text-sm font-medium text-red-700">Could not load this showcase.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 text-xs underline text-red-500 hover:text-red-700"
            >
              Try again
            </button>
          </div>
        )}

        {/* Insufficient data */}
        {!loading && !error && data?.insufficient && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
            <p className="text-3xl mb-3">{config.emoji}</p>
            <p className="text-sm font-semibold text-neutral-800">Building this showcase</p>
            <p className="mt-1 text-xs text-neutral-500">
              We need a few more community saves before we can publish this showcase.
              Check back soon.
            </p>
            <Link
              href={withBasePath('/discover')}
              className="mt-5 inline-block rounded-full bg-neutral-900 px-5 py-2 text-xs font-semibold text-white"
            >
              View other showcases
            </Link>
          </div>
        )}

        {/* Ranked list */}
        {!loading && !error && items.length > 0 && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 pb-1">
              Ranked list
            </p>
            {items.map((item, idx) => {
              const isNearby = item.distanceKm != null && item.distanceKm < 2
              return (
                <ShowcaseRankCard
                  key={item.placeId}
                  item={item}
                  isNearby={isNearby}
                  animationDelay={idx * 60}
                />
              )
            })}
          </>
        )}

        {/* Empty state — data fetched but no items (not insufficient) */}
        {!loading && !error && !data?.insufficient && items.length === 0 && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
            <p className="text-3xl mb-3">{config.emoji}</p>
            <p className="text-sm text-neutral-600">No places found for this showcase yet.</p>
          </div>
        )}

        {/* Footer attribution */}
        {!loading && items.length > 0 && (
          <div className="pt-4 text-center">
            <p className="text-[11px] text-neutral-400">
              Ranked by Google rating · community saves · and recency.
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Descriptions generated by AI and may be approximate.
            </p>
            <Link
              href={withBasePath('/')}
              className="mt-3 inline-block text-xs font-medium text-neutral-500 underline decoration-dotted hover:text-neutral-800 transition-colors"
            >
              Join Nearby to add your favourite spot →
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
