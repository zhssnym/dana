/*
The 7.15 file routes. Multer buffers in memory under the 25 MB cap. Only the
storage quota answers 413. Served files get nosniff, and kind `file` is always
an attachment: member bytes on our origin served inline as HTML would be a
script with a session.
*/
import type { Request, Response, Router } from 'express'
import multer from 'multer'
import { z } from 'zod'

import type { DbClient } from '../../../db/client.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import {
  MAX_FILE_BYTES,
  clearAvatar,
  createFile,
  deleteFile,
  serveFile,
  setAvatar,
} from '../domain/files.js'
import type { CreateFileResult, FileKind } from '../domain/files.js'
import {
  FOLDERLESS_UPLOAD_KINDS,
  UPLOAD_FILE_KINDS,
} from '../../shared/files.js'
import type {
  PostAvatarResponse,
  PostFilesResponse,
} from '../../shared/files.js'
import type { ObjectStore } from '../files/store.js'
import { sendError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { retiredRoute } from '../observability/retired-route.js'
import { routerWithPreamble } from './preamble.js'

export interface FilesRouterOptions {
  dbClient?: DbClient
  fileStore?: ObjectStore
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

/*
`folder_id` is optional for every kind but `voice`: covers, images and composer
assets may belong to non-folder pages and are then the uploader's alone. A
missing folder on a voice note is 422, not 404. createFile re-checks this
(files_folderless_kind_check, migration 0015).
*/
const FOLDERLESS_KINDS = new Set<string>(FOLDERLESS_UPLOAD_KINDS)

const uploadFields = z
  .object({
    kind: z.enum(UPLOAD_FILE_KINDS),
    folder_id: z.uuid().optional(),
    duration_ms: z.coerce.number().int().positive().optional(),
  })
  .superRefine((fields, ctx) => {
    if (fields.folder_id === undefined && !FOLDERLESS_KINDS.has(fields.kind)) {
      ctx.addIssue({
        code: 'custom',
        path: ['folder_id'],
        message: 'is required for a voice note',
      })
    }
  })

export function createFilesRouter(options: FilesRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()
  const parseUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  }).single('file')

  const storeOf = (res: Response): ObjectStore | null => {
    if (options.fileStore === undefined) {
      sendError(
        res,
        500,
        'internal_error',
        'The application was constructed without an object store.',
      )
      return null
    }
    return options.fileStore
  }

  /** Multer's size refusal is a 422 naming the field (10.3). */
  const parsed =
    (handler: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response) => {
      parseUpload(req, res, (err: unknown) => {
        if (err !== undefined && err !== null) {
          sendError(
            res,
            422,
            'validation_failed',
            'file: must be a single part of at most 25 MB.',
          )
          return
        }
        void handler(req, res)
      })
    }

  const refusal = (res: Response, outcome: CreateFileResult): void => {
    switch (outcome.kind) {
      case 'folder_not_found':
        sendError(res, 404, 'not_found', 'Not found.')
        return
      case 'forbidden':
        // The caller sees the folder, so 403 may name the rule.
        sendError(res, 403, 'forbidden', outcome.reason)
        return
      case 'kind_mime_mismatch':
        sendError(
          res,
          422,
          'validation_failed',
          'mime: must match the declared kind.',
        )
        return
      case 'not_an_image':
        sendError(
          res,
          422,
          'validation_failed',
          'file: must be a decodable image for this kind.',
        )
        return
      case 'not_supported_media':
        /* The bytes are not the declared audio/video container; the message
           points to uploading as kind=file instead. */
        sendError(
          res,
          422,
          'validation_failed',
          'file: must be a supported audio or video file for this kind; upload it as kind=file instead.',
        )
        return
      case 'too_large':
        sendError(
          res,
          422,
          'validation_failed',
          'file: must be at most 25 MB.',
        )
        return
      case 'voice_too_long':
        sendError(
          res,
          422,
          'validation_failed',
          'duration_ms: a voice note is at most 10 minutes.',
        )
        return
      case 'quota_exceeded':
        sendError(
          res,
          413,
          'quota_exceeded',
          "You've used your 1 GB of storage. Delete some files to add more.",
        )
        return
      case 'created':
        return
    }
  }

  router.post(
    '/files',
    requireSession,
    requireCsrf,
    mutationLimit,
    parsed(async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const store = storeOf(res)
      if (store === null) return
      const fields = parseBody(uploadFields, req, res, securityLog, {
        /* One sentence for the whole shape: multipart parts are not JSON paths. */
        onInvalid: () => {
          sendError(
            res,
            422,
            'validation_failed',
            'kind: must be image, file, voice, cover, audio or video; folder_id must be a uuid, and is required for a voice note.',
          )
        },
      })
      if (fields === null) return
      if (req.file === undefined) {
        sendError(res, 422, 'validation_failed', 'file: must be supplied.')
        return
      }
      const outcome = await createFile(db, store, viewer(req), {
        kind: fields.kind as FileKind,
        folderId: fields.folder_id ?? null,
        name: req.file.originalname || 'file',
        mime: req.file.mimetype,
        bytes: req.file.buffer,
        durationMs: fields.duration_ms,
      })
      if (outcome.kind !== 'created') {
        refusal(res, outcome)
        return
      }
      /* Typed against the client's schema; `res.json` takes `any`. Width and
         height say what the store kept after downscaling. */
      const body: PostFilesResponse = {
        id: outcome.id,
        bytes: outcome.bytes,
        width: outcome.width,
        height: outcome.height,
      }
      res.status(201).json(body)
    }),
  )

  router.get(
    '/files/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const store = storeOf(res)
      if (store === null) return
      const fileId = parsedId(res, req.params.id)
      if (fileId === null) return
      const served = await serveFile(db, store, viewer(req), fileId)
      if (served === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.setHeader('X-Content-Type-Options', 'nosniff')
      /* An allowlist, so a new kind defaults to attachment. These kinds are
         validated on upload; `file` is untrusted bytes and with nosniff is
         never executed. */
      const INLINE_KINDS: ReadonlySet<FileKind> = new Set([
        'image',
        'cover',
        'avatar',
        'voice',
        'audio',
        'video',
      ])
      const inline = INLINE_KINDS.has(served.kind)
      // Strip control characters and quotes: the name goes into a header.
      const safeName = [...served.name]
        .filter((c) => {
          const code = c.charCodeAt(0)
          return code > 31 && code !== 127 && c !== '"'
        })
        .join('')
      res.setHeader(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
      )
      res.status(200).type(served.mime).send(served.bytes)
    },
  )

  router.delete(
    '/files/:id',
    requireSession,
    retiredRoute(securityLog, 'delete_file'),
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const store = storeOf(res)
      if (store === null) return
      const fileId = parsedId(res, req.params.id)
      if (fileId === null) return
      const outcome = await deleteFile(db, store, viewer(req), fileId)
      if (outcome === 'not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (outcome === 'forbidden') {
        /* The caller can already GET these bytes, so 403 leaks nothing. */
        sendError(
          res,
          403,
          'forbidden',
          'Only people with Full control can delete files from this folder.',
        )
        return
      }
      res.status(204).end()
    },
  )

  router.post(
    '/me/avatar',
    requireSession,
    requireCsrf,
    mutationLimit,
    parsed(async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const store = storeOf(res)
      if (store === null) return
      if (req.file === undefined) {
        sendError(res, 422, 'validation_failed', 'file: must be supplied.')
        return
      }
      const outcome = await setAvatar(db, store, viewer(req), {
        name: req.file.originalname || 'avatar',
        mime: req.file.mimetype,
        bytes: req.file.buffer,
      })
      if (outcome.kind !== 'created') {
        refusal(res, outcome)
        return
      }
      /* Typed against the client's schema, as above. */
      const body: PostAvatarResponse = {
        avatar_url: `/api/v1/files/${outcome.id}`,
      }
      res.status(200).json(body)
    }),
  )

  /*
  No multipart parser on a bodiless DELETE. Idempotent 204: a second press
  clears nothing and is not a 404.
  */
  router.delete(
    '/me/avatar',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const store = storeOf(res)
      if (store === null) return
      await clearAvatar(db, store, viewer(req))
      res.status(204).end()
    },
  )

  return router
}
