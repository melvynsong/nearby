'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import ShowcasePhotoMosaic from '@/components/showcase/ShowcasePhotoMosaic'
import ShowcaseLocationPrompt from '@/components/showcase/ShowcaseLocationPrompt'
import { attachDistances, type ShowcaseItem } from '@/lib/showcase-utils'
import { apiPath, withBasePath } from '@/lib/base-path'

const LOCATION_PREF_KEY = 'nearby_showcase_location_pref'
const LOCATION_MODE_KEY = 'nearby_showcase_location_mode'

type LocationPref = 'allowed' | 'declined' | null

type ShowcaseResponse = {
  ok: boolean
  items: ShowcaseItem[]
  title: string
  insufficient?: boolean
  config: {
    key: string
    title: string
    tagline: string
    description?: string
    heroGradientFrom: string
    heroGradientTo: string
    emoji: string
  }
}

function keyToTitle(key: string): string {
  const withoutSuffix = key.replace(/-[a-f0-9]{8}$/, '')
  return withoutSuffix
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
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
  const fallbackTitle = keyToTitle(key)

  const [data, setData] = useState<ShowcaseResponse | null>(null)
  const [items, setItems] = useState<ShowcaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [descriptionsLoaded, setDescriptionsLoaded] = useState(false)
  const [locationModeEnabled, setLocationModeEnabledState] = useState(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCATION_MODE_KEY)
      return stored === 'true'
    }
    return false
  })

  // Persist location mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(LOCATION_MODE_KEY, String(locationModeEnabled))
  }, [locationModeEnabled])

  const setLocationModeEnabled = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setLocationModeEnabledState(value)
  }, [])

  // Fetch showcase data
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setNotFound(false)
    setDescriptionsLoaded(false)

    fetch(apiPath(`/api/showcase/${key}`))
      .then(async (r) => ({ ok: r.ok, status: r.status, json: await r.json() as ShowcaseResponse }))
      .then(({ ok, status, json }) => {
        if (cancelled) return
        if (!ok) {
          if (status === 404) {
            setNotFound(true)
          } else {
            setError(true)
          }
          setLoading(false)
          return
        }
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

  const { showPrompt, locating, locationPref, handleAllow, handleDecline } = useShowcaseLocation(items, setItems)

  const enableLocationMode = useCallback(() => {
    if (locationPref !== 'allowed') {
      handleAllow()
    }
    setLocationModeEnabled(true)
  }, [locationPref, handleAllow, setLocationModeEnabled])

  const disableLocationMode = useCallback(() => {
    setLocationModeEnabled(false)
  }, [setLocationModeEnabled])

  const handleToggleLocationMode = useCallback(() => {
    if (locationModeEnabled) {
      disableLocationMode()
      return
    }
    enableLocationMode()
  }, [locationModeEnabled, disableLocationMode, enableLocationMode])

  if (notFound) {
    return (
      <main className="min-h-screen bg-white px-5 py-16 text-center">
        <p className="text-neutral-500">Showcase not found.</p>
        <Link href={withBasePath('/showcase')} className="mt-4 block text-sm underline text-neutral-700">← Back to Showcases</Link>
      </main>
    )
  }

  const config = data?.config
  const heroGradientFrom = config?.heroGradientFrom ?? '#1f355d'
  const heroGradientTo = config?.heroGradientTo ?? '#0f3b58'
  const heroEmoji = config?.emoji ?? '🍽️'
  const heroTagline = config?.tagline ?? 'Top category by additions'
  const heroDescription = config?.description
  const heroTitle = loading ? `${heroEmoji} ${fallbackTitle || 'Showcase'}` : (data?.title ?? `${heroEmoji} ${fallbackTitle || 'Showcase'}`)

  return (
    <main className="min-h-screen bg-[#f8f7f5] pb-20">

      {/* Hero */}
      <div
        className="relative overflow-hidden px-5 pb-10 pt-10"
        style={{ background: `linear-gradient(160deg, ${heroGradientFrom} 0%, ${heroGradientTo} 100%)` }}
      >
        {/* Back */}
        <Link
          href={withBasePath('/showcase')}
          className="inline-flex items-center gap-1.5 mb-6 text-xs font-medium text-white/60 hover:text-white/90 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Showcases
        </Link>

        {/* Emoji decoration */}
        <div className="absolute right-8 top-8 text-8xl opacity-15 select-none" aria-hidden>
          {heroEmoji}
        </div>

        {/* Tagline */}
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/80">
            {heroTagline}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold leading-tight text-white drop-shadow-sm">
          {heroTitle}
        </h1>

        {/* Description */}
        {heroDescription && (
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70">
            {heroDescription}
          </p>
        )}

        {/* Count badge + Location toggle */}
        {!loading && items.length > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5">
              <span className="text-sm font-bold text-white">{items.length}</span>
              <span className="text-xs text-white/60">curated spots</span>
              {locating && <span className="text-xs text-white/50 animate-pulse">· finding nearby…</span>}
            </div>

            {/* Location awareness toggle */}
            <button
              onClick={handleToggleLocationMode}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                locationModeEnabled
                  ? 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
                  : 'bg-white/10 text-white/70 border border-white/10 hover:bg-white/15'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              {locationModeEnabled ? 'Location On' : 'Location Off'}
            </button>
          </div>
        )}
      </div>

      {/* Padded content area */}
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
            <p className="text-3xl mb-3">{heroEmoji}</p>
            <p className="text-sm font-semibold text-neutral-800">Building this showcase</p>
            <p className="mt-1 text-xs text-neutral-500">
              We need a few more community saves before we can publish this showcase.
              Check back soon.
            </p>
            <Link
              href={withBasePath('/showcase')}
              className="mt-5 inline-block rounded-full bg-neutral-900 px-5 py-2 text-xs font-semibold text-white"
            >
              View other showcases
            </Link>
          </div>
        )}

        {/* Empty state — data fetched but no items (not insufficient) */}
        {!loading && !error && !data?.insufficient && items.length === 0 && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
            <p className="text-3xl mb-3">{heroEmoji}</p>
            <p className="text-sm text-neutral-600">No places found for this showcase yet.</p>
          </div>
        )}
      </div>

      {/* Full-width photo mosaic collage */}
      {!loading && !error && items.length > 0 && (
        <ShowcasePhotoMosaic items={items} locationMode={locationModeEnabled} />
      )}

      {/* Premium floating location overlay */}
      {!loading && !error && items.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[min(94vw,640px)] -translate-x-1/2 px-1">
          <div className="rounded-2xl border border-white/40 bg-white/70 px-3 py-3 shadow-[0_12px_40px_rgba(10,20,40,0.18)] backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Display Mode</p>
                <p className="text-xs text-neutral-700">
                  {locationModeEnabled
                    ? 'Closest places become larger tiles.'
                    : 'Top-rated places stay larger by rating rank.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={enableLocationMode}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    locationModeEnabled
                      ? 'bg-[#1f355d] text-white'
                      : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  Use Location
                </button>
                <button
                  onClick={disableLocationMode}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    !locationModeEnabled
                      ? 'bg-[#1f355d] text-white'
                      : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  Use Ratings
                </button>
              </div>
            </div>
            {locating && (
              <p className="mt-2 text-[11px] text-neutral-500">Finding your location...</p>
            )}
          </div>
        </div>
      )}

      {/* Footer attribution */}
      {!loading && items.length > 0 && (
        <div className="px-5 pt-5 pb-28 text-center">
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
    </main>
  )
}
