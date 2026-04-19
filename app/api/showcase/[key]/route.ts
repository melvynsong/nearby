import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleSupabaseClient } from '@/lib/server-supabase'
import { getShowcaseConfigByKey } from '@/lib/showcase-config'
import { rankShowcaseItems, type RawShowcaseRow } from '@/lib/showcase-utils'

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

    // 1. Get place_ids linked to this category
    const { data: pcRows, error: pcErr } = await db
      .from('place_categories')
      .select('place_id, category_id')
      .eq('category_id', config.categoryId)

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
      .select('id, name, formatted_address, lat, lng, photo_urls, google_rating, google_rating_count')
      .in('id', placeIds)

    if (placeErr) {
      console.error('[Showcase] places fetch error:', placeErr)
      return NextResponse.json({ ok: false, message: 'Data fetch failed.' }, { status: 500 })
    }

    // 3. Count recommendations (saves) per place
    const { data: recCounts, error: recErr } = await db
      .from('recommendations')
      .select('place_id')
      .in('place_id', placeIds)

    if (recErr) {
      console.warn('[Showcase] recommendations count fetch failed (non-fatal):', recErr)
    }

    const savesByPlaceId = new Map<string, number>()
    for (const row of (recCounts ?? []) as { place_id: string }[]) {
      savesByPlaceId.set(row.place_id, (savesByPlaceId.get(row.place_id) ?? 0) + 1)
    }

    // 4. Assemble raw rows
    const rawRows: RawShowcaseRow[] = (placeRows ?? [])
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
