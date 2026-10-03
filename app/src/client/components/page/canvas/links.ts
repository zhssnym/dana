/* Links in canvas paragraph text: the addresses it carries, and whether one is a video the
   canvas can embed. Only http(s) is ever treated as a link. */
export interface VideoTarget {
  readonly kind: 'youtube' | 'vimeo' | 'direct'
  readonly src: string
}

export interface GoogleMapsTarget {
  readonly href: string
  readonly label: string
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

function mapLabel(url: URL): string {
  const query = url.searchParams.get('query') ?? url.searchParams.get('q') ?? url.searchParams.get('destination')
  if (query !== null) return cleanMapLabel(query) ?? 'Map location'

  const pathLabel = /^\/maps\/(?:place|search)\/([^/@]+)/u.exec(url.pathname)?.[1]
  if (pathLabel !== undefined) return cleanMapLabel(pathLabel) ?? 'Map location'
  if (url.pathname.startsWith('/maps/dir/', 0)) return 'Directions'
  return 'Map location'
}

/**
 * A key-free Google Maps preview target. Long map URLs can usually expose a
 * useful place/search label; `maps.app.goo.gl` share links remain opaque until
 * Google resolves them, so they intentionally render as a generic shared map.
 */
export function googleMapsTarget(value: string): GoogleMapsTarget | null {
  const url = safeUrl(value)
  if (url === null) return null

  const host = url.hostname.toLowerCase().replace(/^www\./u, '')
  if (host === 'maps.app.goo.gl') return { href: url.toString(), label: 'Shared location' }
  if (!GOOGLE_MAPS_HOST.test(host)) return null

  const mapsSubdomain = host.startsWith('maps.google.')
  if (!mapsSubdomain && !url.pathname.startsWith('/maps')) return null
  return { href: url.toString(), label: mapLabel(url) }
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
