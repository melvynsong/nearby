'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiPath } from '@/lib/base-path'

export type BeAChefClue = {
  label: string
  /** Normalized 0-1 coordinates within the photo. null if AI did not locate it. */
  x: number | null
  y: number | null
}

export type BeAChefAnalysis = {
  dish_name: string
  confidence: number
  key_visual_clues: BeAChefClue[]
  reasoning_summary: string
  ingredients: string[]
  steps: string[]
  local_tips?: string[]
}

type Props = {
  isOpen: boolean
  onClose: () => void
  photoUrl: string | null
  placeName?: string | null
  dishHint?: string | null
}

const MIN_SCAN_TIME_MS = 4200

const SCAN_MESSAGES = [
  'Looking at the main ingredient…',
  'Checking noodle / rice texture…',
  'Matching broth and sauce colour…',
  'Comparing serving style…',
  'Checking garnish and toppings…',
  'Building a home-style recipe…',
]

const MAX_CLUES = 4

function ChefHatIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 14a4 4 0 1 1 1.6-7.66A5 5 0 0 1 17 7a4 4 0 0 1 1 7.87" />
      <path d="M6 14h12v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4Z" />
      <path d="M9 18v2M15 18v2" />
    </svg>
  )
}

export default function BeAChefSheet({
  isOpen,
  onClose,
  photoUrl,
  placeName,
  dishHint,
}: Props) {
  const [phase, setPhase] = useState<'scanning' | 'results'>('scanning')
  const [messageIdx, setMessageIdx] = useState(0)
  const [analysis, setAnalysis] = useState<BeAChefAnalysis | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)

  // Only render clues that the AI grounded with real x/y coordinates.
  const groundedClues = useMemo(() => {
    if (!analysis) return []
    return analysis.key_visual_clues
      .filter((c) => c.x !== null && c.y !== null && c.label)
      .slice(0, MAX_CLUES) as Array<BeAChefClue & { x: number; y: number }>
  }, [analysis])

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  // Reset state when opened
  useEffect(() => {
    if (!isOpen) return
    setPhase('scanning')
    setMessageIdx(0)
    setAnalysis(null)
    setErrorText(null)
  }, [isOpen, photoUrl])

  // Rotating scan messages
  useEffect(() => {
    if (!isOpen || phase !== 'scanning') return
    const id = setInterval(() => {
      setMessageIdx((i) => (i + 1) % SCAN_MESSAGES.length)
    }, 800)
    return () => clearInterval(id)
  }, [isOpen, phase])

  // Run analysis with intentional delay
  useEffect(() => {
    if (!isOpen || !photoUrl) return

    let cancelled = false
    const controller = new AbortController()
    console.log('[BeAChef] Scan started')

    const run = async () => {
      try {
        const [result] = await Promise.all([
          fetch(apiPath('/api/be-a-chef/analyze'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoUrl, placeName, dishHint }),
            signal: controller.signal,
          })
            .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
            .then((json) => json as BeAChefAnalysis),
          new Promise((resolve) => setTimeout(resolve, MIN_SCAN_TIME_MS)),
        ])

        if (cancelled) return
        console.log('[BeAChef] Scan completed', result)
        setAnalysis(result)
        setPhase('results')
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return
        console.error('[BeAChef] Scan failed', err)
        setErrorText('We could not finish scanning this dish. Please try again.')
        setPhase('results')
      }
    }

    void run()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [isOpen, photoUrl, placeName, dishHint])

  if (!isOpen || !photoUrl) return null
  if (typeof window === 'undefined') return null

  const content = (
    <div className="fixed inset-0 z-[1000]">
      <button
        type="button"
        aria-label="Close Be a Chef"
        onClick={onClose}
        className="nearby-sheet-backdrop absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-2 sm:p-4 md:p-6">
        <section
          className="beachef-popup pointer-events-auto relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl md:max-w-3xl lg:max-w-5xl lg:flex-row"
          style={{
            height: 'min(92vh, 860px)',
            maxHeight: '92vh',
          }}
        >
          {/* Close button — floats so it stays accessible across both layouts */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-800 shadow-md backdrop-blur-sm hover:bg-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {/* ── Image column ──────────────────────────────────────────────── */}
          <div className="relative flex shrink-0 items-stretch overflow-hidden bg-neutral-950 lg:flex-1 lg:basis-3/5 lg:max-w-[60%] lg:self-stretch">
            <div className="relative h-[55vh] w-full sm:h-[62vh] lg:h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt="Dish"
                className="block h-full w-full object-contain"
              />

              {/* Scan overlay (sweep only — no decorative labels) */}
              {phase === 'scanning' && (
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-0 bg-black/15" />
                  <div className="absolute inset-y-0 -left-1/3 w-1/3 beachef-sweep bg-gradient-to-r from-transparent via-white/40 to-transparent mix-blend-screen" />
                </div>
              )}

              {/* AI-grounded markers (after scan) */}
              {phase === 'results' && groundedClues.length > 0 && (
                <div className="pointer-events-none absolute inset-0">
                  {groundedClues.map((clue, i) => {
                    // Clamp away from edges so labels don't get clipped
                    const cx = Math.max(0.06, Math.min(0.94, clue.x))
                    const cy = Math.max(0.06, Math.min(0.94, clue.y))
                    const align: 'left' | 'right' = cx < 0.5 ? 'right' : 'left'
                    return (
                      <div
                        key={i}
                        className="absolute beachef-fade-up"
                        style={{
                          top: `${cy * 100}%`,
                          left: `${cx * 100}%`,
                          animationDelay: `${i * 120}ms`,
                        }}
                      >
                        <div className="relative">
                          <div className="beachef-marker absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-7 w-7 rounded-full border-2 border-amber-300 shadow-[0_0_0_4px_rgba(251,191,36,0.25)]" />
                          <div
                            className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm"
                            style={
                              align === 'right'
                                ? { left: '22px', maxWidth: '55%' }
                                : { right: '22px', maxWidth: '55%' }
                            }
                          >
                            {clue.label}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* On lg screens, show place name overlay at bottom of image */}
              {placeName && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/70 to-transparent px-5 pb-4 pt-12 lg:block">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">From</p>
                  <p className="line-clamp-1 text-base font-bold text-white">{placeName}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Details column ────────────────────────────────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col bg-white lg:max-w-[40%]">
            {/* Header (mobile + sm only — lg shows the image overlay caption) */}
            <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4 lg:py-5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-white">
                <ChefHatIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-tight text-neutral-900">Be a Chef</p>
                <p className="truncate text-xs leading-tight text-neutral-500 lg:hidden">
                  {placeName ? `From ${placeName}` : 'AI dish analysis'}
                </p>
                <p className="hidden text-xs leading-tight text-neutral-500 lg:block">
                  AI dish analysis
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {phase === 'scanning' && (
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    AI is scanning the dish clues…
                  </p>
                  <p className="mt-1.5 min-h-[20px] text-sm text-neutral-600 transition-opacity duration-300">
                    {SCAN_MESSAGES[messageIdx]}
                  </p>
                  <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full w-1/3 bg-neutral-900/80 beachef-sweep" />
                  </div>
                </div>
              )}

              {phase === 'results' && (
                <div className="beachef-fade-up">
                  {errorText && (
                    <div className="mb-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {errorText}
                    </div>
                  )}

                  {analysis && (
                    <>
                      <div className="flex items-baseline justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                            Dish identified
                          </p>
                          <h3 className="text-xl font-extrabold leading-tight text-neutral-900">
                            {analysis.dish_name}
                          </h3>
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                          {analysis.confidence}% match
                        </span>
                      </div>

                      {analysis.reasoning_summary && (
                        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                          {analysis.reasoning_summary}
                        </p>
                      )}

                      {analysis.key_visual_clues.length > 0 && (
                        <section className="mt-5">
                          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                            Why we think so
                          </p>
                          <ul className="mt-2 space-y-1.5">
                            {analysis.key_visual_clues.map((clue, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                                <span
                                  className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                                    clue.x !== null && clue.y !== null ? 'bg-amber-500' : 'bg-neutral-300'
                                  }`}
                                  aria-hidden
                                />
                                <span>{clue.label}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}

                      <section className="mt-5">
                        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                          Ingredients
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {analysis.ingredients.map((ing, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm text-neutral-700"
                            >
                              <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-500">
                                {i + 1}
                              </span>
                              <span>{ing}</span>
                            </li>
                          ))}
                        </ul>
                      </section>

                      <section className="mt-5">
                        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                          Steps
                        </p>
                        <ol className="mt-2 space-y-2">
                          {analysis.steps.map((step, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm text-neutral-800">
                              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white">
                                {i + 1}
                              </span>
                              <span className="leading-relaxed">{step}</span>
                            </li>
                          ))}
                        </ol>
                      </section>

                      {analysis.local_tips && analysis.local_tips.length > 0 && (
                        <section className="mt-5 rounded-2xl bg-amber-50 px-4 py-3">
                          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
                            Local tips
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {analysis.local_tips.map((tip, i) => (
                              <li key={i} className="text-sm text-amber-900">
                                • {tip}
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}

                      <p className="mt-5 text-[11px] leading-relaxed text-neutral-400">
                        Recipe is AI-generated based on visual clues. Adjust to taste.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
