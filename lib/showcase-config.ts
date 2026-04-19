import type { SupabaseClient } from '@supabase/supabase-js'

export type RankingStrategy = 'social' | 'rated'
export type CategoryScoreMode = 'places' | 'recommendations' | 'blended'

type CategoryRow = { id: string; name: string }
type PlaceCategoryRow = { category_id: string; place_id: string }
type RecommendationRow = { place_id: string; member_id: string | null }

export type ShowcaseConfig = {
  key: string
  categoryIds: string[]
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

function resolveShowcaseListLimit(): number {
  const raw = (process.env.SHOWCASE_LIST_LIMIT ?? '').trim()
  const parsed = Number.parseInt(raw, 10)
  if (Number.isFinite(parsed) && parsed >= 3 && parsed <= 9) {
    return parsed
  }
  return 7
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

function hashString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0').slice(0, 8)
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

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

function buildShowcaseConfig(title: string, categoryIds: string[], usageCount: number): ShowcaseConfig {
  const identity = categoryIds[0] ?? title
  const visual = selectVisualPreset(identity)
  const slug = slugifyCategoryName(title)
  const key = `${slug}-${hashString(normalizeCategoryName(title))}`

  return {
    key,
    categoryIds,
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

type CategoryAggregate = {
  normalizedName: string
  title: string
  categoryIds: string[]
  usageCount: number
  recommendationCount: number
  score: number
}

async function getAggregatedShowcases(db: SupabaseClient): Promise<CategoryAggregate[]> {
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
    .select('place_id, member_id')

  if (recommendationErr) {
    throw new Error(`Failed to load recommendations: ${recommendationErr.message}`)
  }

  const mode = resolveCategoryScoreMode()
  const categoryKeyById = new Map<string, string>()
  const groupedCategories = new Map<string, { title: string; categoryIds: string[] }>()

  for (const category of (categoryRows ?? []) as CategoryRow[]) {
    const normalizedName = normalizeCategoryName(category.name)
    categoryKeyById.set(category.id, normalizedName)

    const existing = groupedCategories.get(normalizedName)
    if (existing) {
      existing.categoryIds.push(category.id)
      continue
    }

    groupedCategories.set(normalizedName, {
      title: category.name.trim(),
      categoryIds: [category.id],
    })
  }

  const uniquePlacesByCategory = new Map<string, Set<string>>()
  const categoryKeysByPlace = new Map<string, Set<string>>()

  for (const row of (placeCategoryRows ?? []) as PlaceCategoryRow[]) {
    const categoryKey = categoryKeyById.get(row.category_id)
    if (!categoryKey) continue

    const places = uniquePlacesByCategory.get(categoryKey) ?? new Set<string>()
    places.add(row.place_id)
    uniquePlacesByCategory.set(categoryKey, places)

    const categoryKeys = categoryKeysByPlace.get(row.place_id) ?? new Set<string>()
    categoryKeys.add(categoryKey)
    categoryKeysByPlace.set(row.place_id, categoryKeys)
  }

  const recommendationsByCategory = new Map<string, Set<string>>()
  for (const row of (recommendationRows ?? []) as RecommendationRow[]) {
    const categoryKeys = categoryKeysByPlace.get(row.place_id)
    if (!categoryKeys) continue

    const recommendationToken = row.member_id
      ? `${row.place_id}:${row.member_id}`
      : row.place_id

    for (const categoryKey of categoryKeys) {
      const tokens = recommendationsByCategory.get(categoryKey) ?? new Set<string>()
      tokens.add(recommendationToken)
      recommendationsByCategory.set(categoryKey, tokens)
    }
  }

  const maxPlaceCount = Math.max(
    ...[...uniquePlacesByCategory.values()].map((places) => places.size),
    1,
  )
  const maxRecommendationCount = Math.max(
    ...[...recommendationsByCategory.values()].map((tokens) => tokens.size),
    1,
  )

  return [...groupedCategories.entries()]
    .map(([normalizedName, group]) => {
      const placeCount = uniquePlacesByCategory.get(normalizedName)?.size ?? 0
      const recommendationCount = recommendationsByCategory.get(normalizedName)?.size ?? 0
      const score = computeCategoryScore(
        mode,
        placeCount,
        recommendationCount,
        maxPlaceCount,
        maxRecommendationCount,
      )

      return {
        normalizedName,
        title: group.title,
        categoryIds: group.categoryIds,
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
      return a.title.localeCompare(b.title)
    })
}

export async function getAvailableShowcases(
  db: SupabaseClient,
  limit = resolveShowcaseListLimit(),
): Promise<ShowcaseConfig[]> {
  const aggregates = await getAggregatedShowcases(db)

  return aggregates
    .slice(0, limit)
    .map((entry) => buildShowcaseConfig(entry.title, entry.categoryIds, entry.usageCount))
}

export async function getShowcaseConfigByKey(
  db: SupabaseClient,
  key: string,
): Promise<ShowcaseConfig | null> {
  const showcases = (await getAggregatedShowcases(db))
    .map((entry) => buildShowcaseConfig(entry.title, entry.categoryIds, entry.usageCount))
  return showcases.find((showcase) => showcase.key === key) ?? null
}

export function getCategoryScoreMode(): CategoryScoreMode {
  return resolveCategoryScoreMode()
}

export function getShowcaseListLimit(): number {
  return resolveShowcaseListLimit()
}
