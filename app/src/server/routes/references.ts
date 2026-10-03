/*
Dana Link references (issue #223, M1-C1). Reads only, no table.

    GET /api/v1/references/:kind/:id          one target, as a chip summary
    GET /api/v1/references/search             the picker's list, as it is typed
    GET /api/v1/results/:id                   where a native Result lives (#213)
    GET /api/v1/link-previews/google-maps     resolve a Google Maps short share link (#529)
    GET /api/v1/link-previews/map-image       same-origin OpenStreetMap preview (#529)

#488 adds one rule to the picker when it is used inside a Work/project: facet
references are project-local. Generic Dana Links to Tasks/Folders/etc retain
their ordinary reach; only `kind: facet` rows are cut to the composing
project. An exact pasted URL can still resolve as navigation, but Connected
work likewise refuses to treat a cross-project facet href as a relationship.
*/
import { Buffer } from 'node:buffer'

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
const mapImageQuery = z.object({
  lat: z.coerce.number().finite().min(-85).max(85),
  lng: z.coerce.number().finite().min(-180).max(180),
})
const GOOGLE_MAPS_HOST = /^(?:maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/u

const MAP_ZOOM = 16
const TILE_SIZE = 256
const TILE_CACHE_TTL_MS = 60 * 60 * 1_000
const TILE_CACHE_MAX = 128
const tileCache = new Map<string, { readonly data: string; readonly expiresAt: number }>()

type MapsRedirectFetch = (
  input: string,
  init: { readonly redirect: 'manual'; readonly signal: AbortSignal },
) => Promise<globalThis.Response>

type MapTileFetch = (
  input: string,
  init: { readonly headers: Readonly<Record<string, string>>; readonly signal: AbortSignal },
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

function longGoogleMapsUrl(url: URL): boolean {
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase().replace(/^www\./u, '')
  if (!GOOGLE_MAPS_HOST.test(host)) return false
  return host.startsWith('maps.google.') || url.pathname.startsWith('/maps')
}

/**
 * Follow only Google's opaque Maps shortener, one redirect at a time. Every
 * hop is validated before the next network request, so a caller cannot turn
 * this read into an open redirect follower/SSRF primitive. The function stops
 * as soon as Google exposes a normal Maps URL; no map page body is downloaded.
 */
export async function resolveGoogleMapsShortLink(
  value: string,
  fetcher: MapsRedirectFetch = fetch,
): Promise<string | null> {
  let current = shortGoogleMapsUrl(value)
  if (current === null) return null

  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetcher(current.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
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
    const short = shortGoogleMapsUrl(next.toString())
    if (short === null) return null
    current = short
  }
  return null
}

function tilePoint(latitude: number, longitude: number): { readonly x: number; readonly y: number } {
  const scale = 2 ** MAP_ZOOM
  const lat = latitude * Math.PI / 180
  return {
    x: (longitude + 180) / 360 * scale,
    y: (1 - Math.log(Math.tan(lat) + (1 / Math.cos(lat))) / Math.PI) / 2 * scale,
  }
}

function wrappedTileX(value: number): number {
  const scale = 2 ** MAP_ZOOM
  return ((value % scale) + scale) % scale
}

async function tileData(x: number, y: number, fetcher: MapTileFetch): Promise<string> {
  const scale = 2 ** MAP_ZOOM
  const tileX = wrappedTileX(x)
  const tileY = Math.max(0, Math.min(scale - 1, y))
  const key = `${MAP_ZOOM}/${tileX}/${tileY}`
  const cached = tileCache.get(key)
  if (fetcher === fetch && cached !== undefined && cached.expiresAt > Date.now()) return cached.data

  const response = await fetcher(`https://tile.openstreetmap.org/${key}.png`, {
    headers: {
      Accept: 'image/png',
      'User-Agent': 'Dana map preview (https://dana.so)',
    },
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok || !(response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/png')) {
    throw new Error('OpenStreetMap tile request failed.')
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > 1_000_000) throw new Error('OpenStreetMap tile was too large.')
  const data = Buffer.from(bytes).toString('base64')

  if (fetcher === fetch) {
    if (tileCache.size >= TILE_CACHE_MAX) {
      const oldest = tileCache.keys().next().value as string | undefined
      if (oldest !== undefined) tileCache.delete(oldest)
    }
    tileCache.set(key, { data, expiresAt: Date.now() + TILE_CACHE_TTL_MS })
  }
  return data
}

/**
 * Render a small, same-origin SVG from nine fixed OpenStreetMap raster tiles.
 * The client never loads a third-party frame or tile directly. The upstream
 * host is fixed here, tiles are cached, and the image carries attribution.
 */
export async function renderOpenStreetMapPreview(
  latitude: number,
  longitude: number,
  fetcher: MapTileFetch = fetch,
): Promise<string> {
  const point = tilePoint(latitude, longitude)
  const baseX = Math.floor(point.x) - 1
  const baseY = Math.floor(point.y) - 1
  const markerX = (point.x - baseX) * TILE_SIZE
  const markerY = (point.y - baseY) * TILE_SIZE
  const viewY = Math.max(0, Math.min(markerY - 112, TILE_SIZE * 3 - 224))

  const tiles = await Promise.all(
    Array.from({ length: 9 }, async (_, index) => {
      const column = index % 3
      const row = Math.floor(index / 3)
      const data = await tileData(baseX + column, baseY + row, fetcher)
      return `<image x="${column * TILE_SIZE}" y="${row * TILE_SIZE}" width="${TILE_SIZE}" height="${TILE_SIZE}" href="data:image/png;base64,${data}"/>`
    }),
  )

  const attributionY = viewY + 218
  return `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="224" viewBox="0 ${viewY.toFixed(2)} 768 224" role="img" aria-label="Map preview">${tiles.join('')}<circle cx="${markerX.toFixed(2)}" cy="${markerY.toFixed(2)}" r="10" fill="#ffffff"/><circle cx="${markerX.toFixed(2)}" cy="${markerY.toFixed(2)}" r="6" fill="#416180"/><rect x="578" y="${(attributionY - 16).toFixed(2)}" width="184" height="18" rx="3" fill="#ffffff" fill-opacity="0.86"/><text x="756" y="${(attributionY - 4).toFixed(2)}" text-anchor="end" font-family="sans-serif" font-size="10" fill="#333333">© OpenStreetMap contributors</text></svg>`
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
    '/link-previews/map-image',
    requireSession,
    searchLimit,
    async (req: Request, res: Response) => {
      const parsed = mapImageQuery.safeParse(req.query)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      try {
        const image = await renderOpenStreetMapPreview(parsed.data.lat, parsed.data.lng)
        res.set('Cache-Control', 'private, max-age=86400')
        res.type('image/svg+xml').status(200).send(image)
      } catch {
        sendError(res, 502, 'upstream_failed', 'The map preview could not be loaded.')
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
