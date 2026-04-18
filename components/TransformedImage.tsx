'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_IMAGE_TRANSFORM,
  type FrameSize,
  type ImageSize,
  type ImageTransform,
  clampTransform,
  coerceTransform,
  getCoverBaseScale,
} from '@/lib/image-transform'

type TransformedImageProps = {
  src: string
  alt: string
  transform?: ImageTransform
  className?: string
  imageClassName?: string
  onMetrics?: (payload: { frame: FrameSize; image: ImageSize }) => void
}

export default function TransformedImage({
  src,
  alt,
  transform = DEFAULT_IMAGE_TRANSFORM,
  className = 'aspect-video rounded-2xl border border-neutral-200 bg-neutral-100',
  imageClassName = '',
  onMetrics,
}: TransformedImageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [frameSize, setFrameSize] = useState<FrameSize>({ width: 0, height: 0 })
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 })

  useEffect(() => {
    const node = frameRef.current
    if (!node) return

    const update = () => {
      const rect = node.getBoundingClientRect()
      setFrameSize({ width: rect.width, height: rect.height })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    const img = new Image()
    img.onload = () => {
      if (!active) return
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.src = src
    return () => {
      active = false
    }
  }, [src])

  useEffect(() => {
    if (!onMetrics) return
    if (!frameSize.width || !frameSize.height || !imageSize.width || !imageSize.height) return
    onMetrics({ frame: frameSize, image: imageSize })
  }, [frameSize, imageSize, onMetrics])

  const safeTransform = useMemo(
    () => clampTransform(coerceTransform(transform), frameSize, imageSize),
    [transform, frameSize, imageSize],
  )

  const baseScale = useMemo(() => getCoverBaseScale(frameSize, imageSize), [frameSize, imageSize])
  const baseWidth = imageSize.width * baseScale
  const baseHeight = imageSize.height * baseScale

  return (
    <div ref={frameRef} className={`relative w-full overflow-hidden ${className}`}>
      {Boolean(baseWidth && baseHeight) && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: 'translate3d(-50%, -50%, 0)' }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            className={`select-none object-cover ${imageClassName}`}
            style={{
              width: `${baseWidth}px`,
              height: `${baseHeight}px`,
              maxWidth: 'none',
              transformOrigin: 'center center',
              transform: `translate3d(${safeTransform.offsetX}px, ${safeTransform.offsetY}px, 0) scale(${safeTransform.scale})`,
              willChange: 'transform',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}
    </div>
  )
}
