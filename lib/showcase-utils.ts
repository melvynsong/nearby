// Ranking and distance helpers for the showcase system.

import type { RankingStrategy } from './showcase-config'

export type ShowcaseItem = {
  rank: number
  placeId: string
  placeName: string
  dishName: string
  address: string | null
  lat: number | null
  lng: number | null
  photos: string[]
  googleRating: number | null
  googleRatingCount: number | null
  saveCount: number
  score: number
  aiDescription: string | null
  distanceKm?: number | null
}

export type RawShowcaseRow = {
  placeId: string
  placeName: string
  dishName: string
  address: string | null
  lat: number | null
  lng: number | null
  photos: string[]
  googleRating: number | null
  googleRatingCount: number | null
  saveCount: number
}

// Haversine distance in km
export function computeDistanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

// Rank scoring
// Tuning note: adjust weights here as data quality improves.
// 'social': emphasises community saves alongside rating
// 'rated':  emphasises Google rating quality over volume

const WEIGHTS: Record<RankingStrategy, {
  rating: number
  ratingCount: number
  saves: number
}> = {
  social: { rating: 0.40, ratingCount: 0.20, saves: 0.40 },
  rated:  { rating: 0.55, ratingCount: 0.25, saves: 0.20 },
}

export function rankShowcaseItems(
  rows: RawShowcaseRow[],
  strategy: RankingStrategy,
  maxItems: number,
): ShowcaseItem[] {
  if (!rows.length) return []

  const w = WEIGHTS[strategy]

  // Normalise rating count (log scale to reduce dominance of huge venues)
  const maxCount = Math.max(...rows.map((r) => r.googleRatingCount ?? 0), 1)
  const maxSaves = Math.max(...rows.map((r) => r.saveCount), 1)

  const scored = rows.map((r) => {
    const ratingNorm = (r.googleRating ?? 3.5) / 5          // 0-1
    const countNorm  = Math.log1p(r.googleRatingCount ?? 0) / Math.log1p(maxCount)
    const savesNorm  = r.saveCount / maxSaves

    const score = ratingNorm * w.rating + countNorm * w.ratingCount + savesNorm * w.saves

    return { ...r, score, rank: 0, aiDescription: null }
  })

  // Sort descending, cap at maxItems, assign rank
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map((item, idx) => ({ ...item, rank: idx + 1 }))
}

// Add client-side distance computation to already-ranked items
export function attachDistances(
  items: ShowcaseItem[],
  userLat: number,
  userLng: number,
): ShowcaseItem[] {
  return items.map((item) => ({
    ...item,
    distanceKm:
      item.lat != null && item.lng != null
        ? computeDistanceKm(userLat, userLng, item.lat, item.lng)
        : null,
  }))
}
