// Renders showcase items (places) for a category
import { supabase } from '@/lib/supabase'
import { categoryToSlug, normalizeCategoryKey } from '@/lib/category-utils'
import BeAChefButton from '@/components/showcase/BeAChefButton'
import { mapUrl } from '@/lib/nearby-helpers'

export default async function ShowcaseDetailItems({ category, enableBeAChef = false }: { category: string; enableBeAChef?: boolean }) {
  // Fetch places for this category, only from public groups
  const { data, error } = await supabase
    .from('place_categories')
    .select(`
      place_id,
      category_id,
      food_categories!inner(id, group_id, groups!inner(id, visibility)),
      places ( name, formatted_address, photo_urls, google_rating, google_rating_count, lat, lng, google_place_id )
    `)
    .eq('category_id', category)
    .not('food_categories.group_id', 'is', null)
    .eq('food_categories.groups.visibility', 'public')
  if (error) {
    if (typeof console !== 'undefined') {
      console.log('[ShowcaseDetailItems.tsx] Error or no data', { error, data });
    }
    return <div className="text-red-400">{require('@/lib/ui-messages').UIMessages.errorLoad}</div>;
  }
  if (!data || data.length === 0) {
    if (typeof console !== 'undefined') {
      console.log('[ShowcaseDetailItems.tsx] No data for category', { category });
    }
    const { UIMessages } = require('@/lib/ui-messages');
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-4xl mb-3">🍽️</div>
        <div className="text-lg font-bold text-neutral-500 mb-2">{UIMessages.emptyShowcase}</div>
        <div className="text-base text-neutral-400 mb-4">{UIMessages.emptyNoShowcases}</div>
      </div>
    );
  }
  if (typeof console !== 'undefined') {
    console.log('[ShowcaseDetailItems.tsx] Fetched rows:', data.length);
    const groupIds = data.map((row: any) => row.food_categories?.groups?.id).filter(Boolean);
    console.log('[ShowcaseDetailItems.tsx] Group IDs:', groupIds);
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-7 mt-8">
      {data.map((row: any) => {
        const photoUrl = row.places?.photo_urls?.[0] ?? null
        const mapsHref = mapUrl(row.places?.lat, row.places?.lng, row.places?.name, row.places?.google_place_id)
        return (
          <div
            key={row.place_id}
            className="group relative rounded-3xl bg-white/95 border border-neutral-100 shadow-lg p-4 flex flex-col items-stretch hover:shadow-xl transition min-h-[220px] backdrop-blur-sm"
          >
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-stretch cursor-pointer w-full"
              title="Open in Google Maps"
            >
              <div className="relative w-full">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={row.places?.name}
                    className="w-full h-40 object-cover rounded-2xl bg-neutral-100 shadow-sm"
                  />
                ) : (
                  <div className="w-full h-40 rounded-2xl bg-neutral-100 flex items-center justify-center text-3xl text-neutral-300">🍽️</div>
                )}
                {row.places?.google_rating != null && (
                  <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500/95 px-2.5 py-1 text-[11px] font-bold text-white shadow-md backdrop-blur-sm">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    {Number(row.places.google_rating).toFixed(1)}
                  </span>
                )}
              </div>
              <div className="px-2 pt-3">
                <div className="font-extrabold text-base text-neutral-900 mb-0.5 truncate w-full">{row.places?.name}</div>
                <div className="text-xs text-neutral-500 mb-1 truncate w-full">{row.places?.formatted_address}</div>
                <div className="text-[11px] text-neutral-400">{row.places?.google_rating_count ?? 0} ratings</div>
              </div>
            </a>

            <div className="mt-3 flex items-center justify-between gap-2 px-2 pb-1">
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-700 shadow-sm hover:border-neutral-300 hover:bg-neutral-50"
                aria-label="Open in Google Maps"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#1a73e8]" fill="currentColor" aria-hidden>
                  <path d="M12 2a7 7 0 0 0-7 7c0 4.97 5.4 11.31 6.4 12.45a.8.8 0 0 0 1.2 0C13.6 20.31 19 13.97 19 9a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
                </svg>
                Maps
              </a>

              {enableBeAChef && photoUrl ? (
                <BeAChefButton
                  photoUrl={photoUrl}
                  placeName={row.places?.name ?? null}
                />
              ) : (
                <span aria-hidden />
              )}
            </div>
          </div>
        )
      })}
    </div>
  );
}
