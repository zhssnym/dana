/*
Cover photos from Openverse, fetched by the server so the CSP never widens:
search (thumbnails rewritten to our origin), a thumbnail proxy (upstream path
built from a validated uuid, so not an open proxy), and storing a chosen photo
through createFile, for a folder or for the caller alone. OPENVERSE_BASE exists
only for a test stub.
*/
import type { Request, Response, Router } from 'express'
import { z } from 'zod'

import type { DbClient } from '../../../db/client.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import { MAX_FILE_BYTES, createFile } from '../domain/files.js'
import type { CreateFileResult } from '../domain/files.js'
import type { ObjectStore } from '../files/store.js'
import { sendError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface CoverPhotosRouterOptions {
  dbClient?: DbClient
  fileStore?: ObjectStore
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

const uuidParam = z.uuid()
const searchQuery = z.object({ q: z.string().trim().min(1).max(200) })
const pickBody = z.object({ photo_id: z.uuid() })

function upstreamBase(): string {
  return process.env['OPENVERSE_BASE'] ?? 'https://api.openverse.org'
}

interface UpstreamResult {
  id?: string
  title?: string | null
  creator?: string | null
  url?: string | null
}

/** Read a body, refusing to buffer more than the upload limit. */
async function boundedBytes(response: globalThis.Response): Promise<Buffer | null> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_FILE_BYTES) return null
  const bytes = Buffer.from(await response.arrayBuffer())
  return bytes.byteLength > MAX_FILE_BYTES ? null : bytes
}

export function createCoverPhotosRouter(
  options: CoverPhotosRouterOptions = {},
): Router {
  const { router, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

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
          /* Served from this origin: img-src admits no third-party host. */
          thumb: `/api/v1/covers/photos/${String(item.id)}/thumb`,
        }))
      res.json({ results })
    },
  )

  router.get(
    '/covers/photos/:id/thumb',
    requireSession,
    async (req: Request, res: Response) => {
      const id = parsedId(res, req.params.id)
      if (id === null) return
      try {
        const upstream = await fetch(
          `${upstreamBase()}/v1/images/${id}/thumb/`,
          { signal: AbortSignal.timeout(10_000) },
        )
        if (!upstream.ok) throw new Error(String(upstream.status))
        const bytes = await boundedBytes(upstream)
        if (bytes === null) throw new Error('too large')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg')
        /* Immutable by id; cached so the grid does not refetch on every render. */
        res.setHeader('Cache-Control', 'private, max-age=86400')
        res.send(bytes)
      } catch {
        sendError(res, 502, 'upstream_failed', 'The thumbnail did not answer.')
      }
    },
  )

  /*
  Store the chosen photo as a `cover` file in `folderId` (null for a shelf or
  place page). The photo URL comes from Openverse's record, never the client;
  bytes are bounded before buffering; createFile applies the usual checks.
  */
  const storePhoto = async (
    req: Request,
    res: Response,
    folderId: string | null,
  ): Promise<void> => {
    if (options.dbClient === undefined || options.fileStore === undefined) {
      sendError(res, 500, 'internal_error', 'The application was constructed without a database.')
      return
    }
    const body = parseBody(pickBody, req, res, securityLog, {
      /* One sentence, as this endpoint always answered. */
      onInvalid: () => {
        sendError(res, 422, 'validation_failed', 'photo_id: must be a uuid.')
      },
    })
    if (body === null) return

    let source: { url: string; title: string; mime: string; bytes: Buffer }
    try {
      const detail = await fetch(`${upstreamBase()}/v1/images/${body.photo_id}/`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!detail.ok) throw new Error(String(detail.status))
      const record = (await detail.json()) as UpstreamResult
      /* https only, except URLs on the stub base during the contract test. */
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
      viewer(req),
      {
        kind: 'cover',
        folderId,
        name: source.title.slice(0, 120) || 'Photo',
        mime: source.mime,
        bytes: source.bytes,
      },
    )
    if (outcome.kind !== 'created') {
      refusal(res, outcome)
      return
    }
    // Same answer as an upload; it is the only way the caller learns what was stored.
    res.status(201).json({
      id: outcome.id,
      bytes: outcome.bytes,
      width: outcome.width,
      height: outcome.height,
    })
  }

  router.post(
    '/folders/:id/cover/photo',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      await storePhoto(req, res, folderId)
    },
  )

  /*
  Folder-less: the file is the caller's own, readable by nobody else. No
  accessOf gate by design: it creates a row owned by the caller on their own
  quota, like POST /me/avatar.
  */
  router.post(
    '/covers/photo',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      await storePhoto(req, res, null)
    },
  )

  return router
}

/** The same refusals as an upload. */
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
    case 'forbidden':
      /* A folder cover needs Can edit; the folder-less arm never gets here. */
      sendError(res, 403, 'forbidden', outcome.reason)
      return
    case 'voice_too_long':
    case 'created':
      return
  }
}
