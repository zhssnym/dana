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

function mapCoordinates(url: URL): string | null {
  const match = /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/u.exec(url.pathname)
  return match === null ? null : `${match[1]},${match[2]}`
}

function mapQuery(url: URL): string | null {
  const query = url.searchParams.get('query') ?? url.searchParams.get('q') ?? url.searchParams.get('destination')
  if (query !== null) return cleanMapLabel(query)
  return mapCoordinates(url) ?? pathMapLabel(url)
}

function mapEmbedSrc(url: URL): string | null {
  const query = mapQuery(url)
  if (query === null) return null
  const embed = new URL('https://maps.google.com/maps')
  embed.searchParams.set('q', query)
  embed.searchParams.set('output', 'embed')
  return embed.toString()
}

/**
 * A key-free Google Maps preview target. Long map URLs expose enough location
 * data to build the ordinary maps.google.com `output=embed` frame. Google's
 * opaque short share links are resolved by Dana's server before this helper is
 * called again with their long destination.
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
    embedSrc: mapEmbedSrc(url),
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
