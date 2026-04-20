// Renders showcase items (places) for a category
import { supabase } from '@/lib/supabase'
import { categoryToSlug, normalizeCategoryKey } from '@/lib/category-utils'

export default async function ShowcaseDetailItems({ category }: { category: string }) {
  // Fetch places for this category
  const { data, error } = await supabase
    .from('place_categories')
    .select('place_id, places ( name, formatted_address, photo_urls, google_rating, google_rating_count )')
    .eq('category_id', category)
  if (error) {
    return <div className="text-red-400">Failed to load showcase items.</div>
  }
  if (!data || data.length === 0) {
    return <div className="text-neutral-400 py-8">No places found for this category yet.</div>
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-6">
      {data.map((row: any) => (
        <div key={row.place_id} className="rounded-xl bg-white shadow p-4 flex flex-col items-start hover:shadow-lg transition cursor-pointer">
          <div className="font-semibold text-lg mb-1">{row.places?.name}</div>
          <div className="text-xs text-neutral-500 mb-2">{row.places?.formatted_address}</div>
          <div className="flex gap-2 text-xs text-yellow-600 mb-2">
            <span>⭐ {row.places?.google_rating ?? 'N/A'}</span>
            <span>({row.places?.google_rating_count ?? 0} ratings)</span>
          </div>
          {row.places?.photo_urls?.length > 0 && (
            <img src={row.places.photo_urls[0]} alt={row.places.name} className="w-full h-32 object-cover rounded-lg" />
          )}
        </div>
      ))}
    </div>
  )
}
