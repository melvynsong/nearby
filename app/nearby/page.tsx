'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

type Session = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

type Rec = {
  note: string | null
  member_name: string
  created_at: string
}

type PlaceCard = {
  place_id: string
  name: string
  formatted_address: string | null
  lat: number | null
  lng: number | null
  photo_urls: string[]
  recommendations: Rec[]
  newest_at: string
  distanceKm: number | null
}

type GalleryState = {
  photos: string[]
  index: number
} | null

// idle    → permission prompt not yet shown (show CTA)
// locating → getCurrentPosition in flight
// resolved → coords + optional area name available
// fallback → geolocation unavailable/timed out (not user-denied)
// denied  → user explicitly denied permission
type LocationStatus = 'idle' | 'locating' | 'resolved' | 'fallback' | 'denied'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`
}

function buildWhatsAppMessage(place: PlaceCard): string {
  const lines: string[] = []
  lines.push(`*${place.name}*`)
  if (place.formatted_address) lines.push(place.formatted_address)
  lines.push('')
  lines.push('Why go:')
  place.recommendations.slice(0, 3).forEach((r) => {
    if (r.note) lines.push(`• ${r.note}`)
  })
  lines.push('')
  const initials = [...new Set(place.recommendations.map((r) => getInitials(r.member_name)))]
  lines.push(`Saved by: ${initials.join(' · ')}`)
  lines.push('')
  lines.push('Shared from Nearby')
  return lines.join('\n')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NearbyHome() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [places, setPlaces] = useState<PlaceCard[]>([])
  const [placesLoading, setPlacesLoading] = useState(true)
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle')
  const [areaName, setAreaName] = useState<string | null>(null)
  const [gallery, setGallery] = useState<GalleryState>(null)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())

  // ── Places fetch — always runs independently of location ──────────────────────
  const fetchPlaces = useCallback(async (groupId: string) => {
    console.log('[Places] fetch start, groupId:', groupId)
    setPlacesLoading(true)

    // Hard 12s timeout so a hung Supabase connection never blocks the UI
    const controller = new AbortController()
    const timer = setTimeout(() => {
      console.warn('[Places] fetch timed out after 12s')
      controller.abort()
    }, 12000)

    try {
      const { data, error } = await supabase
        .from('recommendations')
        .select(`
          note,
          created_at,
          place_id,
          places ( name, formatted_address, lat, lng, photo_urls ),
          members ( display_name )
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal)

      if (error) {
        console.error('[Places] fetch error:', error.message)
        return
      }

      console.log('[Places] fetch success, rows:', data?.length ?? 0)

      const map = new Map<string, PlaceCard>()
      for (const r of (data ?? []) as any[]) {
        const pid: string = r.place_id
        if (!map.has(pid)) {
          map.set(pid, {
            place_id: pid,
            name: r.places?.name ?? 'Unknown place',
            formatted_address: r.places?.formatted_address ?? null,
            lat: r.places?.lat ?? null,
            lng: r.places?.lng ?? null,
            photo_urls: r.places?.photo_urls ?? [],
            recommendations: [],
            newest_at: r.created_at,
            distanceKm: null,
          })
        }
        map.get(pid)!.recommendations.push({
          note: r.note,
          member_name: r.members?.display_name ?? '??',
          created_at: r.created_at,
        })
      }

      setPlaces([...map.values()])
    } finally {
      clearTimeout(timer)
      setPlacesLoading(false)
    }
  }, [])

  // ── Reverse geocode — best-effort, never blocks anything ─────────────────────
  const resolveAreaName = useCallback(async (coords: { lat: number; lng: number }) => {
    console.log('[Location] reverse geocode start')
    try {
      const res = await fetch('/api/location/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json()
      const label: string | null = data.locationLabel ?? null
      console.log('[Location] reverse geocode result:', label)
      setAreaName(label)
    } catch (err: any) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : err?.message
      console.warn('[Location] reverse geocode failed:', reason)
      setAreaName(null)
    }
  }, [])

  // ── Geolocation ───────────────────────────────────────────────────────────────
  const resolveLocation = useCallback(() => {
    if (!navigator.geolocation) {
      console.warn('[Location] geolocation not supported')
      setLocationStatus('denied')
      return
    }

    console.log('[Location] geolocation start')
    setLocationStatus('locating')
    setAreaName(null)

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        console.log('[Location] geolocation success, coords rounded:',
          Math.round(coords.lat * 100) / 100,
          Math.round(coords.lng * 100) / 100,
        )
        setUserCoords(coords)
        setLocationStatus('resolved')
        await resolveAreaName(coords)
      },
      (err) => {
        const reasons: Record<number, string> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' }
        console.warn('[Location] geolocation failed, code:', err.code, reasons[err.code] ?? 'unknown')
        if (err.code === 1) {
          setLocationStatus('denied')
        } else {
          // Codes 2/3: unavailable or timed out (e.g. VPN) — show fallback, don't block
          setLocationStatus('fallback')
        }
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
    )
  }, [resolveAreaName])

  // Check permission on mount — auto-resolve if already granted
  useEffect(() => {
    if (!navigator.geolocation) { setLocationStatus('denied'); return }
    if (!navigator.permissions) { resolveLocation(); return }
    navigator.permissions.query({ name: 'geolocation' }).then((result) => {
      console.log('[Location] permission state:', result.state)
      if (result.state === 'granted') resolveLocation()
      else if (result.state === 'denied') setLocationStatus('denied')
      // 'prompt' → stay idle, show CTA
    }).catch(() => resolveLocation())
  }, [resolveLocation])

  // ── Session + fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem('nearby_session')
    if (!raw) { router.replace('/'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)
    fetchPlaces(s.groupId)
  }, [router, fetchPlaces])

  // ── Sort — recalculate when coords arrive ─────────────────────────────────────
  const sortedPlaces = useCallback((): PlaceCard[] => {
    return [...places]
      .map((p) => ({
        ...p,
        distanceKm:
          userCoords && p.lat != null && p.lng != null
            ? haversineDistanceKm(userCoords.lat, userCoords.lng, p.lat, p.lng)
            : null,
      }))
      .sort((a, b) => {
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
        return new Date(b.newest_at).getTime() - new Date(a.newest_at).getTime()
      })
  }, [places, userCoords])

  // ── Subtitle logic ────────────────────────────────────────────────────────────
  function locationSubtitle(): { text: string; tappable: boolean } {
    switch (locationStatus) {
      case 'locating':
        return { text: 'Finding food spots near you…', tappable: false }
      case 'resolved':
        if (areaName) return { text: `You are currently near ${areaName}`, tappable: true }
        return { text: 'Showing trusted spots from your circle', tappable: true }
      case 'fallback':
        return { text: 'Showing trusted spots from your circle', tappable: true }
      case 'denied':
        return { text: 'Location is off. Turn it on in browser settings for better results.', tappable: false }
      case 'idle':
      default:
        return { text: 'Enable location to sort spots near you', tappable: false }
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('nearby_session')
    router.push('/')
  }

  const toggleNotes = (placeId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev)
      next.has(placeId) ? next.delete(placeId) : next.add(placeId)
      return next
    })
  }

  const openGallery = (photos: string[], index: number) => setGallery({ photos, index })
  const closeGallery = () => setGallery(null)
  const prevPhoto = () => setGallery((g) => g && { ...g, index: (g.index - 1 + g.photos.length) % g.photos.length })
  const nextPhoto = () => setGallery((g) => g && { ...g, index: (g.index + 1) % g.photos.length })

  const shareOnWhatsApp = (place: PlaceCard) => {
    const text = encodeURIComponent(buildWhatsAppMessage(place))
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  if (!session) return null

  const displayed = sortedPlaces()
  const subtitle = locationSubtitle()
  const isLocating = locationStatus === 'locating'

  return (
    <main className="min-h-screen bg-neutral-50 pb-24">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-8 pb-4 max-w-md mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Nearby</h1>
            <p className="mt-0.5 text-sm text-neutral-500">Trusted food spots from your circle</p>
          </div>
          <div className="flex flex-col items-end gap-1 pt-1">
            <p className="text-xs text-neutral-500">{session.memberName} · {session.groupName}</p>
            <button onClick={handleLogout} className="text-xs text-neutral-400 underline">
              Logout
            </button>
          </div>
        </div>

        {/* ── Location subtitle ──────────────────────────────────────────────── */}
        <div className="mt-4">
          {/* Idle: show CTA button */}
          {locationStatus === 'idle' && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-neutral-400">{subtitle.text}</p>
              <button
                onClick={resolveLocation}
                className="shrink-0 text-xs text-neutral-600 border border-neutral-300 rounded-full px-3 py-1 hover:bg-neutral-100 transition-colors"
              >
                Enable
              </button>
            </div>
          )}

          {/* Denied: nudge toward settings */}
          {locationStatus === 'denied' && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-neutral-400">{subtitle.text}</p>
              <button
                onClick={resolveLocation}
                className="shrink-0 text-xs text-neutral-600 border border-neutral-300 rounded-full px-3 py-1 hover:bg-neutral-100 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {/* Locating: non-interactive */}
          {locationStatus === 'locating' && (
            <p className="text-xs text-neutral-400">{subtitle.text}</p>
          )}

          {/* Resolved or fallback: tappable refresh line */}
          {(locationStatus === 'resolved' || locationStatus === 'fallback') && (
            <button
              onClick={resolveLocation}
              disabled={isLocating}
              className="flex items-center gap-1.5 text-left group disabled:opacity-50"
            >
              <span className="text-xs text-neutral-400 group-hover:text-neutral-600 transition-colors">
                {subtitle.text}
              </span>
              <span className="text-neutral-300 group-hover:text-neutral-500 transition-colors text-xs" aria-hidden>
                ↻
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="px-5 max-w-md mx-auto space-y-4">
        {placesLoading ? (
          <p className="text-sm text-neutral-400 text-center py-20">Loading…</p>
        ) : displayed.length === 0 ? (
          <div className="rounded-2xl bg-white border border-neutral-200 p-8 text-center shadow-sm mt-4">
            <p className="text-lg font-semibold text-neutral-900">No places yet</p>
            <p className="mt-2 text-sm text-neutral-500">Start saving your favourite food spots</p>
            <button
              onClick={() => router.push('/add-place')}
              className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
            >
              Add first place
            </button>
          </div>
        ) : (
          displayed.map((place) => {
            const notes = place.recommendations.filter((r) => r.note)
            const initials = [...new Set(place.recommendations.map((r) => getInitials(r.member_name)))]
            const expanded = expandedNotes.has(place.place_id)
            const visibleNotes = expanded ? notes : notes.slice(0, 2)
            const extraNotes = notes.length - 2

            return (
              <div
                key={place.place_id}
                className="rounded-2xl bg-white border border-neutral-200 overflow-hidden shadow-sm"
              >
                {/* Photo */}
                {place.photo_urls.length > 0 && (
                  <div
                    className="relative cursor-pointer"
                    onClick={() => openGallery(place.photo_urls, 0)}
                  >
                    <img
                      src={place.photo_urls[0]}
                      alt={place.name}
                      className="w-full aspect-video object-cover"
                    />
                    {place.photo_urls.length > 1 && (
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                        +{place.photo_urls.length - 1} photos
                      </span>
                    )}
                  </div>
                )}

                {/* Body */}
                <div className="p-4 space-y-3">
                  {/* Name + distance */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-semibold text-neutral-900 leading-snug">
                      {place.name}
                    </p>
                    {place.distanceKm != null && (
                      <span className="shrink-0 text-xs text-neutral-400 mt-0.5">
                        {formatDistance(place.distanceKm)}
                      </span>
                    )}
                  </div>

                  {/* Notes */}
                  {visibleNotes.length > 0 && (
                    <ul className="space-y-1">
                      {visibleNotes.map((r, i) => (
                        <li key={i} className="text-sm text-neutral-600 leading-snug">
                          · {r.note}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!expanded && extraNotes > 0 && (
                    <button
                      onClick={() => toggleNotes(place.place_id)}
                      className="text-xs text-neutral-400 underline"
                    >
                      +{extraNotes} more note{extraNotes > 1 ? 's' : ''}
                    </button>
                  )}

                  {/* Initials + share */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex gap-1 flex-wrap">
                      {initials.map((ini) => (
                        <span
                          key={ini}
                          className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
                        >
                          {ini}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => shareOnWhatsApp(place)}
                      className="text-xs text-green-700 border border-green-200 rounded-full px-3 py-1 bg-green-50 hover:bg-green-100 transition-colors"
                    >
                      Share
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Floating add button ──────────────────────────────────────────────── */}
      <button
        onClick={() => router.push('/add-place')}
        className="fixed bottom-6 right-6 rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-lg"
      >
        + Add
      </button>

      {/* ── Photo gallery modal ──────────────────────────────────────────────── */}
      {gallery && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeGallery}
        >
          <button
            className="absolute top-4 right-4 text-white text-2xl leading-none"
            onClick={closeGallery}
          >
            ×
          </button>

          {gallery.photos.length > 1 && (
            <button
              className="absolute left-4 text-white text-3xl px-2"
              onClick={(e) => { e.stopPropagation(); prevPhoto() }}
            >
              ‹
            </button>
          )}

          <img
            src={gallery.photos[gallery.index]}
            alt="gallery"
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {gallery.photos.length > 1 && (
            <button
              className="absolute right-4 text-white text-3xl px-2"
              onClick={(e) => { e.stopPropagation(); nextPhoto() }}
            >
              ›
            </button>
          )}

          {gallery.photos.length > 1 && (
            <p className="absolute bottom-4 text-xs text-white/60">
              {gallery.index + 1} / {gallery.photos.length}
            </p>
          )}
        </div>
      )}
    </main>
  )
}
