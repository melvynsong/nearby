'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
}

type Category = {
  id: string
  name: string
}

type AiResult = {
  dish: string | null
  suggestions: string[]   // dish-level names, max 5
  confidence: number | null
  reasoning: string
}

const emptyAiResult: AiResult = {
  dish: null,
  suggestions: [],
  confidence: null,
  reasoning: '',
}

// ─── HEIC helpers ─────────────────────────────────────────────────────────────

function isHeic(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif'
}

async function convertHeicToJpeg(file: File): Promise<File> {
  // Dynamic import keeps heic2any out of the main JS bundle
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

function parseAiResponse(data: Record<string, unknown>): AiResult {
  const confidence = typeof data.confidence === 'number' ? data.confidence : null

  const rawDish = typeof data.primarySuggestion === 'string' ? data.primarySuggestion.trim() : null
  const dish = rawDish && !isGeneric(rawDish) && (confidence === null || confidence >= 0.5) ? rawDish : null

  const rawAlts = Array.isArray(data.alternativeSuggestions)
    ? (data.alternativeSuggestions as unknown[])
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && !isGeneric(x))
        .slice(0, 5)
    : []

  const reasoning = typeof data.reasoningShort === 'string' ? data.reasoningShort : ''
  return { dish, suggestions: rawAlts, confidence, reasoning }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddPlace() {
  const router = useRouter()
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

  // ── Image / Analysis state
  const [flowState, setFlowState] = useState<FlowState>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState<AiResult>(emptyAiResult)
  const [aiError, setAiError] = useState('')

  // ── Dish selection
  const [selectedDish, setSelectedDish] = useState<string | null>(null)
  const [editingDish, setEditingDish] = useState(false)
  const [customDish, setCustomDish] = useState('')

  // ── Location
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  // ── Categories (group's saved list, for fallback)
  const [categories, setCategories] = useState<Category[]>([])

  // ── Note & save
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [failedStage, setFailedStage] = useState('')

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

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
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    if (!session) {
      router.replace('/')
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
    return () => {
      mounted = false
    }
  }, [session, router])

  // ── Run OpenAI analysis
  const runAnalysis = useCallback(async (file: File) => {
    setFlowState('analyzing')
    setAiError('')
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/food/suggest', { method: 'POST', body: formData })
      const data = await res.json()

      if (data.error) {
        setAiError('Photo analysis failed. You can type the dish name below.')
        setFlowState('analysis_error')
        return
      }

      const result = parseAiResponse(data as Record<string, unknown>)
      setAiResult(result)

      // Auto-select when confidence is high (≥ 0.85)
      if (result.dish && (result.confidence ?? 0) >= 0.85) {
        setSelectedDish(result.dish)
      }

      setFlowState('analysis_success')
    } catch {
      setAiError('Could not analyze this photo.')
      setFlowState('analysis_error')
    }
  }, [])

  // ── Handle file pick — with HEIC conversion
  const handleFilePicked = useCallback(async (file: File | null) => {
    if (!file) return

    // Reset dish + location state
    setSelectedDish(null)
    setCustomDish('')
    setEditingDish(false)
    setSelectedPlace(null)
    setQuery('')
    setAiResult(emptyAiResult)
    setAiError('')

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)

    let processedFile = file

    if (isHeic(file)) {
      setFlowState('converting_image')
      try {
        processedFile = await convertHeicToJpeg(file)
      } catch {
        setAiError('Could not read this image format. Please try a JPEG or PNG.')
        setFlowState('analysis_error')
        return
      }
    }

    setSelectedFile(processedFile)
    setPreviewUrl(URL.createObjectURL(processedFile))
    await runAnalysis(processedFile)
  }, [previewUrl, runAnalysis])

  const fetchPredictions = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setPredictions([])
        setShowDropdown(false)
        return
      }

      setSearching(true)
      try {
        const res = await fetch('/api/places/autocomplete', {
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
    try {
      const res = await fetch('/api/places/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: prediction.placeId }),
      })
      const data = await res.json()
      if (data.error) setError(`Could not load place details: ${data.error}`)
      else setSelectedPlace(data)
    } catch {
      setError('Failed to load place details. Please try again.')
    } finally {
      setLoadingDetails(false)
    }
  }

  const clearPlace = () => { setSelectedPlace(null); setQuery(''); setPredictions([]) }

  // ── Resolve dish name to a food_categories row (create if needed)
  const resolveCategoryId = async (): Promise<string | null> => {
    if (!session) return null
    const dishName = (customDish.trim() || selectedDish || '').trim()
    if (!dishName) return null

    const match = categories.find((c) => c.name.toLowerCase() === dishName.toLowerCase())
    if (match) return match.id

    const { data: existing } = await supabase
      .from('food_categories')
      .select('id')
      .eq('group_id', session.groupId)
      .ilike('name', dishName)
      .maybeSingle()

    if (existing?.id) return existing.id

    const { data: inserted, error: insertErr } = await supabase
      .from('food_categories')
      .insert({
        name: dishName,
        group_id: session.groupId,
        created_by_member_id: session.memberId,
      })
      .select('id, name')
      .single()

    if (inserted?.id) {
      setCategories((prev) => {
        if (prev.some((cat) => cat.id === inserted.id)) return prev
        return [...prev, { id: inserted.id, name: inserted.name }].sort((a, b) => a.name.localeCompare(b.name))
      })
      return inserted.id
    }

    if (insertErr) {
      const { data: duplicate } = await supabase
        .from('food_categories')
        .select('id')
        .eq('group_id', session.groupId)
        .ilike('name', dishName)
        .maybeSingle()

      return duplicate?.id ?? null
    }

    return null
  }

  const handleSave = async () => {
    setError('')
    setFailedStage('')

    if (!session?.memberId || !session?.groupId) {
      setError('Session missing. Please log in again.')
      return
    }

    if (!selectedPlace) {
      setError('Please search for and select a place.')
      return
    }

    const categoryId = await resolveCategoryId()
    if (!categoryId) {
      setError('Please confirm the dish before saving.')
      return
    }

    setSaving(true)

    try {
      let placeId: string
      let existingPhotoUrls: string[] = []

      const { data: existing, error: lookupError } = await supabase
        .from('places')
        .select('id, photo_urls, lat, lng')
        .eq('google_place_id', selectedPlace.google_place_id)
        .maybeSingle()

      if (lookupError) {
        setFailedStage('Failed at place lookup')
        throw new Error(`Failed at place lookup: ${lookupError.message}`)
      }

      if (existing) {
        placeId = existing.id
        existingPhotoUrls = existing.photo_urls ?? []

        if ((existing.lat == null || existing.lng == null) && selectedPlace.lat != null && selectedPlace.lng != null) {
          await supabase.from('places').update({ lat: selectedPlace.lat, lng: selectedPlace.lng }).eq('id', placeId)
        }
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('places')
          .insert({
            google_place_id: selectedPlace.google_place_id,
            name: selectedPlace.name,
            formatted_address: selectedPlace.formatted_address,
            lat: selectedPlace.lat,
            lng: selectedPlace.lng,
            photo_urls: [],
          })
          .select('id')
          .single()

        if (insertError || !inserted) {
          setFailedStage('Failed at place insert')
          throw new Error(`Failed at place insert: ${insertError?.message ?? 'no data returned'}`)
        }

        placeId = inserted.id
      }

      const newPhotoUrls: string[] = []
      if (selectedFile) {
        const ext = selectedFile.name.split('.').pop() ?? 'jpg'
        const path = `${placeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('nearby-place-photos')
          .upload(path, selectedFile, { upsert: false })

        if (uploadError) {
          setFailedStage('Failed at photo upload')
          throw new Error(`Failed at photo upload: ${uploadError.message}`)
        }

        const { data: urlData } = supabase.storage.from('nearby-place-photos').getPublicUrl(path)
        newPhotoUrls.push(urlData.publicUrl)
      }

      if (newPhotoUrls.length > 0) {
        const merged = [...new Set([...existingPhotoUrls, ...newPhotoUrls])]
        const { error: updateError } = await supabase
          .from('places')
          .update({ photo_urls: merged })
          .eq('id', placeId)

        if (updateError) {
          setFailedStage('Failed at place photo update')
          throw new Error(`Failed at place photo update: ${updateError.message}`)
        }
      }

      const { error: recError } = await supabase.from('recommendations').insert({
        group_id: session.groupId,
        member_id: session.memberId,
        place_id: placeId,
        note: note.trim() || null,
      })

      if (recError) {
        setFailedStage('Failed at recommendation insert')
        throw new Error(`Failed at recommendation insert: ${recError.message}`)
      }

      const { error: placeCatError } = await supabase
        .from('place_categories')
        .upsert({ place_id: placeId, category_id: categoryId }, { onConflict: 'place_id,category_id' })

      if (placeCatError) {
        setFailedStage('Failed at category link')
        throw new Error(`Failed at category link: ${placeCatError.message}`)
      }

      router.push('/nearby')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
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
  const isMediumConf = !isHighConf && confidence !== null && confidence >= 0.6

  const chips = [
    ...(aiResult.dish ? [aiResult.dish] : []),
    ...aiResult.suggestions.filter((s) => s !== aiResult.dish),
  ].slice(0, 5)

  const mapEmbedSrc = selectedPlace
    ? selectedPlace.lat != null && selectedPlace.lng != null
      ? `https://www.google.com/maps?q=${selectedPlace.lat},${selectedPlace.lng}&z=15&output=embed`
      : selectedPlace.formatted_address
      ? `https://www.google.com/maps?q=${encodeURIComponent(selectedPlace.formatted_address)}&output=embed`
      : null
    : null

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-neutral-50 pb-28" style={{ overflowX: 'hidden', maxWidth: '100vw' }}>
      <div className="mx-auto w-full max-w-md px-4 pt-5 box-border">

        <button
          onClick={() => router.back()}
          disabled={isBlocking}
          className="mb-5 text-sm text-neutral-500 hover:text-neutral-800 transition-colors disabled:opacity-40"
        >
          ← Back
        </button>

        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Add Food Spot</h1>
        <p className="mt-1 text-sm text-neutral-500">Start with a photo.</p>

        <div className="mt-5 space-y-4">

          {/* ── Photo section ──────────────────────────────────────── */}
          <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
            {!isBlocking && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="rounded-2xl border border-neutral-200 bg-neutral-900 px-3 py-3 text-left text-white transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h3l2-2h6l2 2h3v12H4z" /><circle cx="12" cy="13" r="4" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold">{hasPhoto ? 'Retake' : 'Take Photo'}</p>
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
                  <p className="text-sm font-semibold">{hasPhoto ? 'Replace' : 'Choose Photo'}</p>
                </button>
              </div>
            )}

            {/* Hidden file inputs — HEIC/HEIF accepted explicitly */}
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

            {previewUrl && (
              <div className={`${!isBlocking ? 'mt-4' : ''} w-full`}>
                <img
                  src={previewUrl}
                  alt="Food preview"
                  className="w-full rounded-2xl border border-neutral-200 object-cover"
                  style={{ maxWidth: '100%', maxHeight: '240px', display: 'block' }}
                />
              </div>
            )}
          </section>

          {/* ── Dish section ───────────────────────────────────────── */}
          {(flowState === 'analysis_success' || flowState === 'analysis_error') && (
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">

              {flowState === 'analysis_error' && (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">Dish</p>
                  {aiError && <p className="mb-3 text-sm text-amber-700">{aiError}</p>}
                  <input
                    type="text"
                    value={customDish}
                    onChange={(e) => { setCustomDish(e.target.value); setSelectedDish(null) }}
                    placeholder="Type dish name"
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-600 min-w-0 box-border"
                  />
                </>
              )}

              {flowState === 'analysis_success' && (
                <>
                  {/* High confidence — auto-selected, show with edit option */}
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

                  {/* Medium confidence — show chips for quick confirmation */}
                  {!isHighConf && isMediumConf && !editingDish && (
                    <>
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-3">What is this dish?</p>
                      <div className="flex flex-wrap gap-2">
                        {chips.map((name, idx) => (
                          <button
                            key={`chip-med-${idx}`}
                            onClick={() => { setSelectedDish(name); setCustomDish('') }}
                            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all min-w-0 ${
                              selectedDish === name
                                ? 'bg-neutral-900 text-white'
                                : idx === 0
                                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                            }`}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                      {!selectedDish && (
                        <input
                          type="text"
                          value={customDish}
                          onChange={(e) => { setCustomDish(e.target.value); setSelectedDish(null) }}
                          placeholder="Something else?"
                          className="mt-3 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-neutral-600 min-w-0 box-border"
                        />
                      )}
                    </>
                  )}

                  {/* Low confidence — manual entry with optional chips */}
                  {!isHighConf && !isMediumConf && !editingDish && (
                    <>
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-3">Help us choose the closest dish</p>
                      {chips.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {chips.map((name, idx) => (
                            <button
                              key={`chip-low-${idx}`}
                              onClick={() => { setSelectedDish(name); setCustomDish('') }}
                              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all min-w-0 ${
                                selectedDish === name
                                  ? 'bg-neutral-900 text-white'
                                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                              }`}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                      <input
                        type="text"
                        value={customDish}
                        onChange={(e) => { setCustomDish(e.target.value); setSelectedDish(null) }}
                        placeholder="Type dish name"
                        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-600 min-w-0 box-border"
                      />
                    </>
                  )}

                  {/* Edit mode — overrides high-confidence auto-select */}
                  {editingDish && (
                    <>
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-3">Edit dish</p>
                      {chips.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {chips.map((name, idx) => (
                            <button
                              key={`chip-edit-${idx}`}
                              onClick={() => { setSelectedDish(name); setCustomDish(''); setEditingDish(false) }}
                              className="rounded-full px-3 py-1.5 text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all min-w-0"
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                      <input
                        type="text"
                        defaultValue={customDish || selectedDish || ''}
                        onChange={(e) => { setCustomDish(e.target.value); setSelectedDish(null) }}
                        placeholder="Dish name"
                        autoFocus
                        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-600 min-w-0 box-border"
                      />
                      {customDish.trim() && (
                        <button
                          onClick={() => { setSelectedDish(customDish.trim()); setCustomDish(''); setEditingDish(false) }}
                          className="mt-2 text-xs text-neutral-500 underline"
                        >
                          Confirm
                        </button>
                      )}
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
                        {selectedPlace.formatted_address && (
                          <p className="mt-0.5 text-xs text-neutral-600 break-words">{selectedPlace.formatted_address}</p>
                        )}
                        {typeof selectedPlace.rating === 'number' && (
                          <p className="mt-1 text-xs text-neutral-500">⭐ {selectedPlace.rating.toFixed(1)}</p>
                        )}
                      </div>
                      <button onClick={clearPlace} className="shrink-0 text-neutral-400 hover:text-neutral-700 text-lg leading-none">×</button>
                    </div>
                  </div>

                  {mapEmbedSrc ? (
                    <iframe
                      title="Place map preview"
                      width="100%"
                      height="180"
                      style={{ border: 0, borderRadius: '12px', maxWidth: '100%', display: 'block' }}
                      loading="lazy"
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

          {/* ── Error ───────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              {failedStage && <p className="text-xs font-semibold uppercase tracking-wide text-red-500">{failedStage}</p>}
              <p className="text-sm text-red-700 break-words">{error}</p>
            </div>
          )}

          {/* ── Save button ─────────────────────────────────────────── */}
          {isDishConfirmed && (
            <button
              onClick={handleSave}
              disabled={saving || loadingDetails || isBlocking}
              className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition-all duration-300 hover:opacity-95 disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save food spot'}
            </button>
          )}

        </div>
      </div>

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
    </main>
  )
}
