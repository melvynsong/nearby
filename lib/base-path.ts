const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

function normalizeBasePath(input: string): string {
  const trimmed = input.trim()
  if (!trimmed || trimmed === '/') return ''

  let value = trimmed
  if (!value.startsWith('/')) value = `/${value}`
  if (value.endsWith('/')) value = value.slice(0, -1)
  return value
}

export const BASE_PATH = normalizeBasePath(rawBasePath)

export function withBasePath(path: string): string {
  if (!path) return BASE_PATH || '/'

  // Absolute URLs should not be prefixed.
  if (/^https?:\/\//i.test(path)) return path

  const cleanPath = path.startsWith('/') ? path : `/${path}`

  if (!BASE_PATH) return cleanPath
  if (cleanPath === BASE_PATH || cleanPath.startsWith(`${BASE_PATH}/`)) return cleanPath

  return `${BASE_PATH}${cleanPath}`
}

export function apiPath(path: string): string {
  const normalized = path.startsWith('/api/') ? path : `/api/${path.replace(/^\/+/, '')}`
  return withBasePath(normalized)
}
