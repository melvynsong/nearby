'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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

type FoodSuggestResult = {
  primarySuggestion: string | null
  alternativeSuggestions: string[]
  detectedTextHints: string[]
  containsMultipleFoods: boolean
  reasoningShort: string
}

const emptySuggestion: FoodSuggestResult = {
  primarySuggestion: null,
  alternativeSuggestions: [],
  detectedTextHints: [],
  containsMultipleFoods: false,
  reasoningShort: '',
}

const broadCategories = [
  'Chicken Rice',
  'Western Food',
  'Indian Food',
  'Malay Food',
  'Seafood',
  'Cafe / Dessert',
  'Hotpot',
  'Japanese',
  'Korean',
  'Halal',
  'Vegetarian',
  'Drinks / Bubble Tea',
  'Other',
]

function mapHintToCategory(text: string): string | null {
  const x = text.toLowerCase()
  if (x.includes('chicken rice')) return 'Chicken Rice'
  if (x.includes('korean') || x.includes('kimchi') || x.includes('tteokbokki')) return 'Korean'
  if (x.includes('japanese') || x.includes('ramen') || x.includes('sushi') || x.includes('donburi')) return 'Japanese'
  if (x.includes('western') || x.includes('pasta') || x.includes('steak') || x.includes('burger')) return 'Western Food'
  if (x.includes('biryani') || x.includes('naan') || x.includes('curry') || x.includes('indian')) return 'Indian Food'
  if (x.includes('nasi lemak') || x.includes('satay') || x.includes('rendang') || x.includes('malay')) return 'Malay Food'
  if (x.includes('seafood') || x.includes('crab') || x.includes('prawn') || x.includes('fish')) return 'Seafood'
  if (x.includes('dessert') || x.includes('cake') || x.includes('ice cream') || x.includes('cafe')) return 'Cafe / Dessert'
  if (x.includes('hotpot') || x.includes('steamboat')) return 'Hotpot'
  if (x.includes('halal')) return 'Halal'
  if (x.includes('vegetarian') || x.includes('vegan')) return 'Vegetarian'
  if (x.includes('bubble tea') || x.includes('boba') || x.includes('drink') || x.includes('coffee') || x.includes('tea')) return 'Drinks / Bubble Tea'
  return null
}

function categoryCandidatesFromAi(result: FoodSuggestResult): string[] {
  const inputs = [result.primarySuggestion, ...result.alternativeSuggestions].filter(Boolean) as string[]
  const mapped = inputs.map(mapHintToCategory).filter(Boolean) as string[]
  const uniq = [...new Set(mapped)]
  if (uniq.length >= 5) return uniq.slice(0, 5)

  for (const fallback of broadCategories) {
    if (!uniq.includes(fallback)) uniq.push(fallback)
    if (uniq.length >= 5) break
  }

  return uniq
}

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

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<FoodSuggestResult>(emptySuggestion)
  const [aiError, setAiError] = useState('')
  const [showSuggestionSheet, setShowSuggestionSheet] = useState(false)

  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedSuggestionName, setSelectedSuggestionName] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')

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

  const runAutoAnalysis = useCallback(async (file: File) => {
    setIsAnalyzing(true)
    setAiError('')
    setAiSuggestion(emptySuggestion)

    try {
      const formData = new FormData()
      formData.append('image', file)

      const res = await fetch('/api/food/suggest', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (data.error) {
        setAiError('Could not analyze this photo. You can still choose category manually.')
        return
      }

      const normalized: FoodSuggestResult = {
        primarySuggestion: typeof data.primarySuggestion === 'string' ? data.primarySuggestion : null,
        alternativeSuggestions: Array.isArray(data.alternativeSuggestions) ? data.alternativeSuggestions : [],
        detectedTextHints: Array.isArray(data.detectedTextHints) ? data.detectedTextHints : [],
        containsMultipleFoods: Boolean(data.containsMultipleFoods),
        reasoningShort: typeof data.reasoningShort === 'string' ? data.reasoningShort : '',
      }

      setAiSuggestion(normalized)
      setShowSuggestionSheet(true)
    } catch {
      setAiError('Could not analyze this photo. You can still choose category manually.')
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  const handleFilePicked = async (file: File | null) => {
    setSelectedFile(file)
    setSelectedSuggestionName(null)
    setSelectedCategoryId(null)
    setSelectedPlace(null)
    setQuery('')

    if (previewUrl) URL.revokeObjectURL(previewUrl)

    if (!file) {
      setPreviewUrl(null)
      return
    }

    setPreviewUrl(URL.createObjectURL(file))
    await runAutoAnalysis(file)
  }

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
      else {
        setSelectedPlace(data)
      }
    } catch {
      setError('Failed to load place details. Please try again.')
    } finally {
      setLoadingDetails(false)
    }
  }

  const clearSelection = () => {
    setSelectedPlace(null)
    setQuery('')
    setPredictions([])
  }

  const handleSelectExistingCategory = (id: string) => {
    setSelectedCategoryId((prev) => (prev === id ? null : id))
    setSelectedSuggestionName(null)
    setNewCategoryName('')
  }

  const handleSelectSuggestion = (name: string) => {
    setSelectedSuggestionName((prev) => (prev === name ? null : name))
    setSelectedCategoryId(null)
    setNewCategoryName('')
    setShowSuggestionSheet(false)
  }

  const resolveCategoryId = async (): Promise<string | null> => {
    if (!session) return null
    if (selectedCategoryId) return selectedCategoryId

    const proposedName = (newCategoryName || selectedSuggestionName || '').trim()
    if (!proposedName) return null

    const { data: existing } = await supabase
      .from('food_categories')
      .select('id')
      .eq('group_id', session.groupId)
      .ilike('name', proposedName)
      .maybeSingle()

    if (existing?.id) return existing.id

    const { data: inserted, error: insertErr } = await supabase
      .from('food_categories')
      .insert({
        name: proposedName,
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
        .ilike('name', proposedName)
        .maybeSingle()

      return duplicate?.id ?? null
    }

    return null
  }

  const isCategoryChosen = Boolean(selectedCategoryId || selectedSuggestionName || newCategoryName.trim())

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
      setError('Please confirm a food category before saving.')
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

  if (!session) return null

  const aiCandidates = categoryCandidatesFromAi(aiSuggestion)

  const mapEmbedSrc = selectedPlace
    ? selectedPlace.lat != null && selectedPlace.lng != null
      ? `https://www.google.com/maps?q=${selectedPlace.lat},${selectedPlace.lng}&z=15&output=embed`
      : selectedPlace.formatted_address
      ? `https://www.google.com/maps?q=${encodeURIComponent(selectedPlace.formatted_address)}&output=embed`
      : null
    : null

  return (
    <main className="min-h-screen bg-neutral-50 p-5 pb-28">
      <div className="mx-auto max-w-md">
        <button onClick={() => router.back()} className="mb-5 text-sm text-neutral-500 hover:text-neutral-800 transition-colors">
          ← Back
        </button>

        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Add Food Spot</h1>
        <p className="mt-1 text-sm text-neutral-500">Start with a photo.</p>

        <div className="mt-5 space-y-4">
          <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm transition-all duration-300">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Step 1 · Add a food photo</p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="rounded-2xl border border-neutral-200 bg-neutral-900 px-3 py-3 text-left text-white transition-transform duration-200 hover:scale-[1.01]"
              >
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h3l2-2h6l2 2h3v12H4z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <p className="text-sm font-semibold">Take Food Photo</p>
              </button>

              <button
                onClick={() => galleryInputRef.current?.click()}
                className="rounded-2xl border border-neutral-200 bg-neutral-100 px-3 py-3 text-left text-neutral-800 transition-transform duration-200 hover:scale-[1.01]"
              >
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <circle cx="8.5" cy="9" r="1.5" />
                    <path d="M21 16l-5-5L5 20" />
                  </svg>
                </div>
                <p className="text-sm font-semibold">Choose from Gallery</p>
              </button>
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void handleFilePicked(e.target.files?.[0] ?? null)}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleFilePicked(e.target.files?.[0] ?? null)}
            />

            {previewUrl && (
              <div className="mt-4 transition-all duration-300">
                <img src={previewUrl} alt="Food preview" className="h-56 w-full rounded-2xl border border-neutral-200 object-cover" />
                <p className={`mt-2 text-xs text-neutral-500 transition-opacity duration-300 ${isAnalyzing ? 'opacity-100' : 'opacity-0'}`}>
                  Analyzing your photo...
                </p>
                {aiError && <p className="mt-1 text-xs text-amber-700">{aiError}</p>}
              </div>
            )}
          </section>

          <section className={`rounded-3xl border p-4 shadow-sm transition-all duration-300 ${isCategoryChosen ? 'border-neutral-200 bg-white' : 'border-neutral-200 bg-neutral-100/70'}`}>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Step 2 · Choose category</p>
            <h2 className="text-sm font-semibold text-neutral-900">Suggested food categories</h2>

            {aiCandidates.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {aiCandidates.map((name, idx) => (
                  <button
                    key={`${name}-${idx}`}
                    onClick={() => handleSelectSuggestion(name)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                      selectedSuggestionName === name
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : idx === 0
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    {name}
                    {idx === 0 ? ' · Top pick' : ''}
                  </button>
                ))}
              </div>
            )}

            {categories.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs text-neutral-500">Used by your group</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectExistingCategory(cat.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedCategoryId === cat.id
                          ? 'bg-neutral-900 text-white'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => {
                  setNewCategoryName(e.target.value)
                  setSelectedCategoryId(null)
                  setSelectedSuggestionName(null)
                }}
                placeholder="Or add your own category"
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-500"
              />
            </div>
          </section>

          <section className={`rounded-3xl border p-4 shadow-sm transition-all duration-300 ${isCategoryChosen ? 'border-neutral-200 bg-white' : 'border-neutral-200 bg-neutral-100/70'}`}>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Step 3 · Where is this place?</p>

            {!isCategoryChosen ? (
              <p className="text-sm text-neutral-500">Choose a category first to continue.</p>
            ) : selectedPlace ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{selectedPlace.name}</p>
                      {selectedPlace.formatted_address && (
                        <p className="mt-0.5 text-xs text-neutral-600">{selectedPlace.formatted_address}</p>
                      )}
                      {typeof selectedPlace.rating === 'number' && (
                        <p className="mt-1 text-xs text-neutral-500">⭐ {selectedPlace.rating.toFixed(1)}</p>
                      )}
                    </div>
                    <button onClick={clearSelection} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none">×</button>
                  </div>
                </div>

                {mapEmbedSrc ? (
                  <iframe
                    title="Place map preview"
                    width="100%"
                    height="180"
                    style={{ border: 0, borderRadius: '12px' }}
                    loading="lazy"
                    src={mapEmbedSrc}
                  />
                ) : (
                  <div className="h-24 grid place-items-center rounded-xl border border-neutral-200 text-xs text-neutral-400">
                    Map preview unavailable for this place.
                  </div>
                )}
              </div>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <input
                  type="text"
                  value={query}
                  onChange={handleQueryChange}
                  onFocus={() => predictions.length > 0 && setShowDropdown(true)}
                  placeholder="Search place name or address"
                  autoComplete="off"
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-600"
                />
                {searching && <p className="mt-2 text-xs text-neutral-400">Searching places...</p>}
                {loadingDetails && <p className="mt-2 text-xs text-neutral-400">Loading place details...</p>}

                {showDropdown && predictions.length > 0 && (
                  <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
                    {predictions.map((p) => (
                      <button
                        key={p.placeId}
                        onClick={() => handleSelectPrediction(p)}
                        className="w-full border-b border-neutral-100 px-4 py-3 text-left transition-colors hover:bg-neutral-50 last:border-b-0"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-neutral-900">{p.text}</p>
                          {typeof p.rating === 'number' && <span className="text-xs text-neutral-500">⭐ {p.rating.toFixed(1)}</span>}
                        </div>
                        {p.secondaryText && <p className="mt-0.5 truncate text-xs text-neutral-500">{p.secondaryText}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={`rounded-3xl border p-4 shadow-sm transition-all duration-300 ${isCategoryChosen ? 'border-neutral-200 bg-white' : 'border-neutral-200 bg-neutral-100/70'}`}>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Step 4 · Add a note</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What should people know about this place?"
              rows={3}
              className="w-full resize-none rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-600"
              disabled={!isCategoryChosen}
            />
          </section>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              {failedStage && <p className="text-xs font-semibold uppercase tracking-wide text-red-500">{failedStage}</p>}
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || loadingDetails || !isCategoryChosen}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition-all duration-300 hover:opacity-95 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save food spot'}
          </button>
        </div>
      </div>

      {showSuggestionSheet && aiCandidates.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/35" onClick={() => setShowSuggestionSheet(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 mx-auto max-w-md rounded-t-3xl border border-neutral-200 bg-white p-5 shadow-xl transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">What does this look like?</p>
            <h3 className="mt-1 text-lg font-semibold text-neutral-900">Suggested food categories</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {aiCandidates.map((name, idx) => (
                <button
                  key={`${name}-sheet-${idx}`}
                  onClick={() => handleSelectSuggestion(name)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    idx === 0
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowSuggestionSheet(false)}
              className="mt-4 text-sm text-neutral-500 underline"
            >
              Not right? Choose another
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
