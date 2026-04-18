'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import TransformedImage from '@/components/TransformedImage'
import {
  DEFAULT_IMAGE_TRANSFORM,
  MAX_IMAGE_SCALE,
  MIN_IMAGE_SCALE,
  type FrameSize,
  type ImageSize,
  type ImageTransform,
  clampTransform,
  coerceTransform,
} from '@/lib/image-transform'

type PhotoFrameEditorProps = {
  src: string
  initialTransform?: ImageTransform
  onCancel: () => void
  onDone: (transform: ImageTransform) => void
}

export default function PhotoFrameEditor({ src, initialTransform, onCancel, onDone }: PhotoFrameEditorProps) {
  const [frameSize, setFrameSize] = useState<FrameSize>({ width: 0, height: 0 })
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 })
  const [transform, setTransform] = useState<ImageTransform>(() => coerceTransform(initialTransform))

  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)

  useEffect(() => {
    setTransform(coerceTransform(initialTransform))
  }, [initialTransform, src])

  const canClamp = Boolean(frameSize.width && frameSize.height && imageSize.width && imageSize.height)

  const safeTransform = useMemo(
    () => (canClamp ? clampTransform(transform, frameSize, imageSize) : coerceTransform(transform)),
    [transform, frameSize, imageSize, canClamp],
  )

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY }

    setTransform((prev) => {
      const candidate: ImageTransform = {
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy,
      }
      return canClamp ? clampTransform(candidate, frameSize, imageSize) : candidate
    })
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag && drag.pointerId === event.pointerId) {
      dragRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const reset = () => setTransform(DEFAULT_IMAGE_TRANSFORM)

  return (
    <div className="space-y-4">
      <div
        className="relative"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <TransformedImage
          src={src}
          alt="Adjust photo preview"
          transform={safeTransform}
          className="aspect-video rounded-2xl border border-neutral-200 bg-neutral-100"
          onMetrics={({ frame, image }) => {
            setFrameSize(frame)
            setImageSize(image)
          }}
        />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="zoom" className="text-xs font-medium text-neutral-600">Zoom</label>
          <span className="text-xs text-neutral-500">{safeTransform.scale.toFixed(2)}x</span>
        </div>
        <input
          id="zoom"
          type="range"
          min={MIN_IMAGE_SCALE}
          max={MAX_IMAGE_SCALE}
          step={0.01}
          value={safeTransform.scale}
          onChange={(event) => {
            const nextScale = Number(event.target.value)
            setTransform((prev) => {
              const candidate = { ...prev, scale: nextScale }
              return canClamp ? clampTransform(candidate, frameSize, imageSize) : candidate
            })
          }}
          className="w-full accent-teal-700"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Reset
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onDone(safeTransform)}
            className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
