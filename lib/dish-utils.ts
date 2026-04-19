// Dish name normalization and scoring utilities.
// canonicalizeDishName maps aliases and variants to a single canonical label
// while preserving display-quality names (no over-flattening).
//
// Tuning note: add new aliases here as users submit corrections over time.
// getDishFamily is intentionally coarse — use for context hints, not hard routing.

import type { DishSuggestion, PlaceDishStat } from './dish-analysis-types'

// ── Canonical name → known alternate labels ──────────────────────────────────

const DISH_ALIASES: Record<string, string[]> = {
  'Bak Chor Mee': ['Minced Meat Noodles', 'Mee Pok Tah', 'Bak Chor Mee Dry', 'Bak Chor Mee Soup', 'BCM'],
  'Fishball Noodles': ['Fish Ball Noodles', 'Fishball Soup Noodles', 'Fish Ball Soup'],
  'Wanton Mee': ['Wonton Mee', 'Wanton Noodles', 'Wonton Noodles', 'Wantan Mee'],
  'Hokkien Mee': ['Hokkien Prawn Mee', 'Hokkien Noodles', 'Hae Mee Fried'],
  'Char Kway Teow': ['Char Kuay Teow', 'CKT', 'Fried Flat Noodles', 'Char Kway Teo'],
  'Chicken Rice': ['Hainanese Chicken Rice', 'Roast Chicken Rice', 'Steamed Chicken Rice', 'Nasi Ayam'],
  'Ban Mian': ['Mee Hoon Kueh', 'Pan Mee', 'Handmade Noodles', 'Flat Noodles Soup', 'Mian'],
  'Roti Prata': ['Roti', 'Prata', 'Egg Prata', 'Roti Prata Egg', 'Plain Prata', 'Kosong Prata'],
  'Nasi Lemak': ['Coconut Rice', 'Nasi Lemak Ayam'],
  'Briyani': ['Biryani', 'Chicken Briyani', 'Mutton Briyani', 'Nasi Briyani', 'Chicken Biryani', 'Mutton Biryani'],
  'Prawn Mee': ['Hae Mee', 'Prawn Noodles', 'Prawn Noodle Soup', 'Prawn Mee Soup', 'Prawn Mee Dry'],
  'Laksa': ['Curry Laksa', 'Assam Laksa', 'Singapore Laksa'],
  'Mee Rebus': ['Mee Rebus Ayam', 'Yellow Noodles Gravy'],
  'Mee Siam': ['Mee Siam Kuah'],
  'Satay': ['Chicken Satay', 'Mutton Satay', 'Beef Satay', 'Pork Satay'],
  'Nasi Goreng': ['Fried Rice', 'Nasi Goreng Ayam'],
  'Carrot Cake': ['Chai Tow Kway', 'White Carrot Cake', 'Black Carrot Cake', 'Fried Carrot Cake'],
  'Bak Kut Teh': ['Pork Rib Soup', 'Bak Ku Teh', 'BKT'],
  'Char Siew Rice': ['BBQ Pork Rice', 'Roast Pork Rice', 'Char Siu Rice'],
  'Popiah': ['Fresh Spring Roll', 'Popiah Basah'],
  'Chee Cheong Fun': ['Rice Roll', 'Rice Noodle Roll', 'CCF'],
  'Curry Puff': ['Sardine Puff', 'Karipap', 'Epok Epok'],
  'Ice Kachang': ['ABC', 'Ice Kachang Dessert', 'Ais Kacang'],
  'Cendol': ['Chendol'],
  'Tau Huay': ['Tofu Pudding', 'Douhua', 'Bean Curd'],
  'Murtabak': ['Mutabak', 'Martabak'],
  'Chwee Kueh': ['Water Rice Cake', 'Steamed Rice Cake'],
  'Rojak': ['Fruit Rojak', 'Indian Rojak', 'Pasembur'],
  'Nasi Padang': ['Padang Rice'],
  'Char Siew Bao': ['BBQ Pork Bun', 'Char Siu Bao', 'Steamed BBQ Bun'],
  'Soya Chicken Rice': ['Soy Sauce Chicken Rice'],
  'Duck Rice': ['Braised Duck Rice', 'Lor Ark Rice'],
  'Economy Rice': ['Cai Png', 'Mixed Rice'],
}

// Build reverse lookup: lowercase alias → canonical
const ALIAS_TO_CANONICAL = new Map<string, string>()
for (const [canonical, aliases] of Object.entries(DISH_ALIASES)) {
  ALIAS_TO_CANONICAL.set(canonical.toLowerCase(), canonical)
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical)
  }
}

export function canonicalizeDishName(name: string): string {
  if (!name) return name
  const key = name.trim().toLowerCase()
  return ALIAS_TO_CANONICAL.get(key) ?? name.trim()
}

export function getAlternateNames(name: string): string[] {
  const canonical = canonicalizeDishName(name)
  return DISH_ALIASES[canonical] ?? []
}

export function getDishFamily(name: string): string | null {
  const canonical = canonicalizeDishName(name)
  const families: Record<string, string> = {
    'Bak Chor Mee': 'Noodles', 'Fishball Noodles': 'Noodles', 'Wanton Mee': 'Noodles',
    'Hokkien Mee': 'Noodles', 'Char Kway Teow': 'Noodles', 'Ban Mian': 'Noodles',
    'Prawn Mee': 'Noodles', 'Laksa': 'Noodles', 'Mee Rebus': 'Noodles', 'Mee Siam': 'Noodles',
    'Chicken Rice': 'Rice', 'Nasi Lemak': 'Rice', 'Briyani': 'Rice', 'Nasi Goreng': 'Rice',
    'Char Siew Rice': 'Rice', 'Nasi Padang': 'Rice', 'Economy Rice': 'Rice',
    'Soya Chicken Rice': 'Rice', 'Duck Rice': 'Rice',
    'Roti Prata': 'Indian Breads', 'Murtabak': 'Indian Breads',
    'Satay': 'Grilled', 'Carrot Cake': 'Hawker Fried',
    'Bak Kut Teh': 'Soups',
    'Popiah': 'Snacks', 'Curry Puff': 'Snacks', 'Chwee Kueh': 'Snacks', 'Rojak': 'Salads',
    'Chee Cheong Fun': 'Dim Sum', 'Char Siew Bao': 'Dim Sum',
    'Ice Kachang': 'Desserts', 'Cendol': 'Desserts', 'Tau Huay': 'Desserts',
  }
  return families[canonical] ?? null
}

// ── Score combination ─────────────────────────────────────────────────────────
// Tuning note: adjust SCORE_WEIGHTS as data quality grows.
// Once visual memory has 100+ confirmed dishes, visual_memory weight can rise.
// Once place stats have 50+ events per place, place_frequency weight can rise.

export const SCORE_WEIGHTS = {
  imageAnalysis: 0.50,    // primary signal
  placeFrequency: 0.20,   // place-level dish popularity
  visualMemory: 0.20,     // similarity to confirmed dish photos
  recencySignal: 0.10,    // recent interactions at this place
}

export function combineScores(scores: {
  imageScore: number
  placeScore: number
  visualMemoryScore: number
  recencyScore?: number
}): number {
  const recency = scores.recencyScore ?? 0
  return Math.round(
    scores.imageScore * SCORE_WEIGHTS.imageAnalysis +
    scores.placeScore * SCORE_WEIGHTS.placeFrequency +
    scores.visualMemoryScore * SCORE_WEIGHTS.visualMemory +
    recency * SCORE_WEIGHTS.recencySignal
  )
}

// ── Place-context re-ranking ──────────────────────────────────────────────────
// Takes existing AI suggestions and re-orders them using place dish stats.
// Called after place selection without needing to re-send the image.

export function rerankWithPlaceStats(
  suggestions: DishSuggestion[],
  placeStats: PlaceDishStat[],
): DishSuggestion[] {
  if (!placeStats.length) return suggestions

  const maxConfirm = Math.max(...placeStats.map((s) => s.confirm_count), 1)

  return suggestions
    .map((s) => {
      const canonical = canonicalizeDishName(s.name)
      const stat = placeStats.find(
        (ps) => canonicalizeDishName(ps.canonical_dish_name) === canonical,
      )

      // Normalize place score 0-100 based on confirm_count relative to place max
      const placeScore = stat
        ? Math.min(100, Math.round((stat.confirm_count / maxConfirm) * 100))
        : 0

      const combined = combineScores({
        imageScore: s.signals?.image_score ?? s.confidence,
        placeScore,
        visualMemoryScore: s.signals?.visual_memory_score ?? 0,
      })

      return {
        ...s,
        confidence: combined,
        signals: {
          image_score: s.signals?.image_score ?? s.confidence,
          place_score: placeScore,
          visual_memory_score: s.signals?.visual_memory_score ?? 0,
        },
      }
    })
    .sort((a, b) => b.confidence - a.confidence)
}
