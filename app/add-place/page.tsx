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
  userRatingCount?: number | null
}

type PlaceDetails = {
  google_place_id: string
  name: string
  formatted_address: string | null
  lat: number | null
  lng: number | null
  primary_type: string | null
  rating: number | null
  user_rating_count: number | null
  map_preview_url: string | null
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

  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const [note, setNote] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<FoodSuggestResult>(emptySuggestion)
  const [aiError, setAiError] = useState('')

  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedSuggestionName, setSelectedSuggestionName] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [failedStage, setFailedStage] = useState('')

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setUserCoords(null)
      },
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
      if (data.error) {
        setError(`Could not load place details: ${data.error}`)
      } else {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    setAiSuggestion(emptySuggestion)
    setSelectedSuggestionName(null)
    setAiError('')

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (file) {
      setPreviewUrl(URL.createObjectURL(file))
    } else {
      setPreviewUrl(null)
    }
  }

  useEffect(() => {
    if (!selectedFile) {
      setIsAnalyzing(false)
      return
    }

    let cancelled = false
    const run = async () => {
      setIsAnalyzing(true)
      setAiError('')

      try {
        const formData = new FormData()
        formData.append('image', selectedFile)

        const res = await fetch('/api/food/suggest', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()

        if (cancelled) return

        if (data.error) {
          setAiSuggestion(emptySuggestion)
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
        if (normalized.primarySuggestion) {
          setSelectedSuggestionName(normalized.primarySuggestion)
          setSelectedCategoryId(null)
          setNewCategoryName('')
        }
      } catch {
        if (cancelled) return
        setAiSuggestion(emptySuggestion)
        setAiError('Could not analyze this photo. You can still choose category manually.')
      } finally {
        if (!cancelled) setIsAnalyzing(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [selectedFile])

  const handleSelectExistingCategory = (id: string) => {
    setSelectedCategoryId((prev) => (prev === id ? null : id))
    setSelectedSuggestionName(null)
    setNewCategoryName('')
  }

  const handleSelectSuggestion = (name: string) => {
    setSelectedSuggestionName((prev) => (prev === name ? null : name))
    setSelectedCategoryId(null)
    setNewCategoryName('')
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

  const suggestionChips = [
    ...(aiSuggestion.primarySuggestion ? [aiSuggestion.primarySuggestion] : []),
    ...aiSuggestion.alternativeSuggestions.filter((name) => name !== aiSuggestion.primarySuggestion),
  ]

  const mapEmbedSrc = selectedPlace
    ? selectedPlace.lat != null && selectedPlace.lng != null
      ? `https://www.google.com/maps?q=${selectedPlace.lat},${selectedPlace.lng}&z=15&output=embed`
      : selectedPlace.formatted_address
      ? `https://www.google.com/maps?q=${encodeURIComponent(selectedPlace.formatted_address)}&output=embed`
      : null
    : null

  return (
    <main className="min-h-screen bg-neutral-50 p-5 pb-24">
      <div className="max-w-md mx-auto">
        <button onClick={() => router.back()} className="mb-5 text-sm text-neutral-500 hover:text-neutral-800 transition-colors">
          ← Back
        </button>

        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Add place</h1>
        <p className="mt-1 text-sm text-neutral-500">Smart capture for your next food recommendation.</p>

        <div className="mt-6 space-y-4">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all duration-300 ease-out">
            <label className="block text-sm font-medium text-neutral-800 mb-2">Search for a place</label>
            {!selectedPlace ? (
              <div className="relative" ref={dropdownRef}>
                <input
                  type="text"
                  value={query}
                  onChange={handleQueryChange}
                  onFocus={() => predictions.length > 0 && setShowDropdown(true)}
                  placeholder="Start with the place name"
                  autoComplete="off"
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-neutral-600 focus:shadow-[0_0_0_3px_rgba(20,20,20,0.06)]"
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
                          {typeof p.rating === 'number' && (
                            <span className="shrink-0 text-xs text-neutral-500">⭐ {p.rating.toFixed(1)}</span>
                          )}
                        </div>
                        {p.secondaryText && <p className="mt-0.5 text-xs text-neutral-500 truncate">{p.secondaryText}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 transition-all duration-300">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{selectedPlace.name}</p>
                      {selectedPlace.formatted_address && (
                        <p className="mt-0.5 text-xs text-neutral-600 leading-snug">{selectedPlace.formatted_address}</p>
                      )}
                      {typeof selectedPlace.rating === 'number' && (
                        <p className="mt-1 text-xs text-neutral-500">⭐ {selectedPlace.rating.toFixed(1)}</p>
                      )}
                    </div>
                    <button onClick={clearSelection} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none">×</button>
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-200 overflow-hidden bg-white">
                  <div className="px-3 py-2 border-b border-neutral-100">
                    <p className="text-xs font-medium text-neutral-700">Verify this place</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5">Make sure this map preview matches your selected location.</p>
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
                    <div className="h-28 grid place-items-center text-xs text-neutral-400">Map preview unavailable for this place</div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all duration-300 ease-out">
            <label className="block text-sm font-medium text-neutral-800 mb-1">Take or choose photo</label>
            <p className="text-xs text-neutral-500 mb-3">Take a quick food shot or choose from your gallery.</p>
            <p className="text-xs font-medium text-neutral-700 mb-2">Add food photo</p>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700"
            />

            {previewUrl && (
              <div className="mt-3 space-y-3 transition-all duration-300 ease-out">
                <img src={previewUrl} alt="Food preview" className="h-48 w-full rounded-xl border border-neutral-200 object-cover" />
                <p className={`text-xs text-neutral-500 transition-opacity duration-300 ${isAnalyzing ? 'opacity-100' : 'opacity-0'}`}>
                  Analyzing your photo...
                </p>
                {aiError && <p className="text-xs text-amber-700">{aiError}</p>}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all duration-300 ease-out">
            <label className="block text-sm font-medium text-neutral-800 mb-2">What food is this?</label>

            {aiSuggestion.containsMultipleFoods && (
              <p className="mb-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700">Multiple dishes detected</p>
            )}

            {suggestionChips.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {suggestionChips.map((name, idx) => (
                  <button
                    key={`${name}-${idx}`}
                    onClick={() => handleSelectSuggestion(name)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                      selectedSuggestionName === name
                        ? 'bg-teal-600 text-white shadow-sm scale-[1.02]'
                        : idx === 0
                        ? 'bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {name}
                    {idx === 0 && ' (AI top pick)'}
                  </button>
                ))}
              </div>
            )}

            {aiSuggestion.detectedTextHints.length > 0 && (
              <p className="mb-3 text-xs text-neutral-500">Detected text hints: {aiSuggestion.detectedTextHints.join(' • ')}</p>
            )}

            {categories.length > 0 && (
              <div className="mb-3">
                <p className="mb-2 text-xs font-medium text-neutral-700">Loved by your group</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectExistingCategory(cat.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedCategoryId === cat.id
                          ? 'bg-neutral-900 text-white shadow-sm scale-[1.02]'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-medium text-neutral-700">Add new category</p>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => {
                  setNewCategoryName(e.target.value)
                  setSelectedCategoryId(null)
                  setSelectedSuggestionName(null)
                }}
                placeholder="e.g. Hokkien Mee"
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-all duration-200 focus:border-neutral-600"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all duration-300 ease-out">
            <label className="block text-sm font-medium text-neutral-800 mb-2">Why is this place good?</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What makes it worth visiting..."
              rows={3}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none resize-none transition-all duration-200 focus:border-neutral-600"
            />
          </section>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-1 transition-all duration-300">
              {failedStage && <p className="text-xs font-semibold text-red-500 uppercase tracking-wide">{failedStage}</p>}
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || loadingDetails}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition-all duration-300 hover:opacity-95 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save place'}
          </button>
        </div>
      </div>
    </main>
  )
}
