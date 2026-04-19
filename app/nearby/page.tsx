'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TransformedImage from '@/components/TransformedImage'
import { apiPath } from '@/lib/base-path'
import { haversineDistanceKm, formatDistance, getInitials } from '@/lib/nearby-helpers'
import CreateGroupModal, { type GroupEntry as ModalGroupEntry } from '@/components/CreateGroupModal'
import AppHeader from '@/components/AppHeader'
import ErrorState from '@/components/ErrorState'
import { readTransformFromMap, type TransformMap } from '@/lib/image-transform'
import { withBasePath } from '@/lib/base-path'

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
  member_id: string
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
  image_transforms: TransformMap
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
  const [placesError, setPlacesError] = useState(false)

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
  const [hiddenSectionExpanded, setHiddenSectionExpanded] = useState(false)
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState('')
  const [visibilityBusyGroupId, setVisibilityBusyGroupId] = useState<string | null>(null)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [deletePlaceTarget, setDeletePlaceTarget] = useState<PlaceCard | null>(null)
  const [deletingPlace, setDeletingPlace] = useState(false)
  const [deletePlaceError, setDeletePlaceError] = useState('')

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
    setPlacesError(false)

    const controller = new AbortController()
    const timer = setTimeout(() => { console.warn('[Places] fetch timed out'); controller.abort() }, 12000)

    try {
      const preferredQuery = await supabase
        .from('recommendations')
        .select(`
          note,
          created_at,
          place_id,
          member_id,
          places ( name, formatted_address, lat, lng, photo_urls, image_transforms, place_categories ( food_categories ( id, name ) ) ),
          members ( id, display_name )
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal)

      let data: any[] | null = preferredQuery.data as any[] | null
      let error: { code?: string; message?: string } | null = preferredQuery.error as { code?: string; message?: string } | null

      // Backward compatibility for databases where image_transforms column was not migrated yet.
      if (error && error.code === '42703') {
        const fallbackQuery = await supabase
          .from('recommendations')
          .select(`
            note,
            created_at,
            place_id,
            member_id,
            places ( name, formatted_address, lat, lng, photo_urls, place_categories ( food_categories ( id, name ) ) ),
            members ( id, display_name )
          `)
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal)

        data = fallbackQuery.data as any[] | null
        error = fallbackQuery.error as { code?: string; message?: string } | null
      }

      if (error) {
        console.error('[Nearby][API] Places fetch failed:', error)
        setPlacesError(true)
        return
      }

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
            image_transforms: (r.places?.image_transforms as TransformMap | null) ?? {},
            recommendations: [],
            categories: cats,
            newest_at: r.created_at,
            distanceKm: null,
          })
        }
        map.get(pid)!.recommendations.push({
          note: r.note,
          member_name: r.members?.display_name ?? '??',
          member_id: (r.members?.id ?? r.member_id ?? '') as string,
          created_at: r.created_at,
        })
      }

      console.log('[Places] fetch success, places:', map.size)
      setPlaces([...map.values()])
    } catch (error) {
      console.error('[Nearby][API] Places fetch crashed:', error)
      setPlacesError(true)
    } finally {
      clearTimeout(timer)
      setPlacesLoading(false)
    }
  }, [])

  const loadHiddenGroupIds = useCallback(async (userId: string) => {
    if (!userId) return
    try {
      const response = await fetch(apiPath('/api/groups/preferences'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'list', requesterUserId: userId }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) return
      setHiddenGroupIds(new Set(((result.hiddenGroupIds ?? []) as string[]).filter(Boolean)))
    } catch (error) {
      console.warn('[Nearby][GroupVisibility] Failed to load hidden groups:', error)
    }
  }, [])

  const setGroupVisibility = useCallback(async (groupId: string, isHidden: boolean) => {
    if (!currentUserId || !groupId) return

    setVisibilityBusyGroupId(groupId)
    setHiddenGroupIds((prev) => {
      const next = new Set(prev)
      if (isHidden) next.add(groupId)
      else next.delete(groupId)
      return next
    })

    try {
      const response = await fetch(apiPath('/api/groups/preferences'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'set',
          requesterUserId: currentUserId,
          groupId,
          isHidden,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) {
        throw new Error(result?.message ?? 'Could not update visibility.')
      }

      console.log('[GroupSwitcher]', {
        current_group_id: activeGroup?.groupId ?? null,
        action: isHidden ? 'hide' : 'unhide',
      })
    } catch (error) {
      console.error('[Nearby][GroupVisibility] Update failed:', error)
      setHiddenGroupIds((prev) => {
        const next = new Set(prev)
        if (isHidden) next.delete(groupId)
        else next.add(groupId)
        return next
      })
    } finally {
      setVisibilityBusyGroupId(null)
    }
  }, [currentUserId, activeGroup?.groupId])

  // ── Session init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const raw = localStorage.getItem('nearby_session')
    if (!raw) { router.replace(withBasePath('/')); return }
    const s: Session = JSON.parse(raw)
    const rawRegister = localStorage.getItem('nearby_register')
    const registerUserId = rawRegister
      ? (() => {
          try {
            const parsed = JSON.parse(rawRegister) as { userId?: string }
            return parsed.userId ?? ''
          } catch {
            return ''
          }
        })()
      : ''

    if (registerUserId) {
      setCurrentUserId(registerUserId)
      void loadHiddenGroupIds(registerUserId)
    } else {
      void (async () => {
        try {
          const result = await supabase
            .from('members')
            .select('user_id')
            .eq('id', s.memberId)
            .maybeSingle()

          const fallbackUserId = result.data?.user_id ?? ''
          if (!fallbackUserId) return
          setCurrentUserId(fallbackUserId)
          void loadHiddenGroupIds(fallbackUserId)
        } catch {
          // No-op: hiding groups remains unavailable when user id cannot be resolved.
        }
      })()
    }

    setSession(s)
    const allGroups = s.allGroups ?? []
    const lastUsedGroupId = localStorage.getItem('nearby_last_group_id')
    const remembered = lastUsedGroupId
      ? allGroups.find((g) => g.groupId === lastUsedGroupId)
      : null
    const initial: GroupEntry = remembered ?? { memberId: s.memberId, memberName: s.memberName, groupId: s.groupId, groupName: s.groupName }
    setActiveGroup(initial)
    fetchPlaces(initial.groupId)
    fetchCategories(initial.groupId)
  }, [router, fetchPlaces, fetchCategories, loadHiddenGroupIds])

  useEffect(() => {
    if (!activeGroup) return
    void fetch(apiPath('/api/groups/membership/onboard'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: activeGroup.groupId, memberId: activeGroup.memberId }),
    })
  }, [activeGroup])

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

    localStorage.setItem('nearby_last_group_id', entry.groupId)

    setActiveGroup(entry)
    console.log('[GroupSwitcher]', {
      current_group_id: activeGroup?.groupId ?? null,
      action: 'switch',
    })
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

    localStorage.setItem('nearby_last_group_id', entry.groupId)

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
      const res = await fetch(apiPath('/api/location/reverse'), {
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

  const handleLogout = async () => {
    console.log('[Nearby][Nearby] Logout clicked')
    try {
      const { error } = await supabase.auth.signOut()
      console.log('[Nearby][Nearby] supabase.auth.signOut result:', error ?? 'ok')
    } catch (err) {
      console.warn('[Nearby][Nearby] signOut error (continuing):', err)
    }
    localStorage.removeItem('nearby_session')
    localStorage.removeItem('nearby_register')
    localStorage.removeItem('nearby_passcode_set')
    console.log('[Nearby][Nearby] localStorage cleared, redirecting to:', withBasePath('/'))
    window.location.replace(withBasePath('/'))
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
  const openDirections = (place: PlaceCard) => {
    const destination =
      place.lat != null && place.lng != null
        ? `${place.lat},${place.lng}`
        : encodeURIComponent(place.formatted_address ?? place.name)

    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_blank')
  }

  const generateWhatsAppMessage = (place: PlaceCard): string => {
    const topNote = place.recommendations.find((r) => (r.note ?? '').trim().length > 0)?.note?.trim() ?? ''
    const directionsUrl =
      place.lat != null && place.lng != null
        ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.formatted_address ?? place.name)}`

    return `🍜 Found something good nearby!\n\n📍 ${place.name}\n${topNote ? `📝 ${topNote}\n` : ''}📌 Address:\n${place.formatted_address ?? place.name}\n\n🧭 Directions:\n${directionsUrl}\n\nExplore more around you:\nhttps://togostory.com/nearby`
  }

  const shareToWhatsApp = (place: PlaceCard) => {
    const encoded = encodeURIComponent(generateWhatsAppMessage(place))
    const isMobile = /iPhone|Android/i.test(navigator.userAgent)
    const url = isMobile
      ? `https://wa.me/?text=${encoded}`
      : `https://web.whatsapp.com/send?text=${encoded}`
    window.open(url, '_blank')
  }

  const confirmDeletePlace = async () => {
    if (!deletePlaceTarget || !activeGroup) return
    setDeletePlaceError('')
    setDeletingPlace(true)
    try {
      const response = await fetch(apiPath('/api/places/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: deletePlaceTarget.place_id,
          memberId: activeGroup.memberId,
          groupId: activeGroup.groupId,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result?.ok) {
        setDeletePlaceError(result?.message ?? 'Something went wrong. Please try again.')
        return
      }
      setPlaces((prev) => prev.filter((p) => p.place_id !== deletePlaceTarget.place_id))
      setDeletePlaceTarget(null)
    } catch (err) {
      console.error('[Nearby][DeletePlace] Request failed:', err)
      setDeletePlaceError('Something went wrong. Please try again.')
    } finally {
      setDeletingPlace(false)
    }
  }

  const openEditPlace = (place: PlaceCard) => {
    if (!activeGroup) return
    router.push(withBasePath(`/add-place?editPlaceId=${encodeURIComponent(place.place_id)}`))
  }

  useEffect(() => {
    console.log('[NavigationUI]', { component: 'nearby-group-switcher', upgraded_from: 'basic-dropdown', upgraded_to: 'structured-sections' })
  }, [])

  if (!session || !activeGroup) return null

  const displayed = displayedPlaces()
  const subtitle = locationSubtitle()
  const allGroups = session.allGroups ?? []
  const hiddenGroups = allGroups.filter((group) => hiddenGroupIds.has(group.groupId) && group.groupId !== activeGroup.groupId)
  const activeGroups = allGroups.filter((group) => !hiddenGroupIds.has(group.groupId) && group.groupId !== activeGroup.groupId)

  return (
    <main className="min-h-screen bg-[#f5f6f8] pb-24">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <AppHeader
        right={
          <div className="flex items-center gap-2">
            <div className="hidden min-[390px]:block text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Signed in</p>
              <p className="text-xs font-medium text-neutral-700 leading-none">{session.memberName}</p>
            </div>

            <button
              onClick={() => router.push(withBasePath('/settings'))}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-100 active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3.5" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.08A1.7 1.7 0 0 0 8.96 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.87L4.2 7.03A2 2 0 1 1 7.03 4.2l.06.06A1.7 1.7 0 0 0 8.96 4.6 1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.08A1.7 1.7 0 0 0 15.04 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8.96 1.7 1.7 0 0 0 20.96 10H21a2 2 0 1 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15z" />
              </svg>
              <span>Settings</span>
            </button>

            <button
              onClick={() => void handleLogout()}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50/70 px-3 text-xs font-medium text-rose-700 transition-all hover:bg-rose-100 active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        }
      />

      <div className="nearby-shell pt-5 pb-3">
        <div className="relative">
          <button
            onClick={() => setShowGroupMenu((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-full border border-[#d5dceb] bg-white px-3 py-1.5 text-xs font-medium text-[#2b3a58] transition-colors hover:bg-[#f3f6fb] shadow-sm"
          >
            <span>{activeGroup.groupName}</span>
            <span className="text-neutral-400">▾</span>
          </button>

          {showGroupMenu && (
            <div className="absolute z-20 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl transition-all duration-200">
              <div className="rounded-xl border border-[#dce3f0] bg-[#f7f9fe] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-[#243a62]">{activeGroup.groupName}</p>
                  <span className="rounded-full border border-[#d6ddeb] bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">Current</span>
                </div>
              </div>

              <div className="mt-2">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Active Groups</p>
                {activeGroups.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-neutral-500">No other active groups.</p>
                ) : (
                  <div className="space-y-1">
                    {activeGroups.map((g) => (
                      <div key={g.groupId} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-neutral-50">
                        <button
                          onClick={() => switchGroup(g)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-medium text-neutral-800">{g.groupName}</p>
                        </button>
                        <button
                          onClick={() => void setGroupVisibility(g.groupId, true)}
                          disabled={visibilityBusyGroupId === g.groupId}
                          className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-white hover:text-neutral-700 disabled:opacity-50"
                          title="Hide group"
                          aria-label="Hide group"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 3l18 18" />
                            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                            <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5.05 0 9.27 3.11 10.5 7.5a11.8 11.8 0 0 1-2.23 3.82" />
                            <path d="M6.61 6.61A11.84 11.84 0 0 0 1.5 12.5a11.82 11.82 0 0 0 4.44 5.98" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {hiddenGroups.length > 0 && (
                <div className="mt-2 rounded-xl border border-neutral-200 bg-[#fbfcff]">
                  <button
                    onClick={() => {
                      setHiddenSectionExpanded((prev) => !prev)
                      console.log('[GroupSwitcher]', {
                        current_group_id: activeGroup.groupId,
                        action: 'expand_hidden',
                      })
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Hidden Groups ({hiddenGroups.length})</p>
                    <span className={`text-neutral-400 transition-transform ${hiddenSectionExpanded ? 'rotate-180' : ''}`}>⌄</span>
                  </button>
                  <div className={`overflow-hidden transition-[max-height] duration-200 ${hiddenSectionExpanded ? 'max-h-56' : 'max-h-0'}`}>
                    <div className="space-y-1 px-2 pb-2">
                      {hiddenGroups.map((g) => (
                        <div key={g.groupId} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white">
                          <button
                            onClick={() => {
                              void setGroupVisibility(g.groupId, false)
                              switchGroup(g)
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-sm font-medium text-neutral-700">{g.groupName}</p>
                          </button>
                          <button
                            onClick={() => void setGroupVisibility(g.groupId, false)}
                            disabled={visibilityBusyGroupId === g.groupId}
                            className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-white hover:text-neutral-700 disabled:opacity-50"
                            title="Unhide group"
                            aria-label="Unhide group"
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-2 border-t border-neutral-200 pt-2">
                <button
                  onClick={() => {
                    setShowGroupMenu(false)
                    setShowCreateGroupModal(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#1f355d] hover:bg-[#edf2fb] transition-colors font-medium"
                >
                  <span className="text-base leading-none">＋</span>
                  <span>Create New Group</span>
                </button>
                <button
                  onClick={() => {
                    setShowGroupMenu(false)
                    router.push(withBasePath('/join-group'))
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  <span className="text-sm leading-none">#</span>
                  <span>Join Group with Passcode</span>
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
              <button onClick={resolveLocation} className="shrink-0 text-xs text-[#1f355d] border border-[#cfd8ea] rounded-full px-3 py-1 hover:bg-[#edf2fb] transition-colors">Enable</button>
            </div>
          )}
          {locationStatus === 'denied' && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-neutral-400">{subtitle.text}</p>
              <button onClick={resolveLocation} className="shrink-0 text-xs text-[#1f355d] border border-[#cfd8ea] rounded-full px-3 py-1 hover:bg-[#edf2fb] transition-colors">Try again</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Category filter ──────────────────────────────────────────────────── */}
      {groupCategories.length > 0 && (
        <div className="nearby-shell mb-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                !selectedCategoryId ? 'bg-[#1f355d] text-white' : 'bg-[#edf1f7] text-[#4b5671] hover:bg-[#e4e9f2]'
              }`}
            >
              All
            </button>
            {groupCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId((prev) => prev === cat.id ? null : cat.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategoryId === cat.id ? 'bg-[#1f355d] text-white' : 'bg-[#edf1f7] text-[#4b5671] hover:bg-[#e4e9f2]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Place list ───────────────────────────────────────────────────────── */}
      <div className="nearby-shell space-y-4">
        {placesLoading ? (
          <p className="text-sm text-neutral-400 text-center py-20">Loading…</p>
        ) : placesError ? (
          <ErrorState
            title="Something did not go through"
            message="We could not load places right now. Please try again."
            onPrimary={() => fetchPlaces(activeGroup.groupId)}
          />
        ) : displayed.length === 0 ? (
          selectedCategoryId ? (
            <div className="rounded-2xl bg-white border border-neutral-200 p-8 text-center shadow-sm mt-4">
              <p className="text-lg font-semibold text-neutral-900">No places in this category</p>
              <p className="mt-2 text-sm text-neutral-500">Try a different filter or add a place.</p>
              <button
                onClick={() => router.push(withBasePath('/add-place'))}
                className="mt-6 w-full rounded-xl bg-[#1f355d] hover:bg-[#162746] px-4 py-3 text-sm font-semibold text-white transition-colors"
              >
                + Add Place
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-neutral-200 p-8 text-center shadow-sm mt-4">
              <div className="text-4xl mb-3">🍜</div>
              <p className="text-xl font-bold text-neutral-900">No places yet</p>
              <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
                Looks like your group hasn&apos;t added any spots yet. Why not start the list?
              </p>
              <p className="mt-2 text-xs text-neutral-400">
                Add your favourite food spots, cafes, or hidden gems to get started.
              </p>
              <button
                onClick={() => router.push(withBasePath('/add-place'))}
                className="mt-6 w-full rounded-xl bg-[#1f355d] hover:bg-[#162746] px-4 py-3 text-sm font-semibold text-white transition-colors"
              >
                + Add First Place
              </button>
              <div className="mt-4 rounded-xl border border-[#d9e6ff] bg-[#f2f6ff] p-4 text-left">
                <p className="text-xs font-semibold text-[#1f355d] mb-1.5">💡 Not sure where to start?</p>
                <p className="text-sm text-[#364158] leading-relaxed">
                  Why not start by adding your favourite food spot nearby — a hawker stall, a café, or a hidden gem only your group knows about?
                </p>
                <button
                  onClick={() => router.push(withBasePath('/add-place'))}
                  className="mt-3 w-full rounded-xl border border-[#c3d6f9] bg-white px-4 py-2.5 text-sm font-medium text-[#1f355d] hover:bg-[#eef3fb] transition-colors"
                >
                  Add a food spot
                </button>
              </div>
            </div>
          )
        ) : (
          displayed.map((place) => {
            const notes = place.recommendations.filter((r) => r.note)
            const initials = [...new Set(place.recommendations.map((r) => getInitials(r.member_name)))]
            const expanded = expandedNotes.has(place.place_id)
            const visibleNotes = expanded ? notes : notes.slice(0, 2)
            const extraNotes = notes.length - 2
            const isOwnPlace = place.recommendations.some((r) => r.member_id === activeGroup.memberId)

            return (
              <div key={place.place_id} className="relative rounded-2xl bg-white border border-neutral-200 overflow-hidden shadow-sm">

                {/* Subtle trash icon — only for own places */}
                {isOwnPlace && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                    <button
                      onClick={() => openEditPlace(place)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/35 text-white/80 transition-colors hover:bg-black/55 hover:text-white"
                      title="Edit place"
                      aria-label="Edit place"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => { setDeletePlaceTarget(place); setDeletePlaceError('') }}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/35 text-white/80 transition-colors hover:bg-rose-600/80 hover:text-white"
                      title="Delete place"
                      aria-label="Delete place"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Photo */}
                {place.photo_urls.length > 0 && (
                  <div className="relative cursor-pointer" onClick={() => openGallery(place.photo_urls, 0)}>
                    <TransformedImage
                      src={place.photo_urls[0]}
                      alt={place.name}
                      transform={readTransformFromMap(place.image_transforms, place.photo_urls[0])}
                      className="aspect-video w-full border-0 rounded-none"
                    />
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
                  <div className="flex gap-1.5 flex-wrap">
                    {initials.map((ini, idx) => (
                      <span
                        key={`${place.place_id}-${ini}-${idx}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-700"
                        title={ini}
                      >
                        {ini}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      onClick={() => openDirections(place)}
                      className="text-xs text-[#1f355d] border border-[#ccd6ea] rounded-full px-3 py-1 bg-[#eef3fb] hover:bg-[#e3eaf7] transition-colors"
                    >
                      Directions
                    </button>
                    <button
                      onClick={() => shareToWhatsApp(place)}
                      className="text-xs text-[#7f4a24] border border-[#efcfb6] rounded-full px-3 py-1 bg-[#fff4eb] hover:bg-[#ffead9] transition-colors"
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
        onClick={() => router.push(withBasePath('/add-place'))}
        className="fixed bottom-6 right-5 rounded-full bg-[#1f355d] hover:bg-[#162746] active:bg-[#12203a] px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors"
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
          <div className="w-[90vw] max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <TransformedImage
              src={gallery.photos[gallery.index]}
              alt="gallery"
              transform={readTransformFromMap(
                displayed.find((p) => p.photo_urls.includes(gallery.photos[gallery.index]))?.image_transforms,
                gallery.photos[gallery.index],
              )}
              className="aspect-video w-full rounded-xl border border-white/20 bg-black"
              imageClassName=""
            />
          </div>
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

      {/* ── Delete place confirmation modal ──────────────────────────────── */}
      {deletePlaceTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-8 pt-20" onClick={() => { if (!deletingPlace) { setDeletePlaceTarget(null); setDeletePlaceError('') } }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </div>
            <p className="text-base font-semibold text-neutral-900">Delete &ldquo;{deletePlaceTarget.name}&rdquo;?</p>
            <p className="mt-1.5 text-sm text-neutral-500 leading-relaxed">
              This will remove all data associated with it, including photos and recommendations from this group.
            </p>
            {deletePlaceError && (
              <p className="mt-3 text-sm text-rose-700 font-medium">{deletePlaceError}</p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => void confirmDeletePlace()}
                disabled={deletingPlace}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {deletingPlace ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => { setDeletePlaceTarget(null); setDeletePlaceError('') }}
                disabled={deletingPlace}
                className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
