/*
Dana Link reads, no table: a target's chip summary, the picker search, a
Result's location, and Google Maps short-link resolution. Inside a project the
picker limits `facet` rows to that project.
*/
import type { Request, Response, Router } from 'express'
import { z } from 'zod'

import type { DbClient } from '../../../db/client.js'
import { referenceKind, referenceSearchQuery } from '../../shared/references.js'
import { requireSession } from '../auth/index.js'
import { accessOf } from '../domain/folder-access.js'
import { resolveReference, resultLocation, searchReferences } from '../domain/references.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { projectFacetOptions } from '../views/block-facets.js'
import { routerWithPreamble } from './preamble.js'

export interface ReferencesRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
}

const googleMapsPreviewQuery = z.object({
  url: z.string().url().max(2048),
})
const GOOGLE_MAPS_HOST = /^(?:maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/u
const GOOGLE_MAPS_RESOLVER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
} as const

type MapsRedirectFetch = (
  input: string,
  init: {
    readonly redirect: 'manual'
    readonly signal: AbortSignal
    readonly headers: Readonly<Record<string, string>>
  },
) => Promise<globalThis.Response>

function shortGoogleMapsUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'maps.app.goo.gl'
      ? url
      : null
  } catch {
    return null
  }
}

function redirectableGoogleMapsShortUrl(value: string): URL | null {
  const url = shortGoogleMapsUrl(value)
  if (url === null) return null
  // `_imcp=1` avoids the JS interstitial Google serves to non-browser clients.
  url.searchParams.set('_imcp', '1')
  return url
}

function longGoogleMapsUrl(url: URL): boolean {
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase().replace(/^www\./u, '')
  if (!GOOGLE_MAPS_HOST.test(host)) return false
  return host.startsWith('maps.google.') || url.pathname.startsWith('/maps')
}

/**
 * Follows only Google's Maps shortener, one validated hop at a time, so this
 * cannot become an open redirect or SSRF. No page body is downloaded.
 */
export async function resolveGoogleMapsShortLink(
  value: string,
  fetcher: MapsRedirectFetch = fetch,
): Promise<string | null> {
  let current = redirectableGoogleMapsShortUrl(value)
  if (current === null) return null

  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetcher(current.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
      headers: GOOGLE_MAPS_RESOLVER_HEADERS,
    })
    if (response.status < 300 || response.status >= 400) return null
    const location = response.headers.get('location')
    if (location === null) return null

    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      return null
    }
    if (longGoogleMapsUrl(next)) return next.toString()
    const short = redirectableGoogleMapsShortUrl(next.toString())
    if (short === null) return null
    current = short
  }
  return null
}

export function createReferencesRouter(
  options: ReferencesRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const searchLimit = optionalLimit(options.rateLimits?.search)

  router.get(
    '/link-previews/google-maps',
    requireSession,
    searchLimit,
    async (req: Request, res: Response) => {
      const parsed = googleMapsPreviewQuery.safeParse(req.query)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      if (shortGoogleMapsUrl(parsed.data.url) === null) {
        sendError(res, 422, 'validation_failed', 'url: must be a Google Maps short link.')
        return
      }
      try {
        const resolved = await resolveGoogleMapsShortLink(parsed.data.url)
        if (resolved === null) {
          sendError(res, 502, 'upstream_failed', 'The Google Maps link could not be resolved.')
          return
        }
        res.status(200).json({ url: resolved })
      } catch {
        sendError(res, 502, 'upstream_failed', 'The Google Maps link could not be resolved.')
      }
    },
  )

  router.get(
    '/references/search',
    requireSession,
    searchLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = referenceSearchQuery.safeParse(req.query)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const viewerId = viewer(req)
      const { q, folder } = parsed.data
      if (
        folder !== undefined &&
        (await accessOf(db, viewerId, folder)) === null
      ) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }

      const results = await searchReferences(db, viewerId, {
        q,
        ...(folder === undefined ? {} : { folderId: folder }),
      })
      if (folder === undefined) {
        res.status(200).json({ results })
        return
      }
      const localFacets = await projectFacetOptions(db, viewerId, folder)
      if (localFacets === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const allowed = new Set(localFacets.map((facet) => facet.id))
      res.status(200).json({
        results: results.filter((result) => result.kind !== 'facet' || allowed.has(result.id)),
      })
    },
  )

  router.get(
    '/references/:kind/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const kind = referenceKind.safeParse(req.params.kind)
      if (!kind.success) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const id = parsedId(res, req.params.id)
      if (id === null) return
      const found = await resolveReference(db, viewer(req), {
        kind: kind.data,
        id,
      })
      if (found === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(found)
    },
  )

  router.get(
    '/results/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const id = parsedId(res, req.params.id)
      if (id === null) return
      const found = await resultLocation(db, viewer(req), id)
      if (found === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(found)
    },
  )

  return router
}
