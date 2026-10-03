/* Links in canvas paragraph text: the addresses it carries, and whether one is a video the
   canvas can embed. Only http(s) is ever treated as a link. */
export interface VideoTarget {
  readonly kind: 'youtube' | 'vimeo' | 'direct'
  readonly src: string
}

export interface GoogleMapsTarget {
  readonly href: string
  readonly label: string
  readonly embedSrc: string | null
  readonly needsResolve: boolean
}

const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/giu
const GOOGLE_MAPS_HOST = /^(?:maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/u

function safeUrl(value: string): URL | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null
  } catch {
    return null
  }
}

function cleanMapLabel(value: string): string | null {
  let decoded = value.replace(/\+/gu, ' ')
  try { decoded = decodeURIComponent(decoded) } catch { /* keep the safe undecoded value */ }
  const label = decoded.replace(/\s+/gu, ' ').trim()
  return label === '' ? null : label.slice(0, 120)
}

function pathMapLabel(url: URL): string | null {
  const raw = /^\/maps\/(?:place|search)\/([^/@]+)/u.exec(url.pathname)?.[1]
  return raw === undefined ? null : cleanMapLabel(raw)
}

function mapLabel(url: URL): string {
  const query = url.searchParams.get('query') ?? url.searchParams.get('q') ?? url.searchParams.get('destination')
  if (query !== null) return cleanMapLabel(query) ?? 'Map location'

  const pathLabel = pathMapLabel(url)
  if (pathLabel !== null) return pathLabel
  if (url.pathname.startsWith('/maps/dir/', 0)) return 'Directions'
  return 'Map location'
}

interface MapCoordinates {
  readonly latitude: number
  readonly longitude: number
}

function coordinates(latitude: string, longitude: string): MapCoordinates | null {
  const lat = Number(latitude)
  const lng = Number(longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -85 && lat <= 85 && lng >= -180 && lng <= 180
    ? { latitude: lat, longitude: lng }
    : null
}

function coordinatePair(value: string | null): MapCoordinates | null {
  if (value === null) return null
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/u.exec(value)
  return match === null ? null : coordinates(match[1]!, match[2]!)
}

/** Coordinates Google exposes in its long URLs, without calling a geocoder. */
function mapCoordinates(url: URL): MapCoordinates | null {
  // Prefer the exact place pin over Google's camera centre when both exist.
  const data = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/u.exec(url.toString())
  if (data !== null) return coordinates(data[1]!, data[2]!)

  const at = /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|\/|$)/u.exec(url.pathname)
  if (at !== null) return coordinates(at[1]!, at[2]!)

  for (const name of ['query', 'q', 'destination', 'll', 'center']) {
    const pair = coordinatePair(url.searchParams.get(name))
    if (pair !== null) return pair
  }
  return null
}

function coordinateText(value: number): string {
  return value.toFixed(6).replace(/0+$/u, '').replace(/\.$/u, '')
}

/**
 * OpenStreetMap publishes this export/embed page specifically for iframe use.
 * It gives Dana a real map preview without a Google frame, API key, tile proxy,
 * or server-side image renderer.
 */
function openStreetMapEmbedSrc(url: URL): string | null {
  const point = mapCoordinates(url)
  if (point === null) return null

  const latSpan = 0.0025
  const longitudeScale = Math.max(0.25, Math.cos(point.latitude * Math.PI / 180))
  const lngSpan = 0.0075 / longitudeScale
  const embed = new URL('https://www.openstreetmap.org/export/embed.html')
  embed.searchParams.set('bbox', [
    coordinateText(point.longitude - lngSpan),
    coordinateText(point.latitude - latSpan),
    coordinateText(point.longitude + lngSpan),
    coordinateText(point.latitude + latSpan),
  ].join(','))
  embed.searchParams.set('layer', 'mapnik')
  embed.searchParams.set('marker', `${coordinateText(point.latitude)},${coordinateText(point.longitude)}`)
  return embed.toString()
}

/**
 * A key-free preview target for a Google Maps link. Dana never frames Google:
 * it reads coordinates already present in the long URL and uses OpenStreetMap's
 * supported embed page. Opaque maps.app.goo.gl links are first resolved by
 * Dana's Google-only redirect resolver, then passed through here again.
 */
export function googleMapsTarget(value: string): GoogleMapsTarget | null {
  const url = safeUrl(value)
  if (url === null) return null

  const host = url.hostname.toLowerCase().replace(/^www\./u, '')
  if (host === 'maps.app.goo.gl') {
    return {
      href: url.toString(),
      label: 'Shared location',
      embedSrc: null,
      needsResolve: true,
    }
  }
  if (!GOOGLE_MAPS_HOST.test(host)) return null

  const mapsSubdomain = host.startsWith('maps.google.')
  if (!mapsSubdomain && !url.pathname.startsWith('/maps')) return null
  return {
    href: url.toString(),
    label: mapLabel(url),
    embedSrc: openStreetMapEmbedSrc(url),
    needsResolve: false,
  }
}

export function videoTarget(value: string): VideoTarget | null {
  const url = safeUrl(value)
  if (url === null) return null

  const host = url.hostname.toLowerCase().replace(/^www\./u, '')
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id === undefined || !/^[\w-]{6,20}$/u.test(id)
      ? null
      : { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` }
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = url.searchParams.get('v') ?? url.pathname.match(/^\/shorts\/([^/]+)/u)?.[1]
    return id === null || id === undefined || !/^[\w-]{6,20}$/u.test(id)
      ? null
      : { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` }
  }
  if (host === 'vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id === undefined || !/^\d+$/u.test(id)
      ? null
      : { kind: 'vimeo', src: `https://player.vimeo.com/video/${id}` }
  }
  if (/\.(?:mp4|webm|ogg)$/iu.test(url.pathname)) {
    return { kind: 'direct', src: url.toString() }
  }
  return null
}

export function linksIn(text: string): readonly string[] {
  return [...text.matchAll(LINK_PATTERN)]
    .map((match) => match[2] ?? match[3])
    .filter((value): value is string => value !== undefined)
}
