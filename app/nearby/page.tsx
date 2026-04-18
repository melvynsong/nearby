'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { haversineDistanceKm, formatDistance, getInitials } from '@/lib/nearby-helpers'
import CreateGroupModal, { type GroupEntry as ModalGroupEntry } from '@/components/CreateGroupModal'
import AppHeader from '@/components/AppHeader'

// ── Types ──────────────────────────────────────────────────────────────────────

type GroupEntry = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

type Session = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
  allGroups?: GroupEntry[]
}

type Rec = {
  note: string | null
  member_name: string
  created_at: string
}

type Category = {
  id: string
  name: string
}

type PlaceCard = {
  place_id: string
  name: string
  formatted_address: string | null
  lat: number | null
  lng: number | null
  photo_urls: string[]
  recommendations: Rec[]
  categories: Category[]
  newest_at: string
  distanceKm: number | null
}

type GalleryState = { photos: string[]; index: number } | null

type LocationStatus = 'idle' | 'locating' | 'resolved' | 'fallback' | 'denied'

// ── Component ─────────────────────────────────────────────────────────────────

export default function NearbyHome() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)

  // Active group (may differ from session.groupId if user switches)
  const [activeGroup, setActiveGroup] = useState<GroupEntry | null>(null)

  // Places
  const [places, setPlaces] = useState<PlaceCard[]>([])
  const [placesLoading, setPlacesLoading] = useState(true)

  // Category filter
  const [groupCategories, setGroupCategories] = useState<Category[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  // Location
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle')
  const [areaName, setAreaName] = useState<string | null>(null)

  // UI
  const [gallery, setGallery] = useState<GalleryState>(null)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [showGroupMenu, setShowGroupMenu] = useState(false)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)

  // ── Data fetching ─────────────────────────────────────────────────────────────

  const fetchCategories = useCallback(async (groupId: string) => {
    const { data } = await supabase
      .from('food_categories')
      .select('id, name')
      .eq('group_id', groupId)
      .order('name')
    setGroupCategories(data ?? [])
  }, [])

  const fetchPlaces = useCallback(async (groupId: string) => {
    console.log('[Places] fetch start, groupId:', groupId)
    setPlacesLoading(true)

    const controller = new AbortController()
    const timer = setTimeout(() => { console.warn('[Places] fetch timed out'); controller.abort() }, 12000)

    try {
      const { data, error } = await supabase
        .from('recommendations')
        .select(`
          note,
          created_at,
          place_id,
          places ( name, formatted_address, lat, lng, photo_urls, place_categories ( food_categories ( id, name ) ) ),
          members ( display_name )
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal)

      if (error) { console.error('[Places] fetch error:', error.message); return }

      const map = new Map<string, PlaceCard>()
      for (const r of (data ?? []) as any[]) {
        const pid: string = r.place_id
        if (!map.has(pid)) {
          const cats: Category[] = (r.places?.place_categories ?? [])
            .map((pc: any) => pc.food_categories)
            .filter(Boolean)

          map.set(pid, {
            place_id: pid,
            name: r.places?.name ?? 'Unknown place',
            formatted_address: r.places?.formatted_address ?? null,
            lat: r.places?.lat ?? null,
            lng: r.places?.lng ?? null,
            photo_urls: r.places?.photo_urls ?? [],
            recommendations: [],
            categories: cats,
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

      console.log('[Places] fetch success, places:', map.size)
      setPlaces([...map.values()])
    } finally {
      clearTimeout(timer)
      setPlacesLoading(false)
    }
  }, [])

  // ── Session init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const raw = localStorage.getItem('nearby_session')
    if (!raw) { router.replace('/'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)
    const initial: GroupEntry = { memberId: s.memberId, memberName: s.memberName, groupId: s.groupId, groupName: s.groupName }
    setActiveGroup(initial)
    fetchPlaces(s.groupId)
    fetchCategories(s.groupId)
  }, [router, fetchPlaces, fetchCategories])

  // ── Group switching ───────────────────────────────────────────────────────────

  const switchGroup = (entry: GroupEntry) => {
    const nextSession = session
      ? {
          ...session,
          memberId: entry.memberId,
          memberName: entry.memberName,
          groupId: entry.groupId,
          groupName: entry.groupName,
        }
      : null

    if (nextSession) {
      setSession(nextSession)
      localStorage.setItem('nearby_session', JSON.stringify(nextSession))
    }

    setActiveGroup(entry)
    setShowGroupMenu(false)
    setSelectedCategoryId(null)
    setPlaces([])
    fetchPlaces(entry.groupId)
    fetchCategories(entry.groupId)
  }

  const handleGroupCreated = (entry: ModalGroupEntry) => {
    const allGroups = session?.allGroups ?? []
    const hasGroup = allGroups.some((group) => group.groupId === entry.groupId)
    const nextGroups = hasGroup ? allGroups : [...allGroups, entry]

    const nextSession = session
      ? {
          ...session,
          memberId: entry.memberId,
          memberName: entry.memberName,
          groupId: entry.groupId,
          groupName: entry.groupName,
          allGroups: nextGroups,
        }
      : null

    if (nextSession) {
      setSession(nextSession)
      localStorage.setItem('nearby_session', JSON.stringify(nextSession))
    }

    setShowCreateGroupModal(false)
    setShowGroupMenu(false)
    setActiveGroup(entry)
    setSelectedCategoryId(null)
    setPlaces([])
    fetchPlaces(entry.groupId)
    fetchCategories(entry.groupId)
  }

  // ── Location ──────────────────────────────────────────────────────────────────

  const resolveAreaName = useCallback(async (coords: { lat: number; lng: number }) => {
    try {
      const res = await fetch('/api/location/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json()
      console.log('[Location] reverse geocode result:', data.locationLabel, '| status:', data._apiStatus)
      setAreaName(data.locationLabel ?? null)
    } catch {
      setAreaName(null)
    }
  }, [])

  const resolveLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationStatus('denied'); return }
    setLocationStatus('locating')
    setAreaName(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserCoords(coords)
        setLocationStatus('resolved')
        await resolveAreaName(coords)
      },
      (err) => {
        setLocationStatus(err.code === 1 ? 'denied' : 'fallback')
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
    )
  }, [resolveAreaName])

  useEffect(() => {
    if (!navigator.geolocation) { setLocationStatus('denied'); return }
    if (!navigator.permissions) { resolveLocation(); return }
    navigator.permissions.query({ name: 'geolocation' }).then((result) => {
      if (result.state === 'granted') resolveLocation()
      else if (result.state === 'denied') setLocationStatus('denied')
    }).catch(() => resolveLocation())
  }, [resolveLocation])

  // ── Sort + filter ─────────────────────────────────────────────────────────────

  const displayedPlaces = useCallback((): PlaceCard[] => {
    let list = [...places].map((p) => ({
      ...p,
      distanceKm:
        userCoords && p.lat != null && p.lng != null
          ? haversineDistanceKm(userCoords.lat, userCoords.lng, p.lat, p.lng)
          : null,
    }))

    if (selectedCategoryId) {
      list = list.filter((p) => p.categories.some((c) => c.id === selectedCategoryId))
    }

    return list.sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
      return new Date(b.newest_at).getTime() - new Date(a.newest_at).getTime()
    })
  }, [places, userCoords, selectedCategoryId])

  // ── Location subtitle ─────────────────────────────────────────────────────────

  function locationSubtitle(): { text: string; tappable: boolean } {
    switch (locationStatus) {
      case 'locating': return { text: 'Finding food spots near you…', tappable: false }
      case 'resolved': return {
        text: areaName ? `You are currently near ${areaName}` : 'Showing trusted spots from your circle',
        tappable: true,
      }
      case 'fallback': return { text: 'Showing trusted spots from your circle', tappable: true }
      case 'denied': return { text: 'Location is off. Turn it on in browser settings for better results.', tappable: false }
      default: return { text: 'Enable location to sort spots near you', tappable: false }
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleLogout = () => { localStorage.removeItem('nearby_session'); router.push('/') }
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
  const openDirections = (place: PlaceCard) => {
    const destination =
      place.lat != null && place.lng != null
        ? `${place.lat},${place.lng}`
        : encodeURIComponent(place.formatted_address ?? place.name)

    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_blank')
  }

  if (!session || !activeGroup) return null

  const displayed = displayedPlaces()
  const subtitle = locationSubtitle()
  const allGroups = session.allGroups ?? []

  return (
    <main className="min-h-screen bg-[#f8f8f6] pb-24">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <AppHeader
        right={
          <div className="flex flex-col items-end gap-0.5">
            <p className="text-xs font-medium text-neutral-700 leading-none">{session.memberName}</p>
            <button onClick={handleLogout} className="text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors">
              Logout
            </button>
          </div>
        }
      />

      <div className="px-5 pt-5 pb-3 max-w-md mx-auto">
        <div className="relative">
          <button
            onClick={() => setShowGroupMenu((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 shadow-sm"
          >
            <span>{activeGroup.groupName}</span>
            <span className="text-neutral-400">▾</span>
          </button>

          {showGroupMenu && (
            <div className="absolute z-20 mt-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg transition-all duration-200">
              <div className="max-h-60 overflow-auto py-1">
                {allGroups.map((g) => (
                  <button
                    key={g.groupId}
                    onClick={() => switchGroup(g)}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                      activeGroup.groupId === g.groupId
                        ? 'bg-teal-50 text-teal-700 font-medium'
                        : 'text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {g.groupName}
                  </button>
                ))}
              </div>

              <div className="border-t border-neutral-100 p-1">
                <button
                  onClick={() => {
                    setShowGroupMenu(false)
                    setShowCreateGroupModal(true)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-teal-700 hover:bg-teal-50 transition-colors font-medium"
                >
                  + Create new group
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Location line */}
        <div className="mt-3">
          {locationStatus === 'locating' && (
            <p className="text-xs text-neutral-400">{subtitle.text}</p>
          )}
          {(locationStatus === 'resolved' || locationStatus === 'fallback') && (
            <button onClick={resolveLocation} className="flex items-center gap-1.5 text-left group">
              <span className="text-xs text-neutral-400 group-hover:text-neutral-600 transition-colors">{subtitle.text}</span>
              <span className="text-neutral-300 group-hover:text-neutral-500 text-xs">↻</span>
            </button>
          )}
          {locationStatus === 'idle' && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-neutral-400">{subtitle.text}</p>
              <button onClick={resolveLocation} className="shrink-0 text-xs text-teal-700 border border-teal-200 rounded-full px-3 py-1 hover:bg-teal-50 transition-colors">Enable</button>
            </div>
          )}
          {locationStatus === 'denied' && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-neutral-400">{subtitle.text}</p>
              <button onClick={resolveLocation} className="shrink-0 text-xs text-teal-700 border border-teal-200 rounded-full px-3 py-1 hover:bg-teal-50 transition-colors">Try again</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Category filter ──────────────────────────────────────────────────── */}
      {groupCategories.length > 0 && (
        <div className="px-5 max-w-md mx-auto mb-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                !selectedCategoryId ? 'bg-teal-700 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              All
            </button>
            {groupCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId((prev) => prev === cat.id ? null : cat.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategoryId === cat.id ? 'bg-teal-700 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Place list ───────────────────────────────────────────────────────── */}
      <div className="px-5 max-w-md mx-auto space-y-4">
        {placesLoading ? (
          <p className="text-sm text-neutral-400 text-center py-20">Loading…</p>
        ) : displayed.length === 0 ? (
          <div className="rounded-2xl bg-white border border-neutral-200 p-8 text-center shadow-sm mt-4">
            <p className="text-lg font-semibold text-neutral-900">
              {selectedCategoryId ? 'No places in this category' : 'No places yet'}
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              {selectedCategoryId ? 'Try a different filter or add a place.' : 'Start saving your favourite food spots'}
            </p>
            <button
              onClick={() => router.push('/add-place')}
              className="mt-6 w-full rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-3 text-sm font-semibold text-white transition-colors"
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
              <div key={place.place_id} className="rounded-2xl bg-white border border-neutral-200 overflow-hidden shadow-sm">

                {/* Photo */}
                {place.photo_urls.length > 0 && (
                  <div className="relative cursor-pointer" onClick={() => openGallery(place.photo_urls, 0)}>
                    <img src={place.photo_urls[0]} alt={place.name} className="w-full aspect-video object-cover" />
                    {place.photo_urls.length > 1 && (
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                        +{place.photo_urls.length - 1} photos
                      </span>
                    )}
                  </div>
                )}

                <div className="p-4 space-y-3">
                  {/* Name + distance */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-semibold text-neutral-900 leading-snug">{place.name}</p>
                    {place.distanceKm != null && (
                      <span className="shrink-0 text-xs text-neutral-400 mt-0.5">{formatDistance(place.distanceKm)}</span>
                    )}
                  </div>

                  {/* Category badge */}
                  {place.categories.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {place.categories.map((c) => (
                        <span key={c.id} className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-700">
                          {c.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {visibleNotes.length > 0 && (
                    <ul className="space-y-1">
                      {visibleNotes.map((r, i) => (
                        <li key={i} className="text-sm text-neutral-600 leading-snug">· {r.note}</li>
                      ))}
                    </ul>
                  )}
                  {!expanded && extraNotes > 0 && (
                    <button onClick={() => toggleNotes(place.place_id)} className="text-xs text-neutral-400 underline">
                      +{extraNotes} more note{extraNotes > 1 ? 's' : ''}
                    </button>
                  )}

                  {/* Initials */}
                  <div className="flex gap-1 flex-wrap">
                    {initials.map((ini) => (
                      <span key={ini} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">{ini}</span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      onClick={() => openDirections(place)}
                      className="text-xs text-blue-700 border border-blue-200 rounded-full px-3 py-1 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      Directions
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
        className="fixed bottom-6 right-5 rounded-full bg-teal-700 hover:bg-teal-800 active:bg-teal-900 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors"
      >
        + Add
      </button>

      {/* ── Gallery modal ────────────────────────────────────────────────────── */}
      {gallery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={closeGallery}>
          <button className="absolute top-4 right-4 text-white text-2xl leading-none" onClick={closeGallery}>×</button>
          {gallery.photos.length > 1 && (
            <button className="absolute left-4 text-white text-3xl px-2" onClick={(e) => { e.stopPropagation(); prevPhoto() }}>‹</button>
          )}
          <img
            src={gallery.photos[gallery.index]}
            alt="gallery"
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {gallery.photos.length > 1 && (
            <button className="absolute right-4 text-white text-3xl px-2" onClick={(e) => { e.stopPropagation(); nextPhoto() }}>›</button>
          )}
          {gallery.photos.length > 1 && (
            <p className="absolute bottom-4 text-xs text-white/60">{gallery.index + 1} / {gallery.photos.length}</p>
          )}
        </div>
      )}

      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        sessionMemberId={session.memberId}
        fallbackMemberName={session.memberName}
        onGroupCreated={handleGroupCreated}
      />
    </main>
  )
}
