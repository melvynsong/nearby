export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

type PlaceForShare = {
  name: string
  formatted_address: string | null
  recommendations: Array<{ member_name: string; note: string | null }>
}

export function buildWhatsAppMessage(place: PlaceForShare): string {
  const first = place.recommendations[0]
  const lines: string[] = []
  if (first) lines.push(`${first.member_name} recommends: *${place.name}*`)
  else lines.push(`*${place.name}*`)
  if (place.formatted_address) lines.push(place.formatted_address)
  if (first?.note) lines.push(`"${first.note}"`)
  return lines.join('\n')
}

export { directionsUrl, mapUrl } from '@/lib/helpers'
