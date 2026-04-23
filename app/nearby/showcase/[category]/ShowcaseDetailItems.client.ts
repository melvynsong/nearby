// Client-side fetcher for showcase items by category (for use in ShowcaseDetailDrawer)
import { supabase } from '@/lib/supabase'
import { ShowcaseItem } from '@/lib/showcase-utils'

// Fetches and normalizes showcase items for a given category key (slug)
export async function getShowcaseItemsForCategory(categoryKey: string): Promise<ShowcaseItem[]> {
  // Map slug to category_id if needed (assume slug is category_id for now)
  const categoryId = categoryKey;
  // Join place_categories -> food_categories -> groups, filter for public groups
  const { data, error } = await supabase
    .from('place_categories')
    .select(`
      place_id,
      category_id,
      food_categories!inner(id, group_id, groups!inner(id, visibility)),
      places ( name, formatted_address, photo_urls, google_rating, google_rating_count, lat, lng, google_place_id )
    `)
    .eq('category_id', categoryId)
    .eq('food_categories.groups.visibility', 'public')
  if (error || !data) return [];
  // Normalize to ShowcaseItem shape
  return data.map((row: any, idx: number) => ({
    placeId: row.place_id,
    placeName: row.places?.name ?? '',
    dishName: '', // Not available in this schema
    address: row.places?.formatted_address ?? '',
    lat: row.places?.lat ?? null,
    lng: row.places?.lng ?? null,
    photos: row.places?.photo_urls ?? [],
    googleRating: row.places?.google_rating ?? null,
    googleRatingCount: row.places?.google_rating_count ?? null,
    saveCount: 0, // Not available in this schema
    score: row.places?.google_rating ?? 0,
    aiDescription: null,
    rank: idx + 1,
    googlePlaceId: row.places?.google_place_id ?? null,
  }))
}
