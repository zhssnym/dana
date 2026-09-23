/*
Dana Links (issue #223, M1-C1): the one place the grammar of an internal Dana
URL is written down, and the wire shapes of the two endpoints that resolve
one.

**A Dana Link is a reference, not a relationship.** Nothing here is stored.
There is no table behind it, no backlink graph and no registry: the durable
form of a reference is the `href` a rich-content block already holds, and
everything below turns that string into a target the server then resolves
live, through the very reads an ordinary open of that target would do. The
consequences worth stating once, because every reader of this file is about to
be tempted by one of them:

- resolving a link **grants nothing**. It is a read, gated like any other read,
  and a viewer who cannot open the target cannot resolve it either;
- a target the viewer cannot reach and a target that does not exist are the
  **same answer** — 404, no label, no folder, no dates, no assignee, nothing
  that separates the two (spec 7.0, 10.2);
- the grammar is closed. #223 began with Task, Folder and Shelf; #211 adds the
  stable native Purpose facet through the generic `facet` kind; #320 adds a
  Discussion and an Outcome of a Folder's Consultation. A further kind
  becomes referenceable by joining `REFERENCE_KINDS`, `KIND_SEGMENT` and the
  server resolver together — which is the extensibility this grammar provides.

**Why the parser lives here rather than on either side.** The client turns a
pasted URL into a target before it asks; the server builds the canonical
`path` of every summary it answers. Two copies of one grammar drift, and the
direction they drift in is a client that believes a string is a Dana Link and
a server that does not. Parsing and formatting must round-trip.
*/
import { z } from 'zod'

import { searchQ } from './views.js'

/* ------------------------------------------------------------------ *
 * The closed set of referenceable kinds
 * ------------------------------------------------------------------ */

/** The closed reference set. #223's first three are followed by #211's
 * generic facet route; the server currently resolves that fourth kind only for
 * native Purpose and, since #213, native Results. A kind belongs here only once it has stable identity and a
 * stable client route. */
export const REFERENCE_KINDS = [
  'task',
  'folder',
  'shelf',
  'facet',
  'discussion',
  'outcome',
] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

export const referenceKind = z.enum(REFERENCE_KINDS, {
  error: 'must be one of task, folder, shelf, facet, discussion or outcome',
})

/** The client route segment each kind is addressed by, which is the plural
 * the SPA uses: `/app/tasks/:id`, `/app/folders/:id`, `/app/shelves/:id`,
 * `/app/facets/:id`, and #320's `/app/discussions/:id` and
 * `/app/outcomes/:id`. An Outcome has its own address, rather than a fragment
 * on its Discussion's, because it is append-only and so a stable target in its
 * own right: an old Outcome's link keeps naming exactly what it said after a
 * later one becomes current, and the client opens it as its parent Discussion
 * focused on that Outcome. */
const KIND_SEGMENT: Record<ReferenceKind, string> = {
  task: 'tasks',
  folder: 'folders',
  shelf: 'shelves',
  facet: 'facets',
  discussion: 'discussions',
  outcome: 'outcomes',
}

const KIND_OF_SEGMENT = new Map<string, ReferenceKind>(
  REFERENCE_KINDS.map((kind) => [KIND_SEGMENT[kind], kind]),
)

/** The first segment of every supported link. A URL that does not open with
 * it is not addressing the application at all. */
const APP_SEGMENT = 'app'

export interface ReferenceTarget {
  kind: ReferenceKind
  id: string
}

/** The canonical internal path of a target: what a chip links to, and the
 * `path` of every summary the server answers. Purpose facets use
 * `/app/facets/:id`; #211 deliberately makes no individual Purpose block a
 * target. One direction of the round
 * trip `parseDanaLink` is the other half of. */
export function referencePath(kind: ReferenceKind, id: string): string {
  return `/${APP_SEGMENT}/${KIND_SEGMENT[kind]}/${id}`
}

const uuid = z.uuid()

/**
 * A pasted string, as a target, or null when it is not a supported Dana Link.
 *
 * **Null is the only rejection, and it says nothing about why.** A caller
 * that wants to tell "not a link" from "a link to something you cannot see"
 * is asking for the distinction this feature exists to refuse; the two are
 * one answer at the endpoint.
 *
 * Accepted: an application-relative path, `/app/tasks/<uuid>`, with a query
 * or fragment after it. And an absolute URL, but **only** when `origin` is
 * supplied and matches it — a link to `https://somewhere-else/app/tasks/<id>`
 * is somebody else's URL that happens to be shaped like ours, and treating it
 * as internal would be the beginning of an open redirect rather than a
 * convenience. A caller with no origin to compare against therefore gets null
 * for every absolute URL, which is the safe direction.
 *
 * Rejected, each for its own reason and each covered beside this file: a
 * protocol-relative `//host/app/tasks/<id>`, which `new URL` will not parse
 * without a base and which must never be given one here; a path with a
 * segment before or after the three; a kind outside the closed set; and an id
 * that is not a uuid — checked with the same `z.uuid()` the route's path
 * parameter is checked with, so the parser and the endpoint cannot disagree
 * about what an id is.
 */
export function parseDanaLink(
  raw: string,
  origin?: string,
): ReferenceTarget | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  let pathname: string
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    // Relative: cut a query or fragment off by hand rather than by giving
    // `new URL` a base, which would also swallow the protocol-relative form.
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

/* ------------------------------------------------------------------ *
 * The wire shapes
 * ------------------------------------------------------------------ */

/**
 * Everything a chip or a picker row needs and nothing else: what kind of
 * thing it is, which one, what to draw, and where it goes.
 *
 * **The absences are the contract.** No folder, no assignee, no dates, no
 * status, no membership, no counts. A summary is answered only to a viewer
 * who could read all of that from the object's own endpoint, so withholding
 * it protects nothing by itself — what it protects is the next change: a
 * field added here is a field that has to be re-argued against every target
 * kind, and the picker has never needed one.
 */
export const referenceSummary = z.object({
  kind: referenceKind,
  id: z.uuid(),
  /** The target's own name or title, exactly as its own read answers it. */
  label: z.string(),
  /** `referencePath(kind, id)`, so a client never assembles one itself. */
  path: z.string(),
})
export type ReferenceSummary = z.infer<typeof referenceSummary>

export const getReferenceResponse = referenceSummary
export type GetReferenceResponse = ReferenceSummary

/**
 * The picker's read.
 *
 * `q` is 7.10's own `searchQ` rather than a second rule: trimmed, 2 to 100
 * characters, 422 outside it. Reusing it is deliberate and is as far as the
 * reuse goes — nothing here widens `GET /search`, whose cursor, cap and
 * result kinds are its own.
 *
 * `folder` is the Folder the person is composing in. It is optional because a
 * picker is also opened from places that are not a Folder, and when it is
 * supplied the viewer's access to it is resolved before anything is read, so
 * a folder id is never a way to ask whether a folder exists.
 *
 * **There is no `limit`, and no `kinds`.** A fixed cap is one fewer request
 * field to prove arrives, and `REFERENCE_SEARCH_LIMIT` is what a picker list
 * can show. A `kinds` filter can be added the day a caller has a use for one
 * that filtering client-side does not serve.
 */
export const referenceSearchQuery = z.object({
  q: searchQ,
  folder: z.uuid({ error: 'must be a folder id' }).optional(),
})
export type ReferenceSearchQuery = z.infer<typeof referenceSearchQuery>

/** The most rows one search answers, over every kind together. Small on
 * purpose: this is a picker list, and the requirement it satisfies is that no
 * call can be made to return a flat dump of everything a person can reach. */
export const REFERENCE_SEARCH_LIMIT = 20

export const getReferenceSearchResponse = z.object({
  results: z.array(referenceSummary).max(REFERENCE_SEARCH_LIMIT),
})
export type GetReferenceSearchResponse = z.infer<
  typeof getReferenceSearchResponse
>
