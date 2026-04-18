import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

// Service-role fallback so we can run locally without the env var
function getDb() {
  try {
    const { getServiceRoleSupabaseClient } = require('@/lib/server-supabase')
    return getServiceRoleSupabaseClient()
  } catch {
    return getServerSupabaseClient()
  }
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
    const imageTransformRaw = formData.get('imageTransform') as string | null
    const file       = formData.get('file') as File | null

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

    const { data: existingPlace, error: lookupErr } = await db
      .from('places')
      .select('id, photo_urls, image_transforms, lat, lng')
      .eq('google_place_id', googlePlaceId)
      .maybeSingle()

    if (lookupErr) {
      console.error('[Nearby][API][Save] Place lookup error:', lookupErr)
      return NextResponse.json({ ok: false, message: 'Could not look up place.' }, { status: 500 })
    }

    if (existingPlace) {
      placeId = existingPlace.id
      existingPhotoUrls = existingPlace.photo_urls ?? []
      existingImageTransforms = (existingPlace.image_transforms as Record<string, unknown> | null) ?? {}

      if ((existingPlace.lat == null || existingPlace.lng == null) && lat != null && lng != null) {
        await db.from('places').update({ lat, lng }).eq('id', placeId)
      }
    } else {
      const { data: inserted, error: insertErr } = await db
        .from('places')
        .insert({ google_place_id: googlePlaceId, name, formatted_address: address, lat, lng, photo_urls: [] })
        .select('id')
        .single()

      if (insertErr || !inserted) {
        console.error('[Nearby][API][Save] Place insert error:', insertErr)
        return NextResponse.json({ ok: false, message: 'Could not create place record.' }, { status: 500 })
      }
      placeId = inserted.id
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

      // Merge image transform
      let updatedTransforms = { ...existingImageTransforms }
      if (imageTransformRaw) {
        try {
          updatedTransforms[newUrl] = JSON.parse(imageTransformRaw)
        } catch {
          // ignore bad transform JSON
        }
      }

      const merged = [...new Set([...existingPhotoUrls, newUrl])]
      const { error: updateErr } = await db
        .from('places')
        .update({ photo_urls: merged, image_transforms: updatedTransforms })
        .eq('id', placeId)

      if (updateErr) {
        console.error('[Nearby][API][Save] Photo url update error:', updateErr)
        // non-fatal — place was created, continue
      }
    }

    // ── 4. Insert recommendation ──────────────────────────────────────────
    const { error: recErr } = await db.from('recommendations').insert({
      group_id: groupId,
      member_id: memberId,
      place_id: placeId,
      note: note || null,
    })

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

    return NextResponse.json({ ok: true, placeId })
  } catch (err) {
    console.error('[Nearby][API][Save] Unexpected error:', err)
    return NextResponse.json({ ok: false, message: 'An unexpected error occurred.' }, { status: 500 })
  }
}
