// ── Phone ─────────────────────────────────────────────────────────────────────

export function phoneLast4(phone: string): string {
  return phone.replace(/\D/g, '').slice(-4)
}

// ── Slug ──────────────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 50)
}

// ── Maps ──────────────────────────────────────────────────────────────────────

export function directionsUrl(
  fromLat: number | null,
  fromLng: number | null,
  toLat: number | null,
  toLng: number | null,
  toAddress: string | null,
): string {
  const origin =
    fromLat != null && fromLng != null ? `&origin=${fromLat},${fromLng}` : ''
  const destination =
    toLat != null && toLng != null
      ? `&destination=${toLat},${toLng}`
      : toAddress
      ? `&destination=${encodeURIComponent(toAddress)}`
      : ''
  return `https://www.google.com/maps/dir/?api=1${origin}${destination}`
}

export function mapUrl(
  lat: number | null,
  lng: number | null,
  name: string,
): string {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`
}
