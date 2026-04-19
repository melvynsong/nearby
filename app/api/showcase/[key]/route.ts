import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleSupabaseClient } from '@/lib/server-supabase'
import { getShowcaseConfigByKey } from '@/lib/showcase-config'
import { rankShowcaseItems, type RawShowcaseRow } from '@/lib/showcase-utils'

type PlaceRow = {
  id: string
  name: string
  formatted_address: string | null
  lat: number | null
  lng: number | null
  photo_urls: string[]
  google_place_id: string | null
  google_rating: number | null
  google_rating_count: number | null
}

async function fetchGoogleRating(
  googlePlaceId: string,
  apiKey: string,
): Promise<{ rating: number | null; ratingCount: number | null }> {
  const fields = ['rating', 'userRatingCount'].join(',')
  const res = await fetch(`https://places.googleapis.com/v1/places/${googlePlaceId}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fields,
    },
    signal: AbortSignal.timeout(6000),
  })

  if (!res.ok) {
    return { rating: null, ratingCount: null }
  }

  const data = await res.json() as { rating?: number; userRatingCount?: number }
  return {
    rating: typeof data.rating === 'number' ? data.rating : null,
    ratingCount: typeof data.userRatingCount === 'number' ? data.userRatingCount : null,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const db = getServiceRoleSupabaseClient()
    const { key } = await params
    const config = await getShowcaseConfigByKey(db, key)

    if (!config) {
      return NextResponse.json({ ok: false, message: 'Showcase not found.' }, { status: 404 })
    }

    // 1. Get place_ids linked to this aggregated category name across groups.
    const { data: pcRows, error: pcErr } = await db
      .from('place_categories')
      .select('place_id, category_id')
      .in('category_id', config.categoryIds)

    if (pcErr) {
      console.error('[Showcase] place_categories fetch error:', pcErr)
      return NextResponse.json({ ok: false, message: 'Data fetch failed.' }, { status: 500 })
    }

    const placeIdToDishName = new Map<string, string>()
    for (const row of (pcRows ?? []) as { place_id: string; category_id: string }[]) {
      placeIdToDishName.set(row.place_id, config.title)
    }

    const placeIds = [...placeIdToDishName.keys()]
    if (!placeIds.length) {
      return NextResponse.json({
        ok: true,
        items: [],
        title: config.fullTitle(0),
        config: { key: config.key, tagline: config.tagline },
      })
    }

    // 2. Fetch place data (name, address, coords, photos, rating)
    const { data: placeRows, error: placeErr } = await db
      .from('places')
      .select('id, name, formatted_address, lat, lng, photo_urls, google_place_id, google_rating, google_rating_count')
      .in('id', placeIds)

    if (placeErr) {
      console.error('[Showcase] places fetch error:', placeErr)
      return NextResponse.json({ ok: false, message: 'Data fetch failed.' }, { status: 500 })
    }

    // 2b. Backfill missing Google ratings for older place rows.
    const placesWithRatings: PlaceRow[] = [...(placeRows ?? []) as PlaceRow[]]
    const googleApiKey = process.env.GOOGLE_PLACES_SERVER_KEY
    if (googleApiKey) {
      const missingRatingRows = placesWithRatings.filter((p) => p.google_rating == null && typeof p.google_place_id === 'string' && p.google_place_id)
      for (const row of missingRatingRows) {
        try {
          const { rating, ratingCount } = await fetchGoogleRating(row.google_place_id as string, googleApiKey)
          if (rating == null && ratingCount == null) continue

          row.google_rating = rating
          row.google_rating_count = ratingCount

          await db
            .from('places')
            .update({
              google_rating: rating,
              google_rating_count: ratingCount,
            })
            .eq('id', row.id)
        } catch {
          // Non-fatal: continue with available data
        }
      }
    }

    // 3. Count unique member recommendations (saves) per place.
    const { data: recCounts, error: recErr } = await db
      .from('recommendations')
      .select('place_id, member_id')
      .in('place_id', placeIds)

    if (recErr) {
      console.warn('[Showcase] recommendations count fetch failed (non-fatal):', recErr)
    }

    const saveTokensByPlaceId = new Map<string, Set<string>>()
    for (const row of (recCounts ?? []) as { place_id: string; member_id: string | null }[]) {
      const token = row.member_id ? `${row.place_id}:${row.member_id}` : row.place_id
      const tokens = saveTokensByPlaceId.get(row.place_id) ?? new Set<string>()
      tokens.add(token)
      saveTokensByPlaceId.set(row.place_id, tokens)
    }

    const savesByPlaceId = new Map<string, number>()
    for (const [placeId, tokens] of saveTokensByPlaceId.entries()) {
      savesByPlaceId.set(placeId, tokens.size)
    }

    // 4. Assemble raw rows
    const rawRows: RawShowcaseRow[] = placesWithRatings
      .filter((p: { google_rating?: number | null }) => p.google_rating != null || savesByPlaceId.get((p as { id: string }).id) != null)
      .map((p: {
        id: string; name: string; formatted_address: string | null;
        lat: number | null; lng: number | null; photo_urls: string[];
        google_rating: number | null; google_rating_count: number | null
      }) => ({
        placeId: p.id,
        placeName: p.name,
        dishName: placeIdToDishName.get(p.id) ?? config.title,
        address: p.formatted_address,
        lat: p.lat,
        lng: p.lng,
        photos: (p.photo_urls ?? []).slice(0, 4),
        googleRating: p.google_rating,
        googleRatingCount: p.google_rating_count,
        saveCount: savesByPlaceId.get(p.id) ?? 0,
      }))

    // 5. Rank
    const items = rankShowcaseItems(rawRows, config.rankingStrategy, config.maxItemsToShow)

    // Only publish showcase if we meet minimum threshold
    if (items.length < config.minItemsToShow) {
      return NextResponse.json({
        ok: true,
        items: [],
        title: config.fullTitle(0),
        insufficient: true,
        config: {
          key: config.key,
          title: config.title,
          tagline: config.tagline,
          description: config.editorialDescription,
          heroGradientFrom: config.heroGradientFrom,
          heroGradientTo: config.heroGradientTo,
          emoji: config.emoji,
        },
      })
    }

    console.log('[Showcase] Built showcase', { key, itemCount: items.length })

    return NextResponse.json({
      ok: true,
      items,
      title: config.fullTitle(items.length),
      config: {
        key: config.key,
        title: config.title,
        tagline: config.tagline,
        description: config.editorialDescription,
        heroGradientFrom: config.heroGradientFrom,
        heroGradientTo: config.heroGradientTo,
        emoji: config.emoji,
      },
    })
  } catch (err) {
    console.error('[Showcase] Unexpected error:', err)
    return NextResponse.json({ ok: false, message: 'Could not load showcase.' }, { status: 500 })
  }
}
