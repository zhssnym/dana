/*
The photo tier's server half (7.15's cover routes, added at the polish round
of 2026-08-30 on the owner's word, RFC 0005's frozen-section rule waived by
him for this round).

`lib/page-identity.ts` carries the measurement this answers: the client's
Photos tab was built at S25 and could never run, because 10.8's CSP sends
`img-src 'self' data:` and `connect-src 'self'`, so the picker's search
request never left the page and no thumbnail could paint. No client-side
workaround exists — the photograph's bytes sit on a host that sends no CORS
header. So the server does the fetching, and the CSP does not move an inch:

- GET  /covers/photos?q=          — proxies the Openverse search, and
  rewrites every thumbnail to the route below, so the grid paints from
  'self'.
- GET  /covers/photos/:id/thumb   — streams one Openverse thumbnail by its
  uuid. The id is validated as a uuid and the upstream path is built here,
  never taken from the client, which is what keeps this from being an open
  proxy.
- POST /folders/:id/cover/photo   — downloads the chosen photograph
  server-side and hands the bytes to the same `createFile` the upload tier
  uses: same membership check, same downscale, same quota, same 413. The
  client then PATCHes `cover_file_id` exactly as it does after an upload, so
  the cover a person ends up wearing is a file this origin serves — which is
  also what dissolves 10.6's precache objection, B8's original ground.

Openverse (api.openverse.org) needs no key and no account. `OPENVERSE_BASE`
exists so the contract test can stand a stub upstream; production never sets
it.
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

import type { DbClient } from '../../../db/client.js'
import { attachSession, requireCsrf, requireSession, sessionOf } from '../auth/index.js'
import { MAX_FILE_BYTES, createFile } from '../domain/files.js'
import type { CreateFileResult } from '../domain/files.js'
import type { ObjectStore } from '../files/store.js'
import { sendError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'

export interface CoverPhotosRouterOptions {
  dbClient?: DbClient
  fileStore?: ObjectStore
  rateLimits?: RateLimits
}

const uuidParam = z.uuid()
const searchQuery = z.object({ q: z.string().trim().min(1).max(200) })
const pickBody = z.object({ photo_id: z.uuid() })

/** The upstream, overridable only so a test can stand a stub in its place. */
function upstreamBase(): string {
  return process.env['OPENVERSE_BASE'] ?? 'https://api.openverse.org'
}

interface UpstreamResult {
  id?: string
  title?: string | null
  creator?: string | null
  url?: string | null
}

/** Read a body while refusing to buffer more than the upload path would. */
async function boundedBytes(response: globalThis.Response): Promise<Buffer | null> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_FILE_BYTES) return null
  const bytes = Buffer.from(await response.arrayBuffer())
  return bytes.byteLength > MAX_FILE_BYTES ? null : bytes
}

export function createCoverPhotosRouter(
  options: CoverPhotosRouterOptions = {},
): Router {
  const router = Router()
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

  if (options.dbClient !== undefined) {
    const attach = attachSession(options.dbClient.db)
    router.use((req: Request, res: Response, next: NextFunction) => {
      if (sessionOf(req) !== undefined) {
        next()
        return
      }
      attach(req, res, next)
    })
  }

  router.get(
    '/covers/photos',
    requireSession,
    async (req: Request, res: Response) => {
      const query = searchQuery.safeParse(req.query)
      if (!query.success) {
        sendError(res, 422, 'validation_failed', 'q: must be 1 to 200 characters.')
        return
      }
      let payload: { results?: UpstreamResult[] }
      try {
        const upstream = await fetch(
          `${upstreamBase()}/v1/images/?q=${encodeURIComponent(query.data.q)}&page_size=12&mature=false`,
          { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
        )
        if (!upstream.ok) throw new Error(String(upstream.status))
        payload = (await upstream.json()) as { results?: UpstreamResult[] }
      } catch {
        sendError(res, 502, 'upstream_failed', 'The photo search did not answer.')
        return
      }
      const results = (payload.results ?? [])
        .filter((item) => uuidParam.safeParse(item.id).success && item.url)
        .map((item) => ({
          id: item.id,
          title: item.title ?? 'Untitled',
          creator: item.creator ?? 'unknown',
          /* Painted from this origin, which is the whole reason this route
             exists: img-src admits no third-party host, and this route is
             what keeps that true. It gained `blob:` on 2026-09-03 for the
             object URLs the client builds from bytes it already holds; a
             scheme that reaches no network is not the widening this
             sentence is about, and no host has been added for a search
             result. */
          thumb: `/api/v1/covers/photos/${String(item.id)}/thumb`,
        }))
      res.json({ results })
    },
  )

  router.get(
    '/covers/photos/:id/thumb',
    requireSession,
    async (req: Request, res: Response) => {
      const id = uuidParam.safeParse(req.params.id)
      if (!id.success) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      try {
        const upstream = await fetch(
          `${upstreamBase()}/v1/images/${id.data}/thumb/`,
          { signal: AbortSignal.timeout(10_000) },
        )
        if (!upstream.ok) throw new Error(String(upstream.status))
        const bytes = await boundedBytes(upstream)
        if (bytes === null) throw new Error('too large')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg')
        /* A thumbnail is immutable content addressed by id; a day of cache
           keeps the grid from re-fetching on every keystroke's re-render. */
        res.setHeader('Cache-Control', 'private, max-age=86400')
        res.send(bytes)
      } catch {
        sendError(res, 502, 'upstream_failed', 'The thumbnail did not answer.')
      }
    },
  )

  router.post(
    '/folders/:id/cover/photo',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      if (options.dbClient === undefined || options.fileStore === undefined) {
        sendError(res, 500, 'internal_error', 'The application was constructed without a database.')
        return
      }
      const folderId = uuidParam.safeParse(req.params.id)
      if (!folderId.success) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const body = pickBody.safeParse(req.body)
      if (!body.success) {
        sendError(res, 422, 'validation_failed', 'photo_id: must be a uuid.')
        return
      }

      /* The upstream URL comes from Openverse's own record for that id,
         fetched here — never from the client — so this cannot be pointed at
         an arbitrary host. */
      let source: { url: string; title: string; mime: string; bytes: Buffer }
      try {
        const detail = await fetch(`${upstreamBase()}/v1/images/${body.data.photo_id}/`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
        if (!detail.ok) throw new Error(String(detail.status))
        const record = (await detail.json()) as UpstreamResult
        /* https in production; the one exception is a URL on the stub base
           itself, so the contract test can serve the photograph it promised. */
        const fromStub =
          process.env['OPENVERSE_BASE'] !== undefined &&
          typeof record.url === 'string' &&
          record.url.startsWith(upstreamBase())
        if (typeof record.url !== 'string' || (!/^https:\/\//.test(record.url) && !fromStub)) {
          throw new Error('no url')
        }
        const image = await fetch(record.url, { signal: AbortSignal.timeout(20_000) })
        if (!image.ok) throw new Error(String(image.status))
        const mime = image.headers.get('content-type') ?? ''
        if (!mime.startsWith('image/')) throw new Error('not an image')
        const bytes = await boundedBytes(image)
        if (bytes === null) throw new Error('too large')
        source = { url: record.url, title: record.title ?? 'Photo', mime, bytes }
      } catch {
        sendError(res, 502, 'upstream_failed', 'The photograph could not be fetched.')
        return
      }

      const outcome = await createFile(
        options.dbClient.db,
        options.fileStore,
        sessionOf(req)?.userId ?? '',
        {
          kind: 'cover',
          folderId: folderId.data,
          name: source.title.slice(0, 120) || 'Photo',
          mime: source.mime,
          bytes: source.bytes,
        },
      )
      if (outcome.kind !== 'created') {
        refusal(res, outcome)
        return
      }
      // The same answer 7.15's upload sends, because it is the same act: the
      // shape comes back with the id (issue #27). It matters more here than
      // there — the caller never held these bytes, the server fetched them
      // from the upstream's record, so this response is the only thing that
      // can tell it what was stored.
      res.status(201).json({
        id: outcome.id,
        bytes: outcome.bytes,
        width: outcome.width,
        height: outcome.height,
      })
    },
  )

  return router
}

/** The same refusals 7.15's upload sends, because it is the same act. */
function refusal(res: Response, outcome: CreateFileResult): void {
  switch (outcome.kind) {
    case 'folder_not_found':
      sendError(res, 404, 'not_found', 'Not found.')
      return
    case 'kind_mime_mismatch':
    case 'not_an_image':
      sendError(res, 422, 'validation_failed', 'file: must be a decodable image for this kind.')
      return
    case 'too_large':
      sendError(res, 422, 'validation_failed', 'file: must be at most 25 MB.')
      return
    case 'quota_exceeded':
      sendError(res, 413, 'quota_exceeded', "You've used your 1 GB of storage. Delete some files to add more.")
      return
    case 'voice_too_long':
    case 'created':
      return
  }
}
