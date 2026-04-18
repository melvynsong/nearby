export type ImageTransform = {
  scale: number
  offsetX: number
  offsetY: number
}

export type FrameSize = {
  width: number
  height: number
}

export type ImageSize = {
  width: number
  height: number
}

export type TransformMap = Record<string, ImageTransform>

export const CARD_ASPECT_RATIO = 16 / 9
export const MIN_IMAGE_SCALE = 1
export const MAX_IMAGE_SCALE = 3

export const DEFAULT_IMAGE_TRANSFORM: ImageTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function normalizeScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_IMAGE_SCALE
  return clamp(scale, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE)
}

export function getCoverBaseScale(frame: FrameSize, image: ImageSize): number {
  if (!frame.width || !frame.height || !image.width || !image.height) {
    return 1
  }

  return Math.max(frame.width / image.width, frame.height / image.height)
}

export function getOffsetBounds(frame: FrameSize, image: ImageSize, scale: number): { maxX: number; maxY: number } {
  if (!frame.width || !frame.height || !image.width || !image.height) {
    return { maxX: 0, maxY: 0 }
  }

  const baseScale = getCoverBaseScale(frame, image)
  const renderedWidth = image.width * baseScale * scale
  const renderedHeight = image.height * baseScale * scale

  return {
    maxX: Math.max(0, (renderedWidth - frame.width) / 2),
    maxY: Math.max(0, (renderedHeight - frame.height) / 2),
  }
}

export function clampTransform(transform: ImageTransform, frame: FrameSize, image: ImageSize): ImageTransform {
  const nextScale = normalizeScale(transform.scale)
  const bounds = getOffsetBounds(frame, image, nextScale)

  return {
    scale: nextScale,
    offsetX: clamp(transform.offsetX, -bounds.maxX, bounds.maxX),
    offsetY: clamp(transform.offsetY, -bounds.maxY, bounds.maxY),
  }
}

export function coerceTransform(input: unknown): ImageTransform {
  if (!input || typeof input !== 'object') {
    return DEFAULT_IMAGE_TRANSFORM
  }

  const candidate = input as Partial<ImageTransform>
  const scale = typeof candidate.scale === 'number' ? candidate.scale : DEFAULT_IMAGE_TRANSFORM.scale
  const offsetX = typeof candidate.offsetX === 'number' ? candidate.offsetX : DEFAULT_IMAGE_TRANSFORM.offsetX
  const offsetY = typeof candidate.offsetY === 'number' ? candidate.offsetY : DEFAULT_IMAGE_TRANSFORM.offsetY

  return {
    scale: normalizeScale(scale),
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: Number.isFinite(offsetY) ? offsetY : 0,
  }
}

export function readTransformFromMap(map: unknown, imageUrl: string): ImageTransform {
  if (!map || typeof map !== 'object') return DEFAULT_IMAGE_TRANSFORM
  const record = map as Record<string, unknown>
  return coerceTransform(record[imageUrl])
}

export function upsertTransformInMap(map: unknown, imageUrl: string, transform: ImageTransform): TransformMap {
  const next: TransformMap = {}
  if (map && typeof map === 'object') {
    for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
      next[key] = coerceTransform(value)
    }
  }

  next[imageUrl] = coerceTransform(transform)
  return next
}

export function isAdjustmentRecommended(image: ImageSize): boolean {
  if (!image.width || !image.height) return false

  const imageRatio = image.width / image.height
  const ratioDelta = Math.abs(imageRatio - CARD_ASPECT_RATIO)

  // Portrait and very wide photos are frequently awkward in 16:9 cards.
  return imageRatio < 1.15 || imageRatio > 2.1 || ratioDelta > 0.35
}
