/*
Dana Links on the client (#207, #211, #213, #214, #223, #225): the picker's
search, a chip's live resolve, and "Referenced from".

**Tolerant by construction.** The shared `referenceKind` is a closed zod enum,
and parsing a response with it turns the day the server learns a seventh kind
into a page that fails to draw (a `ResponseShapeError` for the whole list).
So the reads here parse with loose schemas: a kind or a backlink home this
client does not know is carried as a string, drawn generically, and never
fails the read. What *is* checked is the one thing that matters for safety —
that a path the server hands back is an in-app `/app/...` path, so a summary
can never become an `href` to somewhere else.
*/
import { z } from 'zod'

import { getPlain } from '../../api/http.js'

/** Route segment to reference kind, for the kinds this client can resolve.
 * An unknown segment is not an error: the link stays an ordinary link. */
const KIND_OF_SEGMENT: Readonly<Record<string, string>> = {
  tasks: 'task',
  folders: 'folder',
  shelves: 'shelf',
  facets: 'facet',
  discussions: 'discussion',
  outcomes: 'outcome',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DanaLinkTarget {
  readonly kind: string
  readonly segment: string
  readonly id: string
  readonly path: string
}

/** A stored `href` as a Dana Link, or null. Relative `/app/<segment>/<uuid>`
 * only (with an optional query or fragment), or an absolute URL on this very
 * origin — the same rule as the shared `parseDanaLink`, without its closed
 * enum. */
export function danaLinkOf(href: string): DanaLinkTarget | null {
  let raw = href.trim()
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      if (typeof window === 'undefined' || url.origin !== window.location.origin) return null
      raw = url.pathname
    } catch {
      return null
    }
  }
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  const segments = (raw.split('#')[0] ?? '').split('?')[0]!.split('/').filter((part) => part !== '')
  if (segments.length !== 3 || segments[0] !== 'app') return null
  const [, segment = '', id = ''] = segments
  const kind = KIND_OF_SEGMENT[segment]
  if (kind === undefined || !UUID.test(id)) return null
  return { kind, segment, id: id.toLowerCase(), path: `/app/${segment}/${id.toLowerCase()}` }
}

const appPath = z.string().refine((path) => path.startsWith('/app/') && !path.startsWith('//'))

export const looseSummary = z.object({
  kind: z.string(),
  id: z.string(),
  label: z.string(),
  path: appPath,
})
export type LooseSummary = z.infer<typeof looseSummary>

/** One bad row drops that row, not the list. */
const looseSearch = z.object({ results: z.array(z.unknown()) }).transform(({ results }) =>
  results.flatMap((row) => {
    const parsed = looseSummary.safeParse(row)
    return parsed.success ? [parsed.data] : []
  }))

export function searchReferences(q: string): Promise<LooseSummary[]> {
  return getPlain(looseSearch, '/references/search', { q })
}

export function resolveReference(kind: string, id: string): Promise<LooseSummary> {
  return getPlain(looseSummary, `/references/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`)
}

const looseBacklink = z.object({
  surface: z.string(),
  home: z.string(),
  home_id: z.string(),
  folder_id: z.string().nullable(),
  member_id: z.string().nullable().optional(),
  label: z.string(),
})
export type LooseBacklink = z.infer<typeof looseBacklink>

const looseBacklinks = z.object({ results: z.array(z.unknown()), truncated: z.boolean().optional() })
  .transform(({ results, truncated }) => ({
    truncated: truncated === true,
    results: results.flatMap((row) => {
      const parsed = looseBacklink.safeParse(row)
      return parsed.success ? [parsed.data] : []
    }),
  }))

/** The kinds whose `/{segment}/:id/backlinks` route exists. */
export type BacklinkTargetKind = 'task' | 'folder' | 'shelf' | 'facet' | 'discussion' | 'outcome'
const SEGMENT_OF_KIND: Record<BacklinkTargetKind, string> = {
  task: 'tasks', folder: 'folders', shelf: 'shelves', facet: 'facets', discussion: 'discussions', outcome: 'outcomes',
}

export function backlinksOf(kind: BacklinkTargetKind, id: string): Promise<{ truncated: boolean; results: LooseBacklink[] }> {
  return getPlain(looseBacklinks, `/${SEGMENT_OF_KIND[kind]}/${encodeURIComponent(id)}/backlinks`)
}

/** Where a backlink row opens. A home this client does not know falls back
 * to the row's Folder, and to nothing when it has none. */
export function backlinkPath(row: LooseBacklink): string | null {
  if (row.surface === 'page') {
    if (row.home === 'task') return `/app/tasks/${row.home_id}`
    if (row.home === 'folder') return `/app/folders/${row.home_id}`
    if (row.home === 'shelf') return `/app/shelves/${row.home_id}`
    if (row.home === 'facet' && row.folder_id !== null) return `/app/folders/${row.folder_id}?facet=${row.home_id}`
  }
  /* A post in a thread (W-C): the thread opens, or the task on its Discussion tab. */
  if (row.surface === 'post') {
    if (row.home === 'discussion') return `/app/discussions/${row.home_id}`
    if (row.home === 'task') return `/app/tasks/${row.home_id}?tab=discussion`
  }
  return row.folder_id === null ? null : `/app/folders/${row.folder_id}`
}

const KIND_NOUN: Readonly<Record<string, string>> = {
  task: 'Task', folder: 'Page', shelf: 'Collection', facet: 'Facet', discussion: 'Discussion', outcome: 'Outcome',
}
export function kindNoun(kind: string): string {
  return KIND_NOUN[kind] ?? 'Link'
}
