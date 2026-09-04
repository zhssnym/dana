export interface VideoTarget {
  readonly kind: 'youtube' | 'vimeo' | 'direct'
  readonly src: string
}

const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/giu

export function safeUrl(value: string): URL | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null
  } catch {
    return null
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

export function linkedParts(text: string): readonly (
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'link'; readonly value: string; readonly href: string }
)[] {
  const parts: (
    | { readonly kind: 'text'; readonly value: string }
    | { readonly kind: 'link'; readonly value: string; readonly href: string }
  )[] = []
  let cursor = 0

  for (const match of text.matchAll(LINK_PATTERN)) {
    const at = match.index
    if (at > cursor) parts.push({ kind: 'text', value: text.slice(cursor, at) })
    const href = match[2] ?? match[3]
    const label = match[1] ?? href
    if (href !== undefined && label !== undefined) {
      parts.push({ kind: 'link', value: label, href })
    }
    cursor = at + match[0].length
  }
  if (cursor < text.length) parts.push({ kind: 'text', value: text.slice(cursor) })
  return parts.length === 0 ? [{ kind: 'text', value: text }] : parts
}
