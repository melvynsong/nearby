import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'
import { incrementPlaceDishAddCount, confirmDishSelection } from '@/lib/dish-memory'

// Service-role fallback so we can run locally without the env var
function getDb() {
  try {
    const { getServiceRoleSupabaseClient } = require('@/lib/server-supabase')
    return getServiceRoleSupabaseClient()
  } catch {
    return getServerSupabaseClient()
  }
}

async function resolveIndividualId(memberId: string): Promise<string> {
  if (!memberId) return ''
  const db = getDb()
  const result = await db
    .from('members')
    .select('user_id')
    .eq('id', memberId)
    .maybeSingle()
  return result.data?.user_id ?? memberId
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const memberId   = (formData.get('memberId')      as string | null) ?? ''
    const groupId    = (formData.get('groupId')       as string | null) ?? ''
    const googlePlaceId = (formData.get('googlePlaceId') as string | null) ?? ''
    const name       = (formData.get('name')          as string | null) ?? ''
    const address    = (formData.get('address')       as string | null) ?? null
    const latRaw     = formData.get('lat')      as string | null
    const lngRaw     = formData.get('lng')      as string | null
    const dishName   = ((formData.get('dishName')     as string | null) ?? '').trim()
    const note       = ((formData.get('note')         as string | null) ?? '').trim()
    const imageTransformRaw = (formData.get('imageTransform') as string | null) ?? ''
    const editPlaceId = ((formData.get('editPlaceId') as string | null) ?? '').trim()
    const file       = formData.get('file') as File | null
    const analysisEventId = ((formData.get('analysisEventId') as string | null) ?? '').trim()
    const googleRatingRaw = formData.get('googleRating') as string | null
    const googleRatingCountRaw = formData.get('googleRatingCount') as string | null
    const googleRating = googleRatingRaw ? parseFloat(googleRatingRaw) : null
    const googleRatingCount = googleRatingCountRaw ? parseInt(googleRatingCountRaw, 10) : null

    if (!memberId || !groupId || !googlePlaceId || !name) {
      return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 })
    }

    const lat = latRaw ? parseFloat(latRaw) : null
    const lng = lngRaw ? parseFloat(lngRaw) : null

    const db = getDb()

    // ── 1. Resolve food_category id (create if needed) ────────────────────
    let categoryId: string | null = null
    if (dishName) {
      const { data: existingCat } = await db
        .from('food_categories')
        .select('id')
        .eq('group_id', groupId)
        .ilike('name', dishName)
        .maybeSingle()

      if (existingCat?.id) {
        categoryId = existingCat.id
      } else {
        const { data: newCat, error: catErr } = await db
          .from('food_categories')
          .insert({ name: dishName, group_id: groupId, created_by_member_id: memberId })
          .select('id')
          .single()

        if (newCat?.id) {
          categoryId = newCat.id
        } else if (catErr) {
          // Possible race condition — try select again
          const { data: raceCat } = await db
            .from('food_categories')
            .select('id')
            .eq('group_id', groupId)
            .ilike('name', dishName)
            .maybeSingle()
          categoryId = raceCat?.id ?? null
        }
      }
    }

    // ── 2. Resolve / insert place ─────────────────────────────────────────
    let placeId: string
    let existingPhotoUrls: string[] = []
    let existingImageTransforms: Record<string, unknown> = {}
    let ownerRecommendationId = ''
    const individualId = await resolveIndividualId(memberId)

    if (editPlaceId) {
      const ownerRecommendationResult = await db
        .from('recommendations')
        .select('id, member_id, created_at')
        .eq('place_id', editPlaceId)
        .eq('group_id', groupId)
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(1)

      const ownerRecommendation = (ownerRecommendationResult.data ?? [])[0] ?? null

      if (ownerRecommendationResult.error || !ownerRecommendation?.id) {
        console.log('[PlaceEdit]', {
          place_id: editPlaceId,
          individual_id: individualId,
          is_owner: false,
          action: 'save_edit',
        })
        return NextResponse.json({ ok: false, message: 'You cannot edit this place.' }, { status: 403 })
      }

      const editPlaceResult = await db
        .from('places')
        .select('id, photo_urls, image_transforms')
        .eq('id', editPlaceId)
        .maybeSingle()

      if (editPlaceResult.error || !editPlaceResult.data?.id) {
        return NextResponse.json({ ok: false, message: 'Place not found.' }, { status: 404 })
      }

      placeId = editPlaceId
      ownerRecommendationId = ownerRecommendation.id
      existingPhotoUrls = editPlaceResult.data.photo_urls ?? []
      existingImageTransforms = ((editPlaceResult.data as { image_transforms?: Record<string, unknown> }).image_transforms) ?? {}

      await db
        .from('places')
        .update({
          google_place_id: googlePlaceId,
          name,
          formatted_address: address,
          lat,
          lng,
        })
        .eq('id', placeId)
    } else {

      const preferredLookup = await db
        .from('places')
        .select('id, photo_urls, image_transforms, lat, lng')
        .eq('google_place_id', googlePlaceId)
        .maybeSingle()

      let existingPlace = preferredLookup.data
      let lookupErr = preferredLookup.error

      if (lookupErr && lookupErr.code === '42703') {
        const fallbackLookup = await db
          .from('places')
          .select('id, photo_urls, lat, lng')
          .eq('google_place_id', googlePlaceId)
          .maybeSingle()
        existingPlace = fallbackLookup.data
        lookupErr = fallbackLookup.error
      }

      if (lookupErr) {
        console.error('[Nearby][API][Save] Place lookup error:', lookupErr)
        return NextResponse.json({ ok: false, message: 'Could not look up place.' }, { status: 500 })
      }

      if (existingPlace) {
        placeId = existingPlace.id
        existingPhotoUrls = existingPlace.photo_urls ?? []
        existingImageTransforms = ((existingPlace as { image_transforms?: Record<string, unknown> }).image_transforms) ?? {}

        const coordUpdate: Record<string, unknown> = {}
        if ((existingPlace.lat == null || existingPlace.lng == null) && lat != null && lng != null) {
          coordUpdate.lat = lat
          coordUpdate.lng = lng
        }
        // Always refresh rating data when the user re-saves a known place
        if (googleRating != null) coordUpdate.google_rating = googleRating
        if (googleRatingCount != null) coordUpdate.google_rating_count = googleRatingCount
        if (Object.keys(coordUpdate).length > 0) {
          await db.from('places').update(coordUpdate).eq('id', placeId)
        }
      } else {
        const { data: inserted, error: insertErr } = await db
          .from('places')
          .insert({ google_place_id: googlePlaceId, name, formatted_address: address, lat, lng, photo_urls: [], google_rating: googleRating, google_rating_count: googleRatingCount })
          .select('id')
          .single()

        if (insertErr || !inserted) {
          console.error('[Nearby][API][Save] Place insert error:', insertErr)
          return NextResponse.json({ ok: false, message: 'Could not create place record.' }, { status: 500 })
        }
        placeId = inserted.id
      }
    }

    // ── 3. Upload photo to storage (server-side) ──────────────────────────
    if (file && file.size > 0) {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
      const path = `${placeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const fileBuffer = await file.arrayBuffer()
      const fileBytes  = new Uint8Array(fileBuffer)

      const { error: uploadErr } = await db.storage
        .from('nearby-place-photos')
        .upload(path, fileBytes, { contentType: file.type || 'image/jpeg', upsert: false })

      if (uploadErr) {
        console.error('[Nearby][API][Save] Photo upload error:', uploadErr)
        return NextResponse.json({ ok: false, message: 'Photo upload failed.' }, { status: 500 })
      }

      const { data: urlData } = db.storage.from('nearby-place-photos').getPublicUrl(path)
      const newUrl = urlData.publicUrl

      const merged = [...new Set([...existingPhotoUrls, newUrl])]
      let nextImageTransforms = existingImageTransforms
      if (imageTransformRaw) {
        try {
          const parsed = JSON.parse(imageTransformRaw)
          nextImageTransforms = { ...existingImageTransforms, [newUrl]: parsed }
        } catch {
          nextImageTransforms = existingImageTransforms
        }
      }

      const preferredUpdate = await db
        .from('places')
        .update({ photo_urls: merged, image_transforms: nextImageTransforms })
        .eq('id', placeId)

      let updateErr = preferredUpdate.error
      if (updateErr && updateErr.code === '42703') {
        const fallbackUpdate = await db
          .from('places')
          .update({ photo_urls: merged })
          .eq('id', placeId)
        updateErr = fallbackUpdate.error
      }

      if (updateErr) {
        console.error('[Nearby][API][Save] Photo url update error:', updateErr)
        // non-fatal — place was created, continue
      }
    }

    // ── 4. Insert/update recommendation ───────────────────────────────────
    let recErr: { message?: string } | null = null

    if (editPlaceId) {
      const updateRecommendationResult = await db
        .from('recommendations')
        .update({ note: note || null })
        .eq('id', ownerRecommendationId)

      recErr = updateRecommendationResult.error as { message?: string } | null

      console.log('[PlaceEdit]', {
        place_id: editPlaceId,
        individual_id: individualId,
        is_owner: true,
        action: 'save_edit',
      })
    } else {
      const existingRecommendationResult = await db
        .from('recommendations')
        .select('id')
        .eq('group_id', groupId)
        .eq('member_id', memberId)
        .eq('place_id', placeId)
        .order('created_at', { ascending: false })
        .limit(1)

      const existingRecommendation = (existingRecommendationResult.data ?? [])[0] ?? null

      if (existingRecommendationResult.error) {
        recErr = existingRecommendationResult.error as { message?: string } | null
      } else if (existingRecommendation?.id) {
        const updateExistingRecommendationResult = await db
          .from('recommendations')
          .update({ note: note || null })
          .eq('id', existingRecommendation.id)

        recErr = updateExistingRecommendationResult.error as { message?: string } | null
      } else {
        const insertRecommendationResult = await db.from('recommendations').insert({
          group_id: groupId,
          member_id: memberId,
          place_id: placeId,
          note: note || null,
        })
        recErr = insertRecommendationResult.error as { message?: string } | null
      }
    }

    if (recErr) {
      console.error('[Nearby][API][Save] Recommendation insert error:', recErr)
      return NextResponse.json({ ok: false, message: 'Could not save recommendation.' }, { status: 500 })
    }

    // ── 5. Link category ──────────────────────────────────────────────────
    if (categoryId) {
      const { error: catLinkErr } = await db
        .from('place_categories')
        .upsert({ place_id: placeId, category_id: categoryId }, { onConflict: 'place_id,category_id' })

      if (catLinkErr) {
        console.error('[Nearby][API][Save] Category link error:', catLinkErr)
        // non-fatal
      }
    }

    // ── 6. Update dish intelligence (non-blocking, non-fatal) ─────────────
    if (dishName && placeId) {
      void incrementPlaceDishAddCount(placeId, dishName)

      // If we have an analysis event ID, mark it as confirmed with full context
      if (analysisEventId) {
        const savedPhotoUrl = (() => {
          // Retrieve the latest photo URL we just uploaded (last in the array)
          return null // photo URL retrieved async below — handled in confirm call
        })()
        void confirmDishSelection({
          analysisEventId,
          selectedDishName: dishName,
          placeId,
          photoUrl: savedPhotoUrl,
        })
      }
    }

    return NextResponse.json({ ok: true, placeId })
  } catch (err) {
    console.error('[Nearby][API][Save] Unexpected error:', err)
    return NextResponse.json({ ok: false, message: 'An unexpected error occurred.' }, { status: 500 })
  }
}
