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
import type {
  PostAvatarResponse,
  PostFilesResponse,
} from '../../shared/files.js'
import type { ObjectStore } from '../files/store.js'
import { sendError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface FilesRouterOptions {
  dbClient?: DbClient
  fileStore?: ObjectStore
  rateLimits?: RateLimits
}

/*
7.15's multipart fields.

**`folder_id` became optional for `cover` alone on 2026-09-03 (issues #20 and
#100).** Imran ruled that folders, shelves and the built-in pages get the same
four cover options and that "pictures should belong to the user instead of
only a folder"; a shelf and a place page are not folders, so a cover has to be
storable without one. Every other kind still requires it and the refusal is
422 naming the field, not the 404 a folder the caller cannot see would get:
an absent `folder_id` on a page image is a malformed request rather than a
scope failure, and it was 422 before this change too.

`superRefine` rather than a check in the handler so the rule is stated once,
in the shape the message comes from, and so `createFile`'s own restatement of
it (migration 0012's files_folderless_kind_check) is a second line of defence
rather than the only one.
*/
const uploadFields = z
  .object({
    kind: z.enum(['image', 'file', 'voice', 'cover']),
    folder_id: z.uuid().optional(),
    duration_ms: z.coerce.number().int().positive().optional(),
  })
  .superRefine((fields, ctx) => {
    if (fields.folder_id === undefined && fields.kind !== 'cover') {
      ctx.addIssue({
        code: 'custom',
        path: ['folder_id'],
        message: 'is required for every kind but cover',
      })
    }
  })

export function createFilesRouter(options: FilesRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
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
        /* One sentence for the whole shape, as before, rather than the
           per-field formatter: the parts of a multipart body are not the
           JSON fields `sendFieldValidationError` builds its paths from.
           The wording moved with the rule above — `folder_id` is a uuid
           where it is sent, and required for every kind but cover. */
        sendError(
          res,
          422,
          'validation_failed',
          'kind: must be image, file, voice or cover; folder_id must be a uuid, and is required for every kind but cover.',
        )
        return
      }
      if (req.file === undefined) {
        sendError(res, 422, 'validation_failed', 'file: must be supplied.')
        return
      }
      const outcome = await createFile(db, store, viewer(req), {
        kind: fields.data.kind as FileKind,
        folderId: fields.data.folder_id ?? null,
        name: req.file.originalname || 'file',
        mime: req.file.mimetype,
        bytes: req.file.buffer,
        durationMs: fields.data.duration_ms,
      })
      if (outcome.kind !== 'created') {
        refusal(res, outcome)
        return
      }
      /* Annotated, not inlined into `res.json`, which takes `any`: the
         annotation is the only thing tying this literal to the schema the
         client parses it with (#39). It catches both directions — a field
         the schema requires and this omits, and a field this sends and the
         schema does not declare.

         4.16's width and height ride back with the id (#27). This caller is
         holding the file and already knows its shape, so the pair is here for
         completeness and for one real use: 7.15 downscales anything past
         2048px, and this is the only place the answer says what the store
         actually kept. The reader who genuinely needs the numbers is a
         different person entirely, and reaches them through the page and
         thread reads. Null for every kind that carries no dimensions.
         `routes/cover-photos.ts` answers the same four for the same act,
         where the caller never held the bytes at all. */
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
      const fileId = parsedId(res, req.params.id)
      if (fileId === null) return
      const outcome = await deleteFile(db, store, viewer(req), fileId)
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
      /* As above: the shared schema is the contract, this is checked
         against it (#39). */
      const body: PostAvatarResponse = {
        avatar_url: `/api/v1/files/${outcome.id}`,
      }
      res.status(200).json(body)
    }),
  )

  /*
  7.15's removal, added in the polish round of 2026-08-30 under the owner's
  waiver of section 7's freeze.

  It is not `parsed`: there is no multipart body to read, and running the
  upload parser over a bodiless DELETE would be a middleware looking for a
  part that by definition is not there. Otherwise it is the POST's own
  contract, session, CSRF and the general mutation limit, so a picture is
  removed under exactly the guard it was set under.

  204 and no body, which is 7.0's shape for a mutation with nothing to
  report, and idempotent: the domain clears the column and the stored row
  whether or not either was there, so a second press is the same act rather
  than a 404 about a picture the person can already see is gone.
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
