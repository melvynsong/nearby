import type { SupabaseClient } from '@supabase/supabase-js'

export type RankingStrategy = 'social' | 'rated'
export type CategoryScoreMode = 'places' | 'recommendations' | 'blended'

type CategoryRow = { id: string; name: string }
type PlaceCategoryRow = { category_id: string; place_id: string }
type RecommendationRow = { place_id: string }

export type ShowcaseConfig = {
  key: string
  categoryId: string
  categoryUsageCount: number
  title: string
  fullTitle: (count: number) => string
  editorialDescription: string
  tagline: string
  rankingStrategy: RankingStrategy
  heroGradientFrom: string
  heroGradientTo: string
  emoji: string
  minItemsToShow: number
  maxItemsToShow: number
}

const VISUAL_PRESETS: Array<{
  emoji: string
  heroGradientFrom: string
  heroGradientTo: string
}> = [
  { emoji: '🍜', heroGradientFrom: '#7c2d12', heroGradientTo: '#92400e' },
  { emoji: '🍚', heroGradientFrom: '#713f12', heroGradientTo: '#854d0e' },
  { emoji: '🍲', heroGradientFrom: '#0f3b58', heroGradientTo: '#1f355d' },
  { emoji: '🍛', heroGradientFrom: '#4c1d95', heroGradientTo: '#6d28d9' },
  { emoji: '🥢', heroGradientFrom: '#134e4a', heroGradientTo: '#115e59' },
  { emoji: '🍗', heroGradientFrom: '#7f1d1d', heroGradientTo: '#991b1b' },
]

function slugifyCategoryName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  return normalized || 'category'
}

function selectVisualPreset(categoryId: string): (typeof VISUAL_PRESETS)[number] {
  let hash = 0
  for (let i = 0; i < categoryId.length; i += 1) {
    hash = (hash * 31 + categoryId.charCodeAt(i)) % 2147483647
  }
  return VISUAL_PRESETS[hash % VISUAL_PRESETS.length]
}

function buildShowcaseConfig(category: CategoryRow, usageCount: number): ShowcaseConfig {
  const visual = selectVisualPreset(category.id)
  const slug = slugifyCategoryName(category.name)
  const key = `${slug}-${category.id.slice(0, 8)}`
  const title = category.name.trim()

  return {
    key,
    categoryId: category.id,
    categoryUsageCount: usageCount,
    title,
    fullTitle: (count: number) => `Top ${count} ${title} Spots`,
    editorialDescription: `Trending ${title} picks based on where the community has added this category most often.`,
    tagline: `Top category by additions (${usageCount})`,
    rankingStrategy: 'social',
    heroGradientFrom: visual.heroGradientFrom,
    heroGradientTo: visual.heroGradientTo,
    emoji: visual.emoji,
    minItemsToShow: 3,
    maxItemsToShow: 10,
  }
}

function resolveCategoryScoreMode(): CategoryScoreMode {
  const raw = (process.env.SHOWCASE_TOP_CATEGORY_SIGNAL ?? 'places').trim().toLowerCase()
  if (raw === 'recommendations') return 'recommendations'
  if (raw === 'blended') return 'blended'
  return 'places'
}

function normalize(value: number, max: number): number {
  if (max <= 0) return 0
  return value / max
}

function computeCategoryScore(
  mode: CategoryScoreMode,
  placeCount: number,
  recommendationCount: number,
  maxPlaceCount: number,
  maxRecommendationCount: number,
): number {
  if (mode === 'recommendations') return recommendationCount
  if (mode === 'blended') {
    const placeNorm = normalize(placeCount, maxPlaceCount)
    const recommendationNorm = normalize(recommendationCount, maxRecommendationCount)
    return placeNorm * 0.5 + recommendationNorm * 0.5
  }
  return placeCount
}

export async function getAvailableShowcases(
  db: SupabaseClient,
  limit = 5,
): Promise<ShowcaseConfig[]> {
  const { data: categoryRows, error: categoryErr } = await db
    .from('food_categories')
    .select('id, name')

  if (categoryErr) {
    throw new Error(`Failed to load food categories: ${categoryErr.message}`)
  }

  const { data: placeCategoryRows, error: placeCategoryErr } = await db
    .from('place_categories')
    .select('category_id, place_id')

  if (placeCategoryErr) {
    throw new Error(`Failed to load place category links: ${placeCategoryErr.message}`)
  }

  const { data: recommendationRows, error: recommendationErr } = await db
    .from('recommendations')
    .select('place_id')

  if (recommendationErr) {
    throw new Error(`Failed to load recommendations: ${recommendationErr.message}`)
  }

  const mode = resolveCategoryScoreMode()

  const uniquePlacesByCategory = new Map<string, Set<string>>()
  const categoryIdsByPlace = new Map<string, Set<string>>()

  for (const row of (placeCategoryRows ?? []) as PlaceCategoryRow[]) {
    const places = uniquePlacesByCategory.get(row.category_id) ?? new Set<string>()
    places.add(row.place_id)
    uniquePlacesByCategory.set(row.category_id, places)

    const categoryIds = categoryIdsByPlace.get(row.place_id) ?? new Set<string>()
    categoryIds.add(row.category_id)
    categoryIdsByPlace.set(row.place_id, categoryIds)
  }

  const recommendationsByCategory = new Map<string, number>()
  for (const row of (recommendationRows ?? []) as RecommendationRow[]) {
    const categoryIds = categoryIdsByPlace.get(row.place_id)
    if (!categoryIds) continue

    for (const categoryId of categoryIds) {
      recommendationsByCategory.set(categoryId, (recommendationsByCategory.get(categoryId) ?? 0) + 1)
    }
  }

  const maxPlaceCount = Math.max(
    ...[...uniquePlacesByCategory.values()].map((places) => places.size),
    1,
  )
  const maxRecommendationCount = Math.max(
    ...[...recommendationsByCategory.values()],
    1,
  )

  return (categoryRows ?? [])
    .map((category: CategoryRow) => {
      const placeCount = uniquePlacesByCategory.get(category.id)?.size ?? 0
      const recommendationCount = recommendationsByCategory.get(category.id) ?? 0
      const score = computeCategoryScore(
        mode,
        placeCount,
        recommendationCount,
        maxPlaceCount,
        maxRecommendationCount,
      )

      return {
        category,
        usageCount: placeCount,
        recommendationCount,
        score,
      }
    })
    .filter((entry) => {
      if (mode === 'recommendations') return entry.recommendationCount > 0
      if (mode === 'blended') return entry.usageCount > 0 || entry.recommendationCount > 0
      return entry.usageCount > 0
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.recommendationCount !== a.recommendationCount) return b.recommendationCount - a.recommendationCount
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount
      return a.category.name.localeCompare(b.category.name)
    })
    .slice(0, limit)
    .map((entry) => buildShowcaseConfig(entry.category, entry.usageCount))
}

export async function getShowcaseConfigByKey(
  db: SupabaseClient,
  key: string,
): Promise<ShowcaseConfig | null> {
  const showcases = await getAvailableShowcases(db, 5)
  return showcases.find((showcase) => showcase.key === key) ?? null
}
