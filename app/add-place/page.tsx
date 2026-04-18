'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

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
}

type PlaceDetails = {
  google_place_id: string
  name: string
  formatted_address: string | null
  lat: number | null
  lng: number | null
  primary_type: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddPlace() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)

  // Search state
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  // Form state
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [failedStage, setFailedStage] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = localStorage.getItem('nearby_session')
    if (!raw) { router.replace('/'); return }
    setSession(JSON.parse(raw))
  }, [router])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Autocomplete ─────────────────────────────────────────────────────────────

  const fetchPredictions = useCallback(async (q: string) => {
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
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      if (data.predictions) {
        setPredictions(data.predictions)
        setShowDropdown(data.predictions.length > 0)
      } else {
        console.error('[autocomplete] error response:', data)
        setPredictions([])
        setShowDropdown(false)
      }
    } catch (err) {
      console.error('[autocomplete] fetch failed:', err)
      setPredictions([])
    } finally {
      setSearching(false)
    }
  }, [])

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    setSelectedPlace(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPredictions(val), 350)
  }

  // ── Place selection ───────────────────────────────────────────────────────────

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
        console.error('[details] API error:', data.error)
        setError(`Could not load place details: ${data.error}`)
      } else {
        setSelectedPlace(data)
      }
    } catch (err) {
      console.error('[details] fetch failed:', err)
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

  // ── File handling ─────────────────────────────────────────────────────────────

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    setFiles(selected)
    setPreviews(selected.map((f) => URL.createObjectURL(f)))
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

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

    setSaving(true)

    try {
      // ── Step 1: find or create place by google_place_id ────────────────────
      console.log('[Step 1] looking up place by google_place_id:', selectedPlace.google_place_id)
      let placeId: string
      let existingPhotoUrls: string[] = []

      const { data: existing, error: lookupError } = await supabase
        .from('places')
        .select('id, photo_urls, lat, lng')
        .eq('google_place_id', selectedPlace.google_place_id)
        .maybeSingle()

      if (lookupError) {
        console.error('[Step 1] lookup error:', lookupError)
        setFailedStage('Failed at place lookup')
        throw new Error(`Failed at place lookup: ${lookupError.message}`)
      }

      if (existing) {
        console.log('[Step 1] existing place found:', existing.id)
        placeId = existing.id
        existingPhotoUrls = existing.photo_urls ?? []

        // Backfill lat/lng if missing
        if ((existing.lat == null || existing.lng == null) && selectedPlace.lat != null) {
          console.log('[Step 1] backfilling lat/lng on existing place')
          await supabase
            .from('places')
            .update({ lat: selectedPlace.lat, lng: selectedPlace.lng })
            .eq('id', placeId)
        }
      } else {
        console.log('[Step 1] inserting new place:', selectedPlace.name)
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
          console.error('[Step 1] insert error:', insertError)
          setFailedStage('Failed at place insert')
          throw new Error(`Failed at place insert: ${insertError?.message ?? 'no data returned'}`)
        }
        placeId = inserted.id
        console.log('[Step 1] new place inserted:', placeId)
      }

      // ── Step 2: upload photos ──────────────────────────────────────────────
      const newPhotoUrls: string[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const ext = file.name.split('.').pop()
        const path = `${placeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        console.log(`[Step 2] uploading photo ${i + 1}/${files.length}:`, path)
        const { error: uploadError } = await supabase.storage
          .from('nearby-place-photos')
          .upload(path, file, { upsert: false })

        if (uploadError) {
          console.error(`[Step 2] upload error (file ${i + 1}):`, uploadError)
          setFailedStage('Failed at photo upload')
          throw new Error(`Failed at photo upload: ${uploadError.message}`)
        }

        const { data: urlData } = supabase.storage
          .from('nearby-place-photos')
          .getPublicUrl(path)

        console.log(`[Step 2] photo ${i + 1} URL:`, urlData.publicUrl)
        newPhotoUrls.push(urlData.publicUrl)
      }

      // ── Step 3: merge + update photo_urls ─────────────────────────────────
      if (newPhotoUrls.length > 0) {
        const merged = [...new Set([...existingPhotoUrls, ...newPhotoUrls])]
        console.log('[Step 3] updating photo_urls, total:', merged.length)
        const { error: updateError } = await supabase
          .from('places')
          .update({ photo_urls: merged })
          .eq('id', placeId)

        if (updateError) {
          console.error('[Step 3] photo_urls update error:', updateError)
          setFailedStage('Failed at place photo update')
          throw new Error(`Failed at place photo update: ${updateError.message}`)
        }
        console.log('[Step 3] photo_urls updated')
      }

      // ── Step 4: insert recommendation ─────────────────────────────────────
      console.log('[Step 4] inserting recommendation for place:', placeId)
      const { error: recError } = await supabase
        .from('recommendations')
        .insert({
          group_id: session.groupId,
          member_id: session.memberId,
          place_id: placeId,
          note: note.trim() || null,
        })

      if (recError) {
        console.error('[Step 4] recommendation insert error:', recError)
        setFailedStage('Failed at recommendation insert')
        throw new Error(`Failed at recommendation insert: ${recError.message}`)
      }
      console.log('[Step 4] recommendation inserted')

      router.push('/nearby')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Check the browser console.'
      console.error('[AddPlace] save failed:', err)
      setError(message)
      setSaving(false)
    }
  }

  if (!session) return null

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-md mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-6 text-sm text-neutral-500 hover:text-neutral-800"
        >
          ← Back
        </button>

        <h1 className="text-2xl font-semibold text-neutral-900 mb-6">Add a place</h1>

        <div className="rounded-2xl bg-white border border-neutral-200 p-6 shadow-sm space-y-5">

          {/* ── Search ────────────────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-2">
              Search for a place
            </label>

            {selectedPlace ? (
              // Selected place chip
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{selectedPlace.name}</p>
                  {selectedPlace.formatted_address && (
                    <p className="text-xs text-neutral-500 mt-0.5 leading-snug">{selectedPlace.formatted_address}</p>
                  )}
                </div>
                <button
                  onClick={clearSelection}
                  className="shrink-0 text-neutral-400 hover:text-neutral-700 text-lg leading-none mt-0.5"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <input
                  type="text"
                  value={query}
                  onChange={handleQueryChange}
                  onFocus={() => predictions.length > 0 && setShowDropdown(true)}
                  placeholder="e.g. Burnt Ends, Lau Pa Sat"
                  autoComplete="off"
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-500"
                />

                {/* Status hint */}
                {searching && (
                  <p className="mt-1.5 text-xs text-neutral-400">Searching places…</p>
                )}
                {loadingDetails && (
                  <p className="mt-1.5 text-xs text-neutral-400">Loading details…</p>
                )}

                {/* Dropdown */}
                {showDropdown && predictions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-xl border border-neutral-200 bg-white shadow-lg overflow-hidden">
                    {predictions.map((p) => (
                      <button
                        key={p.placeId}
                        onClick={() => handleSelectPrediction(p)}
                        className="w-full text-left px-4 py-3 hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0 transition-colors"
                      >
                        <p className="text-sm font-medium text-neutral-900">{p.text}</p>
                        {p.secondaryText && (
                          <p className="text-xs text-neutral-500 mt-0.5 truncate">{p.secondaryText}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Note ──────────────────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-2">
              Why is this place good?
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What makes it worth visiting…"
              rows={4}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-500 resize-none"
            />
          </div>

          {/* ── Photos ────────────────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-2">
              Add photos
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFilesChange}
              className="w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700"
            />
            {previews.length > 0 && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {previews.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt="preview"
                    className="h-20 w-20 rounded-xl object-cover border border-neutral-200"
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-1">
              {failedStage && (
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide">
                  {failedStage}
                </p>
              )}
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* ── Save ──────────────────────────────────────────────────────── */}
          <button
            onClick={handleSave}
            disabled={saving || loadingDetails}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save place'}
          </button>
        </div>
      </div>
    </main>
  )
}
