'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { DishAIConfirmationModal } from '@/components/DishAIConfirmationModal'
import { useRouter, useSearchParams } from 'next/navigation'
import ErrorState from '@/components/ErrorState'
import TransformedImage from '@/components/TransformedImage'
import PhotoAdjustSheet from '@/components/PhotoAdjustSheet'
import {
  DEFAULT_IMAGE_TRANSFORM,
  type ImageTransform,
  isAdjustmentRecommended,
} from '@/lib/image-transform'
import { apiPath, withBasePath } from '@/lib/base-path'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowState =
  | 'idle'
  | 'converting_image'
  | 'analyzing'
  | 'analysis_success'
  | 'analysis_error'

type Session = {
  memberId: string
  memberName: string
  groupId: string
  groupName: string
}

type Prediction = {
  placeId: string
  text: string
  secondaryText: string
  distanceMeters: number | null
  rating: number | null
}

type PlaceDetails = {
  google_place_id: string
  name: string
  formatted_address: string | null
  lat: number | null
  lng: number | null
  rating: number | null
  user_rating_count: number | null
}

type Category = {
  id: string
  name: string
}

type DishSignals = {
  image_score: number
  place_score: number
  visual_memory_score: number
}

// ─── Main Component ──────────────────────────────────────────────────────────

function AddPlaceInner() {
  // All hooks/state must be inside the function
  // ...existing state, refs, and logic here...
  // For brevity, insert your logic, hooks, and handlers here as in your original file

  // Example minimal state for demonstration:
  const [showDishSavedToast, setShowDishSavedToast] = useState(false)
  const [showAdjustSheet, setShowAdjustSheet] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageTransform, setImageTransform] = useState<ImageTransform>(DEFAULT_IMAGE_TRANSFORM)
  const [isTransformCustomized, setIsTransformCustomized] = useState(false)

  // ...all your other hooks, handlers, and logic...

  return (
    <main className="min-h-screen bg-[#f5f6f8] pb-28" style={{ overflowX: 'hidden', maxWidth: '100vw' }}>
      {/* ...all your JSX and UI logic here, exactly as in your working version... */}

      {/* Example: */}
      {showDishSavedToast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          Dish saved. Future suggestions will improve.
        </div>
      )}

      <PhotoAdjustSheet
        isOpen={showAdjustSheet}
        src={previewUrl}
        initialTransform={imageTransform}
        onCancel={() => setShowAdjustSheet(false)}
        onDone={(nextTransform) => {
          setImageTransform(nextTransform)
          setIsTransformCustomized(true)
          setShowAdjustSheet(false)
        }}
      />
    </main>
  )
}

// ─── Suspense wrapper (required by Next.js for useSearchParams) ───────────────

export default function AddPlace() {
  return (
    <Suspense>
      <AddPlaceInner />
    </Suspense>
  )
}