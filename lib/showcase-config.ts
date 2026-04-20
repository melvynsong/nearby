// Exported type for ranking strategy
export type RankingStrategy = 'social' | 'rated';
// Compute a score for each category based on mode and counts
function computeCategoryScore(
  mode: string,
  placeCount: number,
  recommendationCount: number,
  maxPlaceCount: number,
  maxRecommendationCount: number,
): number {
  if (mode === 'recommendations') return recommendationCount;
  if (mode === 'blended') {
    const placeNorm = maxPlaceCount > 0 ? placeCount / maxPlaceCount : 0;
    const recommendationNorm = maxRecommendationCount > 0 ? recommendationCount / maxRecommendationCount : 0;
    return placeNorm * 0.5 + recommendationNorm * 0.5;
  }
  return placeCount;
}
// Use shared normalization utility
import { normalizeCategoryKey, canonicalizeCategory } from './category-utils'
const normalizeCategoryName = normalizeCategoryKey;

// Local row types for aggregation logic
type CategoryRow = { id: string; name: string };
type PlaceCategoryRow = { category_id: string; place_id: string };
type RecommendationRow = { place_id: string; member_id: string | null };


// --- Types ---
export type ShowcaseConfig = {
  key: string;
  title: string;
  tagline: string;
  editorialDescription: string;
  categoryUsageCount?: number;
  heroGradientFrom: string;
  heroGradientTo: string;
  emoji: string;
  categoryIds?: string[];
  rankingStrategy?: string;
  maxItemsToShow?: number;
  minItemsToShow?: number;
};

// --- Constants ---
const DEFAULT_SCORE_MODE = 'blended';
const DEFAULT_LIST_LIMIT = 12;

// --- Exported helpers ---
export function getCategoryScoreMode(): 'places' | 'recommendations' | 'blended' {
  // TODO: Make dynamic if needed
  return DEFAULT_SCORE_MODE as 'places' | 'recommendations' | 'blended';
}

export function getShowcaseListLimit(): number {
  return DEFAULT_LIST_LIMIT;
}

// --- Main showcase list builder ---
export async function getAvailableShowcases(db: any, limit: number): Promise<ShowcaseConfig[]> {
  // This is a stub. Replace with real aggregation logic as needed.
  const rows = await getAggregatedShowcases(db, getCategoryScoreMode());
  return rows.slice(0, limit).map(row => ({
    key: row.normalizedName,
    title: row.title,
    tagline: `Top ${row.title} places`,
    editorialDescription: '',
    categoryUsageCount: row.usageCount,
    heroGradientFrom: '#1f355d',
    heroGradientTo: '#0f3b58',
    emoji: '🍽️',
    categoryIds: row.categoryIds,
    rankingStrategy: 'default',
    maxItemsToShow: 20,
    minItemsToShow: 3,
  }));
}

export async function getShowcaseConfigByKey(db: any, key: string): Promise<ShowcaseConfig | null> {
  // This is a stub. Replace with real lookup logic as needed.
  const rows = await getAggregatedShowcases(db, getCategoryScoreMode());
  const found = rows.find(row => row.normalizedName === key);
  if (!found) return null;
  return {
    key: found.normalizedName,
    title: found.title,
    tagline: `Top ${found.title} places`,
    editorialDescription: '',
    categoryUsageCount: found.usageCount,
    heroGradientFrom: '#1f355d',
    heroGradientTo: '#0f3b58',
    emoji: '🍽️',
    categoryIds: found.categoryIds,
    rankingStrategy: 'default',
    maxItemsToShow: 20,
    minItemsToShow: 3,
  };
}

export async function getAggregatedShowcases(db: any, mode: string) {
  // Fetch and check categoryRows and placeCategoryRows first
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

  // Build groupedCategories and uniquePlacesByCategory
  const groupedCategories = new Map<string, { title: string; categoryIds: string[] }>();
  for (const cat of (categoryRows ?? []) as CategoryRow[]) {
    const normalized = canonicalizeCategory(cat.name);
    if (!groupedCategories.has(normalized)) {
      groupedCategories.set(normalized, { title: cat.name, categoryIds: [cat.id] });
    } else {
      groupedCategories.get(normalized)!.categoryIds.push(cat.id);
    }
  }

  const uniquePlacesByCategory = new Map<string, Set<string>>();
  for (const row of (placeCategoryRows ?? []) as PlaceCategoryRow[]) {
    const category = categoryRows?.find((cat: CategoryRow) => cat.id === row.category_id);
    if (!category) continue;
    const normalized = canonicalizeCategory(category.name);
    const set = uniquePlacesByCategory.get(normalized) ?? new Set<string>();
    set.add(row.place_id);
    uniquePlacesByCategory.set(normalized, set);
  }

  // Build categoryKeysByPlace for use in recommendationsByCategory
  const categoryKeysByPlace = new Map<string, Set<string>>();
  for (const row of (placeCategoryRows ?? []) as PlaceCategoryRow[]) {
    const category = categoryRows?.find((cat: CategoryRow) => cat.id === row.category_id);
    if (!category) continue;
    const normalized = canonicalizeCategory(category.name);
    const keysSet = categoryKeysByPlace.get(row.place_id) ?? new Set<string>();
    keysSet.add(normalized);
    categoryKeysByPlace.set(row.place_id, keysSet);
  }

  const { data: recommendationRows, error: recommendationErr } = await db
    .from('recommendations')
    .select('place_id, member_id')
  if (recommendationErr) {
    throw new Error(`Failed to load recommendations: ${recommendationErr.message}`)
  }

  const recommendationsByCategory = new Map<string, Set<string>>();
  for (const row of (recommendationRows ?? []) as RecommendationRow[]) {
    const categoryKeys = categoryKeysByPlace.get(row.place_id);
    if (!categoryKeys) continue;
    const recommendationToken = row.member_id
      ? `${row.place_id}:${row.member_id}`
      : row.place_id;
    for (const categoryKey of categoryKeys) {
      const tokens = recommendationsByCategory.get(categoryKey) ?? new Set<string>();
      tokens.add(recommendationToken);
      recommendationsByCategory.set(categoryKey, tokens);
    }
  }

  const maxPlaceCount = Math.max(
    ...[...uniquePlacesByCategory.values()].map((places) => places.size),
    1,
  );
  const maxRecommendationCount = Math.max(
    ...[...recommendationsByCategory.values()].map((tokens) => tokens.size),
    1,
  );

  const aggregates = [...groupedCategories.entries()]
    .map(([normalizedName, group]) => {
      const placeCount = uniquePlacesByCategory.get(normalizedName)?.size ?? 0;
      const recommendationCount = recommendationsByCategory.get(normalizedName)?.size ?? 0;
      const score = computeCategoryScore(
        mode,
        placeCount,
        recommendationCount,
        maxPlaceCount,
        maxRecommendationCount,
      );
      return {
        normalizedName,
        title: group.title,
        categoryIds: group.categoryIds,
        usageCount: placeCount,
        recommendationCount,
        score,
      };
    })
    // No minimum threshold: show all categories
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.recommendationCount !== a.recommendationCount) return b.recommendationCount - a.recommendationCount;
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      return a.title.localeCompare(b.title);
    });

  return aggregates;
}