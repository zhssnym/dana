/*
The 7.15 surface: uploads, authenticated serving, deletion, and the avatar
(RFC 0005). Multipart parsing is multer's, memory storage under 10.3's 25 MB
cap so a payload larger than the law never buffers whole; everything after
the parse is the domain module's.

Status grammar (7.0, 10.2, 10.3): scope failures 404; a mime that does not
match its declared kind, a missing file part, an undecodable image, and the
size cap all 422 naming the field; the storage quota alone answers 413 with
section 9's copy. Serving sets nosniff and confines kind 'file' to an
attachment, because bytes a member chose are served on the application's
own origin and a text/html "document" inline would be a script with a
session (the S4 security review's condition).
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { z } from 'zod'

import type { Db, DbClient } from '../../../db/client.js'
import {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from '../auth/index.js'
import {
  MAX_FILE_BYTES,
  createFile,
  deleteFile,
  serveFile,
  setAvatar,
} from '../domain/files.js'
import type { CreateFileResult, FileKind } from '../domain/files.js'
import type { ObjectStore } from '../files/store.js'
import { sendError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'

export interface FilesRouterOptions {
  dbClient?: DbClient
  fileStore?: ObjectStore
  rateLimits?: RateLimits
}

const uuidParam = z.uuid()

const uploadFields = z.object({
  kind: z.enum(['image', 'file', 'voice', 'cover']),
  folder_id: z.uuid(),
  duration_ms: z.coerce.number().int().positive().optional(),
})

export function createFilesRouter(options: FilesRouterOptions = {}): Router {
  const router = Router()
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const parseUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  }).single('file')

  const database = (res: Response): Db | null => {
    if (options.dbClient === undefined) {
      sendError(
        res,
        500,
        'internal_error',
        'The application was constructed without a database.',
      )
      return null
    }
    return options.dbClient.db
  }
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

  const viewer = (req: Request): string => sessionOf(req)?.userId ?? ''

  /** Multer's size refusal arrives as an error, not a request; 10.3 makes
   * it a 422 naming the field, the quota alone being 413. */
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
        // 10.3: the one limit that answers 413, with section 9's copy.
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
      const fields = uploadFields.safeParse(req.body)
      if (!fields.success) {
        sendError(
          res,
          422,
          'validation_failed',
          'kind: must be image, file, voice or cover, with folder_id a uuid.',
        )
        return
      }
      if (req.file === undefined) {
        sendError(res, 422, 'validation_failed', 'file: must be supplied.')
        return
      }
      const outcome = await createFile(db, store, viewer(req), {
        kind: fields.data.kind as FileKind,
        folderId: fields.data.folder_id,
        name: req.file.originalname || 'file',
        mime: req.file.mimetype,
        bytes: req.file.buffer,
        durationMs: fields.data.duration_ms,
      })
      if (outcome.kind !== 'created') {
        refusal(res, outcome)
        return
      }
      res.status(201).json({ id: outcome.id, bytes: outcome.bytes })
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
      const fileId = uuidParam.safeParse(req.params.id)
      if (!fileId.success) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const served = await serveFile(db, store, viewer(req), fileId.data)
      if (served === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.setHeader('X-Content-Type-Options', 'nosniff')
      const inline = served.kind !== 'file'
      // Control characters and quotes leave the filename (the S4 security
      // review's second condition): a name is data and a header is not.
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
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const store = storeOf(res)
      if (store === null) return
      const fileId = uuidParam.safeParse(req.params.id)
      if (!fileId.success) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const outcome = await deleteFile(db, store, viewer(req), fileId.data)
      if (outcome === 'not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
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
      res
        .status(200)
        .json({ avatar_url: `/api/v1/files/${outcome.id}` })
    }),
  )

  return router
}
