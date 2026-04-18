'use client'

import { useEffect } from 'react'
import PhotoFrameEditor from '@/components/PhotoFrameEditor'
import { type ImageTransform } from '@/lib/image-transform'

type PhotoAdjustSheetProps = {
  isOpen: boolean
  src: string | null
  initialTransform?: ImageTransform
  onCancel: () => void
  onDone: (transform: ImageTransform) => void
}

export default function PhotoAdjustSheet({ isOpen, src, initialTransform, onCancel, onDone }: PhotoAdjustSheetProps) {
  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen || !src) return null

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        aria-label="Close photo adjust sheet"
        onClick={onCancel}
        className="nearby-sheet-backdrop absolute inset-0 bg-black/35 backdrop-blur-[1px]"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <section className="nearby-sheet-panel pointer-events-auto w-full max-w-md rounded-t-3xl border border-neutral-200 bg-white p-4 shadow-2xl transition-transform duration-300 ease-out">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-neutral-300" />

          <h2 className="text-lg font-semibold text-neutral-900">Adjust photo</h2>
          <p className="mt-1 text-sm text-neutral-600">Drag and zoom so your photo looks right in the final preview.</p>
          <p className="mt-1 text-xs text-neutral-500">This only affects how the photo is displayed.</p>

          <div className="mt-4">
            <PhotoFrameEditor
              src={src}
              initialTransform={initialTransform}
              onCancel={onCancel}
              onDone={onDone}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
