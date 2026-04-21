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
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-4xl mb-3">🍽️</div>
        <div className="text-lg font-bold text-neutral-500 mb-2">No places found for this category yet.</div>
        <div className="text-base text-neutral-400 mb-4">Be the first to recommend a spot for this showcase!</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
      {data.map((row: any) => (
        <div
          key={row.place_id}
          className="rounded-3xl bg-white border border-neutral-200 shadow-sm p-5 flex flex-col items-start hover:shadow-lg transition cursor-pointer min-h-[220px]"
        >
          {row.places?.photo_urls?.length > 0 ? (
            <img
              src={row.places.photo_urls[0]}
              alt={row.places.name}
              className="w-full h-36 object-cover rounded-2xl mb-3 bg-neutral-100"
            />
          ) : (
            <div className="w-full h-36 rounded-2xl mb-3 bg-neutral-100 flex items-center justify-center text-3xl text-neutral-300">🍽️</div>
          )}
          <div className="font-bold text-lg text-neutral-900 mb-1 truncate w-full">{row.places?.name}</div>
          <div className="text-xs text-neutral-500 mb-2 truncate w-full">{row.places?.formatted_address}</div>
          <div className="flex gap-2 text-xs text-yellow-700 mb-2">
            <span>⭐ {row.places?.google_rating ?? 'N/A'}</span>
            <span>({row.places?.google_rating_count ?? 0} ratings)</span>
          </div>
        </div>
      ))}
    </div>
  );
}
