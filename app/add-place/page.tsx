'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ErrorState from '@/components/ErrorState'
import TransformedImage from '@/components/TransformedImage'
import PhotoAdjustSheet from '@/components/PhotoAdjustSheet'
import ChefScanOverlay from '@/components/showcase/ChefScanOverlay'
import type { BeAChefAnalysis } from '@/components/showcase/BeAChefSheet'
import {
  DEFAULT_IMAGE_TRANSFORM,
  type ImageTransform,
  isAdjustmentRecommended,
} from '@/lib/image-transform'
import { apiPath, withBasePath } from '@/lib/base-path'
import { supabase } from '@/lib/supabase'
import { UIMessages } from '@/lib/ui-messages'

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowState =
  | 'idle'
  | 'converting_image'
  | 'analyzing'
  | 'analysis_success'
  | 'analysis_error'

type Session = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

type Prediction = {
  placeId: string
  text: string
  secondaryText: string
  distanceMeters: number | null
  rating: number | null
}

type PlaceDetails = {
  google_place_id: string
  name: string
  formatted_address: string | null
  lat: number | null
  lng: number | null
  rating: number | null
  user_rating_count: number | null
}

type Category = {
  id: string
  name: string
}

type DishSignals = {
  image_score: number
  place_score: number
  visual_memory_score: number
}

type DishSuggestion = {
  name: string
  confidence: number
  why: string[]
  signals: DishSignals
}

type AiResult = {
  dish: string | null
  suggestions: string[]
  topSuggestions: DishSuggestion[]
  confidence: number | null
  reasoning: string
  analysisEventId: string | null
}

const emptyAiResult: AiResult = {
  dish: null,
  suggestions: [],
  topSuggestions: [],
  confidence: null,
  reasoning: '',
  analysisEventId: null,
}

// ─── HEIC helpers ─────────────────────────────────────────────────────────────

function isHeic(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif'
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const mod = await import('heic2any')
  const heic2any = (mod.default ?? mod) as (opts: { blob: Blob; toType: string; quality: number }) => Promise<Blob | Blob[]>
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 })
  const blob = Array.isArray(result) ? result[0] : result
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
}

// ─── AI response normalisation ────────────────────────────────────────────────

const GENERIC_BLACKLIST = new Set([
  'western food', 'asian food', 'chinese food', 'indian food', 'malay food',
  'chinese cuisine', 'indian cuisine', 'malay cuisine', 'asian cuisine',
  'southeast asian food', 'mixed food', 'food', 'meal',
])

function isGeneric(name: string): boolean {
  return GENERIC_BLACKLIST.has(name.toLowerCase().trim())
}

function stripPercentage(name: string): string {
  return name.replace(/\s*\(\d+%\)$/, '').trim()
}

// ─── Mode resolution ────────────────────────────────────────────────────────

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

type PlacePageMode =
  | { mode: 'create'; editPlaceId: null }
  | { mode: 'edit'; editPlaceId: string }

function resolvePlaceMode(
  params: { get(key: string): string | null },
): PlacePageMode {
  const editId = params.get('editPlaceId')
  if (editId && isValidUUID(editId)) {
    return { mode: 'edit', editPlaceId: editId }
  }
  return { mode: 'create', editPlaceId: null }
}

function parseAiResponse(data: Record<string, unknown>): AiResult {
  let confidence = typeof data.confidence === 'number' ? data.confidence : null
  if (confidence !== null && confidence > 1) confidence = confidence / 100
  if (confidence !== null) confidence = Math.min(1, Math.max(0, confidence))

  const rawDish = typeof data.primarySuggestion === 'string' ? data.primarySuggestion.trim() : null
  const dish = rawDish && !isGeneric(rawDish) && (confidence === null || confidence >= 0.5) ? rawDish : null

  const topSuggestions: DishSuggestion[] = Array.isArray(data.topSuggestions)
    ? (data.topSuggestions as unknown[])
        .filter((x): x is DishSuggestion => typeof x === 'object' && x !== null && typeof (x as DishSuggestion).name === 'string')
        .filter((s) => !isGeneric(s.name))
        .slice(0, 5)
    : []

  const rawAlts = topSuggestions.length
    ? topSuggestions.map((s) => s.name)
    : Array.isArray(data.alternativeSuggestions)
    ? (data.alternativeSuggestions as unknown[])
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && !isGeneric(x))
        .slice(0, 5)
    : []

  const reasoning = typeof data.reasoningShort === 'string' ? data.reasoningShort : ''
  const analysisEventId = typeof data.analysisEventId === 'string' ? data.analysisEventId : null

  return { dish, suggestions: rawAlts, topSuggestions, confidence, reasoning, analysisEventId }
}

// ─── Component (inner) ────────────────────────────────────────────────────────

function AddPlaceInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const resolvedMode = resolvePlaceMode(searchParams)
  const mode = resolvedMode.mode
  const editPlaceId = resolvedMode.editPlaceId

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem('nearby_session')
    if (!raw) return null
    try {
      return JSON.parse(raw) as Session
    } catch {
      return null
    }
  })

  const [flowState, setFlowState] = useState<FlowState>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [chefAnalysis, setChefAnalysis] = useState<BeAChefAnalysis | null>(null)
  const [imageTransform, setImageTransform] = useState<ImageTransform>(DEFAULT_IMAGE_TRANSFORM)
  const [isTransformCustomized, setIsTransformCustomized] = useState(false)
  const [showAdjustSheet, setShowAdjustSheet] = useState(false)
  const [previewImageSize, setPreviewImageSize] = useState<{ width: number; height: number } | null>(null)
  const [aiResult, setAiResult] = useState<AiResult>(emptyAiResult)
  const [aiError, setAiError] = useState('')

  const [selectedDish, setSelectedDish] = useState<string | null>(null)
  const [editingDish, setEditingDish] = useState(false)
  const [customDish, setCustomDish] = useState('')

  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const [categories, setCategories] = useState<Category[]>([])

  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showSaveErrorCard, setShowSaveErrorCard] = useState(false)
  const [showDishSavedToast, setShowDishSavedToast] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [editDenied, setEditDenied] = useState(false)

  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [showGroupSelector, setShowGroupSelector] = useState(false)
  const [userGroups, setUserGroups] = useState<Array<{ id: string; name: string }>>([])
  const [loadingGroups, setLoadingGroups] = useState(false)

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === 'create') {
      // Strict: in create mode the URL must have NO query string.
      // The +Add button always navigates to /add-place clean. If anything
      // (editPlaceId, stale params, share params) is present, strip it.
      const hasQuery = typeof window !== 'undefined' && window.location.search.length > 0
      if (hasQuery) {
        router.replace(withBasePath('/add-place'))
      } else {
        setPreviewUrl((prev) => {
          if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
          return null
        })
        setSelectedFile(null)
        setChefAnalysis(null)
        setImageTransform(DEFAULT_IMAGE_TRANSFORM)
        setIsTransformCustomized(false)
        setShowAdjustSheet(false)
        setPreviewImageSize(null)
        setAiResult(emptyAiResult)
        setAiError('')
        setSelectedDish(null)
        setEditingDish(false)
        setCustomDish('')
        setQuery('')
        setPredictions([])
        setSelectedPlace(null)
        setNote('')
        setError('')
        setShowSaveErrorCard(false)
        setShowDishSavedToast(false)
        setEditDenied(false)
        setLoadingEdit(false)
      }
    } else {
      setLoadingEdit(true)
    }
  }, [mode, editPlaceId, router])

  useEffect(() => {
    if (!session) return

    let mounted = true
    const loadUserGroups = async () => {
      setLoadingGroups(true)
      try {
        const { data: memberRow } = await supabase
          .from('members')
          .select('user_id')
          .eq('id', session.memberId)
          .maybeSingle()

        const userId = memberRow?.user_id
        if (!userId) return

        const { data } = await supabase
          .from('members')
          .select('group_id, groups(id, name)')
          .eq('user_id', userId)

        if (mounted && data && Array.isArray(data)) {
          const groups = data
            .map((m: any) => {
              const groupRow = Array.isArray(m.groups) ? m.groups[0] : m.groups
              if (!groupRow || typeof groupRow !== 'object') return null
              return { id: String(groupRow.id), name: String(groupRow.name) }
            })
            .filter((g): g is { id: string; name: string } => Boolean(g?.id && g?.name))
          setUserGroups(groups)
          setSelectedGroupIds([session.groupId])
        }
      } catch (err) {
        console.error('[AddPlace] Failed to load user groups:', err)
      } finally {
        if (mounted) setLoadingGroups(false)
      }
    }

    void loadUserGroups()
    return () => { mounted = false }
  }, [session, mode])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserCoords(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 120000 },
    )
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    if (!session) {
      router.replace(withBasePath('/'))
      return
    }

    let mounted = true
    const loadCategories = async () => {
      const { data } = await supabase
        .from('food_categories')
        .select('id, name')
        .eq('group_id', session.groupId)
        .order('name')

      if (mounted) setCategories(data ?? [])
    }

    void loadCategories()
    return () => { mounted = false }
  }, [session, router])

  useEffect(() => {
    if (mode !== 'edit' || !editPlaceId) return
    if (!session?.memberId || !session?.groupId) return

    const loadEditData = async () => {
      setEditDenied(false)
      setError('')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12000)

      try {
        const response = await fetch(apiPath('/api/places/edit'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            placeId: editPlaceId,
            memberId: session.memberId,
            groupId: session.groupId,
          }),
        })

        const result = await response.json()
        if (!response.ok || !result?.ok) {
          if (response.status === 403) {
            setEditDenied(true)
            setLoadingEdit(false)
            return
          }
          setError(result?.message ?? 'Could not load this place for editing.')
          setLoadingEdit(false)
          return
        }

        setSelectedPlace(result.place ?? null)
        setQuery((result.place?.name as string) ?? '')
        const noteValue = (result.note as string) ?? ''
        setNote(noteValue)
        const dishName = ((result.dishName as string) ?? '').trim()

        if (dishName) {
          setSelectedDish(dishName)
          setCustomDish('')
          setAiResult({ ...emptyAiResult, dish: dishName, confidence: 1 })
        }
        setFlowState('analysis_success')

        const photoUrls = Array.isArray(result.photoUrls) ? result.photoUrls as string[] : []
        const imageTransforms = (result.imageTransforms ?? {}) as Record<string, unknown>
        if (photoUrls.length > 0) {
          const firstPhoto = photoUrls[0]
          setPreviewUrl(firstPhoto)
          try {
            const { DEFAULT_IMAGE_TRANSFORM: DEF, coerceTransform } = await import('@/lib/image-transform')
            const raw = imageTransforms[firstPhoto]
            const savedTransform = raw ? coerceTransform(raw) : DEF
            setImageTransform(savedTransform)
            setIsTransformCustomized(JSON.stringify(savedTransform) !== JSON.stringify(DEF))
          } catch {
            // non-fatal
          }
        }
      } catch (loadError) {
        if ((loadError as { name?: string })?.name === 'AbortError') {
          setError('Loading this place took too long. Please try again.')
          return
        }
        console.error('[Nearby][PlaceEdit] Load failed:', loadError)
        setError('Could not load this place for editing.')
      } finally {
        clearTimeout(timeout)
        setLoadingEdit(false)
      }
    }

    void loadEditData()
  }, [mode, editPlaceId, session?.memberId, session?.groupId])

  const runAnalysis = useCallback(async (file: File, placeContext?: { placeId: string; placeName: string } | null) => {
    setFlowState('analyzing')
    setAiError('')
    setChefAnalysis(null)
    try {
      const formData = new FormData()
      formData.append('image', file)
      if (placeContext?.placeId) formData.append('placeId', placeContext.placeId)
      if (placeContext?.placeName) formData.append('placeName', placeContext.placeName)
      if (session?.memberId) formData.append('userId', session.memberId)

      // Fire the Be a Chef visual scan in parallel — non-blocking. It powers
      // the on-image ingredient markers shown over the preview while the
      // primary dish-suggestion call continues.
      void (async () => {
        try {
          const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(file)
          })
          if (!dataUrl) return
          const chefRes = await fetch(apiPath('/api/be-a-chef/analyze'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              photoUrl: dataUrl,
              placeName: placeContext?.placeName ?? null,
            }),
          })
          if (!chefRes.ok) return
          const chefJson = await chefRes.json() as BeAChefAnalysis
          console.log('[AddPlace][BeAChef] grounded ingredients', {
            located: chefJson.key_visual_clues.filter((c) => c.x !== null && c.y !== null).length,
          })
          setChefAnalysis(chefJson)
        } catch (err) {
          console.warn('[AddPlace][BeAChef] visual scan failed (non-fatal):', err)
        }
      })()

      const res = await fetch(apiPath('/api/food/suggest'), { method: 'POST', body: formData })
      const data = await res.json()

      if (data.error) {
        console.error('[Nearby][AI] Analysis failed:', data)
        setAiError('Photo analysis failed. You can type the dish name below.')
        setFlowState('analysis_error')
        return
      }

      const result = parseAiResponse(data as Record<string, unknown>)
      setAiResult(result)

      if (result.dish && (result.confidence ?? 0) >= 0.85) {
        setSelectedDish(result.dish)
      }

      setFlowState('analysis_success')
    } catch (error) {
      console.error('[Nearby][AI] Analysis request failed:', error)
      setAiError('We could not analyse this right now. Try again or adjust your input.')
      setFlowState('analysis_error')
    }
  }, [session?.memberId])

  const rerankWithPlace = useCallback(async (googlePlaceId: string) => {
    if (!aiResult.topSuggestions.length) return
    try {
      const res = await fetch(apiPath('/api/food/rank'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googlePlaceId, suggestions: aiResult.topSuggestions }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (!Array.isArray(data.rankedSuggestions) || !data.rankedSuggestions.length) return

      const ranked: DishSuggestion[] = data.rankedSuggestions
      const newNames = ranked.map((s: DishSuggestion) => s.name)
      setAiResult((prev) => ({
        ...prev,
        dish: ranked[0]?.name ?? prev.dish,
        suggestions: newNames,
        topSuggestions: ranked,
      }))
    } catch (err) {
      console.error('[Nearby][Rank] Re-rank failed (non-fatal):', err)
    }
  }, [aiResult.topSuggestions])

  useEffect(() => {
    if (!selectedPlace?.google_place_id) return
    if (selectedDish || customDish.trim()) return
    if (flowState !== 'analysis_success') return
    if (!aiResult.topSuggestions.length) return
    void rerankWithPlace(selectedPlace.google_place_id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlace?.google_place_id])

  const handleFilePicked = useCallback(async (file: File | null) => {
    if (!file) return

    setSelectedDish(null)
    setCustomDish('')
    setEditingDish(false)
    setSelectedPlace(null)
    setQuery('')
    setAiResult(emptyAiResult)
    setAiError('')
    setImageTransform(DEFAULT_IMAGE_TRANSFORM)
    setIsTransformCustomized(false)
    setShowAdjustSheet(false)
    setPreviewImageSize(null)

    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)

    let processedFile = file

    if (isHeic(file)) {
      setFlowState('converting_image')
      try {
        processedFile = await convertHeicToJpeg(file)
      } catch (error) {
        console.error('[Nearby][AI] HEIC conversion failed:', error)
        setAiError('Could not read this image format. Please try a JPEG or PNG.')
        setFlowState('analysis_error')
        return
      }
    }

    setSelectedFile(processedFile)
    setPreviewUrl(URL.createObjectURL(processedFile))
    await runAnalysis(processedFile)
  }, [previewUrl, runAnalysis, session?.memberId])

  const fetchPredictions = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setPredictions([])
        setShowDropdown(false)
        return
      }

      setSearching(true)
      try {
        const res = await fetch(apiPath('/api/places/autocomplete'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, location: userCoords }),
        })
        const data = await res.json()
        const nextPredictions: Prediction[] = data.predictions ?? []
        setPredictions(nextPredictions)
        setShowDropdown(nextPredictions.length > 0)
      } catch {
        setPredictions([])
      } finally {
        setSearching(false)
      }
    },
    [userCoords],
  )

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    setSelectedPlace(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPredictions(val), 350)
  }

  const handleSelectPrediction = async (prediction: Prediction) => {
    setShowDropdown(false)
    setQuery(prediction.text)
    setPredictions([])
    setLoadingDetails(true)
    setError('')
    setShowSaveErrorCard(false)
    try {
      const res = await fetch(apiPath('/api/places/details'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: prediction.placeId }),
      })
      const data = await res.json()
      if (data.error) {
        console.error('[Nearby][API] Place details failed:', data)
        setError('We could not load place details right now. Please try again.')
      } else {
        setSelectedPlace({
          google_place_id: data.google_place_id,
          name: data.name,
          formatted_address: data.formatted_address ?? null,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          rating: data.rating ?? null,
          user_rating_count: data.user_rating_count ?? null,
        })
      }
    } catch (error) {
      console.error('[Nearby][API] Place details request failed:', error)
      setError('Connection issue. Please check your network and try again.')
    } finally {
      setLoadingDetails(false)
    }
  }

  const clearPlace = () => { setSelectedPlace(null); setQuery(''); setPredictions([]) }

  const handleSave = async () => {
    setError('')
    setShowSaveErrorCard(false)

    if (!session?.memberId || !session?.groupId) {
      setError('Session missing. Please log in again.')
      return
    }

    if (!selectedPlace) {
      setError('Please search for and select a place.')
      return
    }

    const rawDishName = (customDish.trim() || selectedDish || '').trim()
    const dishName = stripPercentage(rawDishName)
    if (!dishName) {
      setError('Please confirm the dish before saving.')
      return
    }

    const groupsToSave = selectedGroupIds.length > 0 ? selectedGroupIds : [session.groupId]
    if (!groupsToSave.length) {
      setError('Please select at least one group.')
      return
    }

    setSaving(true)

    try {
      for (const [index, groupId] of groupsToSave.entries()) {
        const body = new FormData()
        body.append('memberId', session.memberId)
        body.append('groupId', groupId)
        body.append('googlePlaceId', selectedPlace.google_place_id)
        body.append('name', selectedPlace.name)
        if (selectedPlace.formatted_address) body.append('address', selectedPlace.formatted_address)
        if (selectedPlace.lat != null) body.append('lat', String(selectedPlace.lat))
        if (selectedPlace.lng != null) body.append('lng', String(selectedPlace.lng))
        if (selectedPlace.rating != null) body.append('googleRating', String(selectedPlace.rating))
        if (selectedPlace.user_rating_count != null) body.append('googleRatingCount', String(selectedPlace.user_rating_count))
        body.append('dishName', dishName)
        if (note.trim()) body.append('note', note.trim())

        if (selectedFile && index === 0) {
          const transformToSave = isTransformCustomized ? imageTransform : DEFAULT_IMAGE_TRANSFORM
          body.append('imageTransform', JSON.stringify(transformToSave))
          body.append('file', selectedFile, selectedFile.name)
        }
        if (editPlaceId && groupId === session.groupId) {
          body.append('editPlaceId', editPlaceId)
        }
        if (aiResult.analysisEventId) {
          body.append('analysisEventId', aiResult.analysisEventId)
        }

        const res = await fetch(apiPath('/api/places/save'), { method: 'POST', body })
        const data = await res.json() as { ok: boolean; message?: string }

        if (!data.ok) {
          console.error('[Nearby][Save] Server save failed:', data.message)
          throw new Error(data.message ?? 'Save failed')
        }
      }

      if (aiResult.analysisEventId) {
        setShowDishSavedToast(true)
        await new Promise((r) => setTimeout(r, 900))
      }

      router.push(withBasePath('/nearby'))
    } catch (err) {
      console.error('[Nearby][Save] Save food spot failed:', err)
      setError('We could not save your changes. Please try again.')
      setShowSaveErrorCard(true)
      setSaving(false)
    }
  }

  // ─── Derived state ─────────────────────────────────────────────────────────

  if (!session) return null

  const isBlocking = flowState === 'converting_image' || flowState === 'analyzing'
  const isDishConfirmed = Boolean(selectedDish || customDish.trim())
  const hasPhoto = !!previewUrl || isBlocking
  const confidence = aiResult.confidence
  const isHighConf = isDishConfirmed && (confidence ?? 0) >= 0.85

  const chips = [
    ...(aiResult.dish ? [aiResult.dish] : []),
    ...aiResult.suggestions.filter((s) => s !== aiResult.dish),
  ].slice(0, 5)

  const mapEmbedSrc = selectedPlace
    ? selectedPlace.lat != null && selectedPlace.lng != null
      ? `https://www.google.com/maps?q=${selectedPlace.lat},${selectedPlace.lng}&z=17&output=embed`
      : selectedPlace.formatted_address
      ? `https://www.google.com/maps?q=${encodeURIComponent(selectedPlace.formatted_address)}&z=17&output=embed`
      : null
    : null

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#f5f6f8] pb-28" style={{ overflowX: 'hidden', maxWidth: '100vw' }}>
      <div className="nearby-shell px-0 pt-5 box-border">

        <button
          onClick={() => router.back()}
          disabled={isBlocking}
          className="mb-5 inline-flex h-8 items-center gap-1.5 rounded-full border border-[#d7deec] bg-white px-3 text-xs font-medium text-[#44506a] shadow-sm transition-colors hover:bg-[#edf2fb] disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>Back</span>
        </button>

        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          {mode === 'edit' ? 'Edit Food' : 'Add Food'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {mode === 'edit'
            ? 'Update details and save changes.'
            : 'Help your kakis discover hidden gems.'}
        </p>

        {editDenied && (
          <div className="mt-4">
            <ErrorState
              title="Edit not allowed"
              message="Only the place owner can edit this place."
              primaryLabel="Go to Nearby"
              onPrimary={() => router.push(withBasePath('/nearby'))}
            />
          </div>
        )}

        {loadingEdit ? (
          <div className="mt-5 space-y-4">
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div
                  className="h-8 w-8 animate-spin rounded-full"
                  style={{ border: '2px solid #e5e7eb', borderTopColor: '#1f355d' }}
                />
                <p className="text-sm text-neutral-400">Loading place details…</p>
              </div>
            </section>
          </div>
        ) : (
        <div className={`mt-5 space-y-4 ${editDenied ? 'pointer-events-none opacity-40' : ''}`}>

          {/* ── Photo section ──────────────────────────────────────── */}
          <section className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-sm">

            {/* Hidden file inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              capture="environment"
              className="hidden"
              onChange={(e) => void handleFilePicked(e.target.files?.[0] ?? null)}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => void handleFilePicked(e.target.files?.[0] ?? null)}
            />

            {/* Initial state – no photo yet */}
            {!hasPhoto && (
              <div className="p-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="rounded-2xl border border-[#162746] bg-[#1f355d] px-3 py-3 text-left text-white transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h3l2-2h6l2 2h3v12H4z" /><circle cx="12" cy="13" r="4" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold">Take Photo</p>
                </button>

                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="rounded-2xl border border-neutral-200 bg-neutral-100 px-3 py-3 text-left text-neutral-800 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="M21 16l-5-5L5 20" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold">Choose Photo</p>
                </button>
              </div>
            )}

            {/* Photo preview – full width */}
            {previewUrl && (
              <>
                <div className="relative">
                  <TransformedImage
                    src={previewUrl}
                    alt="Food preview"
                    transform={imageTransform}
                    className="aspect-[4/3] rounded-none"
                    onMetrics={({ image }) => setPreviewImageSize(image)}
                  />
                  <ChefScanOverlay
                    phase={
                      flowState === 'analyzing'
                        ? 'scanning'
                        : chefAnalysis
                          ? 'results'
                          : 'idle'
                    }
                    clues={chefAnalysis?.key_visual_clues ?? []}
                  />
                </div>
                <div className="flex gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-100"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h3l2-2h6l2 2h3v12H4z" /><circle cx="12" cy="13" r="4" />
                    </svg>
                    Retake Your Food
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAdjustSheet(true)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-100"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M4 7h16M4 17h16M8 7v10m8-10v10" />
                    </svg>
                    Crop and Adjust
                  </button>
                </div>
              </>
            )}
          </section>

          {/* ── Dish section ───────────────────────────────────────── */}
          {(flowState === 'analysis_success' || flowState === 'analysis_error') && (
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">

              {flowState === 'analysis_error' && (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">Dish</p>
                  <ErrorState
                    title="Something did not go through"
                    message={aiError || 'We could not analyse this right now. Try again or adjust your input.'}
                    onPrimary={() => {
                      if (selectedFile) void runAnalysis(selectedFile)
                    }}
                    secondaryLabel="Continue manually"
                    onSecondary={() => {
                      setAiError('')
                      setFlowState('analysis_success')
                    }}
                  />
                  <input
                    type="text"
                    value={customDish}
                    onChange={(e) => { setCustomDish(e.target.value); setSelectedDish(null) }}
                    placeholder="Type dish name"
                    className="mt-3 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-600 min-w-0 box-border"
                  />
                </>
              )}

              {flowState === 'analysis_success' && (
                <>
                  {/* High confidence – auto-confirmed */}
                  {isHighConf && !editingDish && (
                    <>
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-1">We think this is</p>
                      <div className="flex items-center justify-between gap-3 min-w-0">
                        <p className="text-xl font-semibold text-neutral-900 min-w-0 break-words">{selectedDish}</p>
                        <button
                          onClick={() => setEditingDish(true)}
                          className="shrink-0 text-xs text-neutral-400 underline hover:text-neutral-700"
                        >
                          Edit
                        </button>
                      </div>
                      {aiResult.reasoning && (
                        <p className="mt-1 text-xs text-neutral-400 break-words">{aiResult.reasoning}</p>
                      )}
                    </>
                  )}

                  {/* Low / medium confidence or editing – unified chip + input row */}
                  {(!isHighConf || editingDish) && (
                    <>
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-3">What dish is this?</p>

                      {chips.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {chips.map((name, idx) => (
                            <button
                              key={`chip-${idx}`}
                              onClick={() => { setSelectedDish(name); setCustomDish(''); setEditingDish(false) }}
                              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all min-w-0 ${
                                selectedDish === name
                                  ? 'bg-[#1f355d] text-white'
                                  : idx === 0
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                              }`}
                            >
                              {idx === 0 && selectedDish !== name && (
                                <span className="mr-1 text-[10px] font-semibold text-emerald-600">Top</span>
                              )}
                              {name}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Premium "add your own dish" input on its own row */}
                      <div className="mt-1">
                        <label className="block text-[11px] font-medium text-neutral-400 mb-1.5 uppercase tracking-wide">
                          Add your own dish
                        </label>
                        <input
                          type="text"
                          value={customDish}
                          onChange={(e) => { setCustomDish(e.target.value); setSelectedDish(null) }}
                          placeholder="e.g. Prawn Mee, Hokkien Char..."
                          className="w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-[#1f355d] focus:bg-white min-w-0 box-border placeholder:text-neutral-400"
                        />
                        {customDish.trim() && (
                          <button
                            onClick={() => { setSelectedDish(customDish.trim()); setCustomDish(''); setEditingDish(false) }}
                            className="mt-2 text-xs font-medium text-[#1f355d] underline"
                          >
                            Confirm dish
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          {/* ── Location section ────────────────────────────────────── */}
          {isDishConfirmed && (
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">Where is this place?</p>

              {selectedPlace ? (
                <div className="space-y-3 w-full">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 w-full box-border">
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-neutral-900 break-words">{selectedPlace.name}</p>
                        {typeof selectedPlace.rating === 'number' && (
                          <p className="mt-0.5 text-xs text-neutral-500">⭐ {selectedPlace.rating.toFixed(1)}{typeof selectedPlace.user_rating_count === 'number' ? ` · ${selectedPlace.user_rating_count.toLocaleString()} reviews` : ''}</p>
                        )}
                        {selectedPlace.formatted_address && (
                          <p className="mt-0.5 text-xs text-neutral-600 break-words">{selectedPlace.formatted_address}</p>
                        )}
                      </div>
                      <button onClick={clearPlace} className="shrink-0 text-neutral-400 hover:text-neutral-700 text-lg leading-none">×</button>
                    </div>
                  </div>

                  {mapEmbedSrc ? (
                    <iframe
                      title="Place map preview"
                      width="100%"
                      height="200"
                      style={{ border: 0, borderRadius: '12px', maxWidth: '100%', display: 'block' }}
                      loading="eager"
                      src={mapEmbedSrc}
                    />
                  ) : (
                    <div className="h-24 grid place-items-center rounded-xl border border-neutral-200 text-xs text-neutral-400">
                      Map preview unavailable.
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative w-full" ref={dropdownRef}>
                  <input
                    type="text"
                    value={query}
                    onChange={handleQueryChange}
                    onFocus={() => predictions.length > 0 && setShowDropdown(true)}
                    placeholder="Search place name or address"
                    autoComplete="off"
                    className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-600 min-w-0 box-border"
                  />
                  {searching && <p className="mt-2 text-xs text-neutral-400">Searching...</p>}
                  {loadingDetails && <p className="mt-2 text-xs text-neutral-400">Loading details...</p>}

                  {showDropdown && predictions.length > 0 && (
                    <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
                      {predictions.map((p) => (
                        <button
                          key={p.placeId}
                          onClick={() => handleSelectPrediction(p)}
                          className="w-full border-b border-neutral-100 px-4 py-3 text-left transition-colors hover:bg-neutral-50 last:border-b-0"
                        >
                          <div className="flex items-start justify-between gap-2 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 min-w-0 break-words">{p.text}</p>
                            {typeof p.rating === 'number' && (
                              <span className="shrink-0 text-xs text-neutral-500">⭐ {p.rating.toFixed(1)}</span>
                            )}
                          </div>
                          {p.secondaryText && <p className="mt-0.5 truncate text-xs text-neutral-500">{p.secondaryText}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── Note section ────────────────────────────────────────── */}
          {isDishConfirmed && (
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">Add a note</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What should people know?"
                rows={3}
                className="w-full resize-none rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-600 min-w-0 box-border"
              />
            </section>
          )}

          {/* ── Group selection section ─────────────────────────────── */}
          {isDishConfirmed && !loadingGroups && userGroups.length > 0 && (
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Add to groups</p>
                <button
                  onClick={() => setShowGroupSelector(!showGroupSelector)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  {showGroupSelector ? 'Done' : 'Edit'}
                </button>
              </div>

              {showGroupSelector ? (
                <div className="space-y-2">
                  {userGroups.map((group) => (
                    <label key={group.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(group.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGroupIds([...selectedGroupIds, group.id])
                          } else {
                            setSelectedGroupIds(selectedGroupIds.filter((id) => id !== group.id))
                          }
                        }}
                        className="w-4 h-4 rounded border-neutral-300"
                      />
                      <span className="text-sm text-neutral-700">{group.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {selectedGroupIds.length === 0 ? (
                    <p className="text-sm text-neutral-500">Current group only</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedGroupIds.map((id) => {
                        const group = userGroups.find((g) => g.id === id)
                        return group ? (
                          <span key={id} className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full">
                            {group.name}
                          </span>
                        ) : null
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── Error ───────────────────────────────────────────────── */}
          {error && !showSaveErrorCard && <p className="text-sm text-amber-700 break-words">{error}</p>}

          {showSaveErrorCard && (
            <ErrorState
              title="Something did not go through"
              message="We could not save your changes. Please try again."
              onPrimary={handleSave}
              secondaryLabel="Go Back"
              onSecondary={() => router.back()}
            />
          )}

          {/* ── Save button ─────────────────────────────────────────── */}
          {isDishConfirmed && (
            <button
              onClick={handleSave}
              disabled={saving || loadingDetails || isBlocking}
              className="w-full rounded-xl bg-[#1f355d] hover:bg-[#162746] px-4 py-3 text-sm font-semibold text-white transition-all duration-300 disabled:opacity-40"
            >
              {saving ? UIMessages.actionSaving : mode === 'edit' ? 'Save changes' : 'Save food spot'}
            </button>
          )}

        </div>
        )} {/* end loadingEdit conditional */}
      </div>

      {/* ── Dish saved toast ─────────────────────────────────────────── */}
      {showDishSavedToast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          Dish saved. Future suggestions will improve.
        </div>
      )}

      {/* ── Blocking analysis overlay ────────────────────────────────── */}
      {isBlocking && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ backgroundColor: 'rgba(10,10,10,0.60)', backdropFilter: 'blur(3px)' }}
          aria-live="polite"
          aria-label="Analyzing your dish"
        >
          <div
            className="mb-5 h-10 w-10 animate-spin rounded-full"
            style={{ border: '2px solid rgba(255,255,255,0.15)', borderTopColor: 'rgba(255,255,255,0.9)' }}
          />
          <p className="text-base font-medium text-white tracking-wide">Analyzing your dish...</p>
          <p className="mt-1.5 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>This only takes a moment</p>
        </div>
      )}

      <PhotoAdjustSheet
        isOpen={showAdjustSheet}
        src={previewUrl}
        initialTransform={imageTransform}
        onCancel={() => setShowAdjustSheet(false)}
        onDone={(nextTransform) => {
          setImageTransform(nextTransform)
          setIsTransformCustomized(true)
          setShowAdjustSheet(false)
        }}
      />
    </main>
  )
}

// ─── Suspense wrapper (required by Next.js for useSearchParams) ───────────────

export default function AddPlace() {
  return (
    <Suspense>
      <AddPlaceInner />
    </Suspense>
  )
}
