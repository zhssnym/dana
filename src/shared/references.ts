/*
Dana Links: the grammar of internal URLs and the shapes of the two resolving
endpoints. Nothing is stored: a link is an `href` resolved live through the
target's ordinary read. Resolving grants nothing, and "cannot see" and "does
not exist" are the same 404. Shared so client parsing and server formatting
round-trip.
*/
import { z } from 'zod'

import { searchQ } from './views.js'

/** The closed set. A kind belongs here only with stable identity and a client route. */
export const REFERENCE_KINDS = [
  'task',
  'folder',
  'shelf',
  'facet',
  'discussion',
  'outcome',
  'result',
] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

export const referenceKind = z.enum(REFERENCE_KINDS, {
  error: 'must be one of task, folder, shelf, facet, discussion, outcome or result',
})

/** Client route segments. An Outcome has its own address because it is append-only. */
const KIND_SEGMENT: Record<ReferenceKind, string> = {
  task: 'tasks',
  folder: 'folders',
  shelf: 'shelves',
  facet: 'facets',
  discussion: 'discussions',
  outcome: 'outcomes',
  result: 'results',
}

const KIND_OF_SEGMENT = new Map<string, ReferenceKind>(
  REFERENCE_KINDS.map((kind) => [KIND_SEGMENT[kind], kind]),
)

const APP_SEGMENT = 'app'

export interface ReferenceTarget {
  kind: ReferenceKind
  id: string
}

/** The canonical path: the inverse of `parseDanaLink`. */
export function referencePath(kind: ReferenceKind, id: string): string {
  return `/${APP_SEGMENT}/${KIND_SEGMENT[kind]}/${id}`
}

const uuid = z.uuid()

/**
 * A pasted string as a target, or null (never a reason). Accepts
 * `/app/<kind>/<uuid>` with an optional query or fragment, or an absolute URL
 * only when it matches `origin`; anything else could become an open redirect.
 * Protocol-relative `//host/...` is always refused.
 */
export function parseDanaLink(
  raw: string,
  origin?: string,
): ReferenceTarget | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  let pathname: string
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    // Cut by hand: `new URL` with a base would also accept `//host/...`.
    pathname = trimmed.split('#')[0]?.split('?')[0] ?? ''
  } else {
    if (origin === undefined) return null
    let parsed: URL
    let expected: URL
    try {
      parsed = new URL(trimmed)
      expected = new URL(origin)
    } catch {
      return null
    }
    if (parsed.origin.toLowerCase() !== expected.origin.toLowerCase()) {
      return null
    }
    pathname = parsed.pathname
  }

  const segments = pathname.split('/').filter((segment) => segment !== '')
  if (segments.length !== 3) return null
  if (segments[0] !== APP_SEGMENT) return null
  const kind = KIND_OF_SEGMENT.get(segments[1] ?? '')
  if (kind === undefined) return null
  const id = uuid.safeParse(segments[2])
  if (!id.success) return null
  return { kind, id: id.data }
}

/**
 * What a chip or picker row needs, and nothing more: no folder, assignee,
 * dates or status. Every new field must be justified for every kind.
 */
export const referenceSummary = z.object({
  kind: referenceKind,
  id: z.uuid(),
  label: z.string(),
  /** `referencePath(kind, id)`; clients never build one. */
  path: z.string(),
})
export type ReferenceSummary = z.infer<typeof referenceSummary>

export const getReferenceResponse = referenceSummary
export type GetReferenceResponse = ReferenceSummary

/**
 * The picker's read. `q` reuses 7.10's searchQ. When `folder` is given, access
 * to it is checked first, so it cannot probe for existence.
 */
export const referenceSearchQuery = z.object({
  q: searchQ,
  folder: z.uuid({ error: 'must be a folder id' }).optional(),
})
export type ReferenceSearchQuery = z.infer<typeof referenceSearchQuery>

/** Rows per search across all kinds: a picker, never a dump of everything reachable. */
export const REFERENCE_SEARCH_LIMIT = 20

export const getReferenceSearchResponse = z.object({
  results: z.array(referenceSummary).max(REFERENCE_SEARCH_LIMIT),
})
export type GetReferenceSearchResponse = z.infer<
  typeof getReferenceSearchResponse
>

/** `GET /results/:id`: where a Result lives. An unreachable one is the same 404 as a missing one. */
export const getResultLocationResponse = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  facet_id: z.uuid(),
  label: z.string(),
})
export type GetResultLocationResponse = z.infer<typeof getResultLocationResponse>
