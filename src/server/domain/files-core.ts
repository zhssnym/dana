// Files (4.16, 7.15). The table owns existence, ownership and quota; the caller's store holds bytes by row id.
// Order: scope, shape (kind, mime, caps), quota, write. The row inserts before the bytes so a store failure rolls back.
// Images are re-encoded through sharp once (max 2048px); width and height come from the stored output.
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { ObjectStore } from '../files/store.js'
import { SWEEP_BATCH, inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import type { SecurityLogger } from '../security/log.js'
import { accessOf, mayPerform, visibleFolder } from './folder-access.js'
import { operatorEmails } from './operators.js'
import {
  AUDIO_MIMES,
  FOLDERLESS_UPLOAD_KINDS,
  MAX_FILE_BYTES,
  RASTER_MIMES as RASTER_MIME_LIST,
  VIDEO_MIMES,
} from '../../shared/files.js'
import type { FileKind } from '../../shared/files.js'

export type { FileKind }

export { MAX_FILE_BYTES }
/** 10.3: a voice note up to 10 minutes. */
export const MAX_VOICE_MS = 10 * 60 * 1000
/** 10.3: 1 GB per account across every kind. */
export const QUOTA_BYTES = 1024 * 1024 * 1024
/** 7.15: the longest edge an image keeps. */
const MAX_IMAGE_EDGE = 2048

const IMAGE_KINDS: ReadonlySet<FileKind> = new Set(['image', 'cover', 'avatar'])

/*
Kinds that may be uploaded with no folder (migration 0015 less the avatar, which has its own route).
A folder-less row is its owner's alone. `voice` still requires a folder: it hangs on a comment thread.
 */
const FOLDERLESS_KINDS: ReadonlySet<FileKind> = new Set(FOLDERLESS_UPLOAD_KINDS)

/** Raster formats only: SVG serves like a document, and scripts on our origin could steal the session. */
const RASTER_MIMES: ReadonlySet<string> = new Set(RASTER_MIME_LIST)

/*
Audio and video allowlists. They fail closed: anything else can still be uploaded as a generic `file`.
The declared MIME is checked against the leading bytes (container, not codec). This does not prove the rest
of the payload is media (a UTF-16LE BOM is a valid MPEG frame sync). What stops rendering is the response:
nosniff, the declared audio/video Content-Type, and the CSP. Change those together with this check.
 */
const MEDIA_MIMES: Readonly<Record<'audio' | 'video', ReadonlySet<string>>> = {
  audio: new Set(AUDIO_MIMES),
  video: new Set(VIDEO_MIMES),
}

/** Container signatures, by their leading bytes. */
function containerOf(bytes: Buffer): string | null {
  const at = (offset: number, text: string): boolean =>
    bytes.length >= offset + text.length &&
    bytes.subarray(offset, offset + text.length).toString('latin1') === text
  if (at(0, 'ID3')) return 'mp3'
  if (at(0, 'OggS')) return 'ogg'
  if (at(0, 'fLaC')) return 'flac'
  if (at(0, 'RIFF') && at(8, 'WAVE')) return 'wav'
  if (at(4, 'ftyp')) return 'iso'
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return 'matroska'
  }
  /* A bare MPEG audio frame (also every ADTS AAC frame). Last, so tagged files match their tag first. */
  if (
    bytes.length >= 2 &&
    bytes[0] === 0xff &&
    ((bytes[1] ?? 0) & 0xe0) === 0xe0
  ) {
    return 'mpeg-frame'
  }
  return null
}

/** Which containers each allowlisted MIME may arrive in. */
const MIME_CONTAINERS: Readonly<Record<string, readonly string[]>> = {
  'audio/mpeg': ['mp3', 'mpeg-frame'],
  'audio/aac': ['mpeg-frame', 'iso'],
  'audio/mp4': ['iso'],
  'audio/ogg': ['ogg'],
  'audio/wav': ['wav'],
  'audio/x-wav': ['wav'],
  'audio/webm': ['matroska'],
  'audio/flac': ['flac'],
  'video/mp4': ['iso'],
  'video/webm': ['matroska'],
  'video/ogg': ['ogg'],
}

function looksLikeMedia(mime: string, bytes: Buffer): boolean {
  const container = containerOf(bytes)
  if (container === null) return false
  return (MIME_CONTAINERS[mime] ?? []).includes(container)
}

export interface UploadInput {
  kind: FileKind
  folderId: string | null
  name: string
  mime: string
  bytes: Buffer
  durationMs?: number
}

export type CreateFileResult =
  /** Dimensions: null for kinds that are not re-encoded, never a guess. */
  | {
      kind: 'created'
      id: string
      bytes: number
      width: number | null
      height: number | null
    }
  | { kind: 'folder_not_found' }
  | { kind: 'kind_mime_mismatch' }
  | { kind: 'not_an_image' }
  /** The declared audio/video MIME does not match the bytes. The generic `file` path is still open. */
  | { kind: 'not_supported_media' }
  | { kind: 'too_large' }
  | { kind: 'voice_too_long' }
  | { kind: 'quota_exceeded' }
  | { kind: 'forbidden'; reason: string }

/* `file` accepts any MIME on purpose: its safety is in serving (attachment, nosniff), not in this check.
`voice` keeps `audio/*`, since its bytes come from the browser's recorder. */
function mimeMatchesKind(kind: FileKind, mime: string): boolean {
  if (IMAGE_KINDS.has(kind)) return RASTER_MIMES.has(mime)
  if (kind === 'voice') return mime.startsWith('audio/')
  if (kind === 'audio' || kind === 'video') return MEDIA_MIMES[kind].has(mime)
  return true
}

/** The bytes to store and their shape after `.rotate()` and the downscale. */
interface Reencoded {
  bytes: Buffer
  width: number
  height: number
}

/**
 * sharp is imported lazily, on first upload. The decompression-bomb guard is sharp's default limitInputPixels:
 * a pixel-flood throws, this answers null, the route refuses 422. Never pass limitInputPixels: false.
 */
async function downscaled(bytes: Buffer): Promise<Reencoded | null> {
  try {
    const { default: sharp } = await import('sharp')
    const { data, info } = await sharp(bytes)
      .rotate()
      .resize({
        width: MAX_IMAGE_EDGE,
        height: MAX_IMAGE_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer({ resolveWithObject: true })
    return { bytes: data, width: info.width, height: info.height }
  } catch {
    return null
  }
}

export async function createFile(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  input: UploadInput,
): Promise<CreateFileResult> {
  /* Scope before shape (10.2). A picture's scope matches its page's: folder-scoped for a folder page,
  folder-less for a shelf or place cover. An avatar refuses a folder. */
  if (input.kind === 'avatar') {
    if (input.folderId !== null) return { kind: 'kind_mime_mismatch' }
  } else if (input.folderId === null) {
    if (!FOLDERLESS_KINDS.has(input.kind)) return { kind: 'folder_not_found' }
  } else {
    const facts = await accessOf(db, viewerId, input.folderId)
    if (facts === null) return { kind: 'folder_not_found' }
    /*
    The bar depends on what the kind supports. `cover`, `image`, `audio` and `video` decorate a page: `file.upload.page`.
    `file` and `voice` take `file.upload.comment`, the floor for a comment attachment, since an upload does not say
    where the file goes. Placing a file on a page is gated at the page write, which needs can_edit.
     */
    const action =
      input.kind === 'file' || input.kind === 'voice'
        ? 'file.upload.comment'
        : 'file.upload.page'
    const allowed = mayPerform(facts, action)
    if (!allowed.allowed) return { kind: 'forbidden', reason: allowed.reason }
  }

  if (!mimeMatchesKind(input.kind, input.mime)) {
    return { kind: 'kind_mime_mismatch' }
  }
  if (input.bytes.byteLength > MAX_FILE_BYTES) return { kind: 'too_large' }
  if (
    input.kind === 'voice' &&
    input.durationMs !== undefined &&
    input.durationMs > MAX_VOICE_MS
  ) {
    return { kind: 'voice_too_long' }
  }

  /* After the size cap: audio and video bytes must match their declared container. */
  if (
    (input.kind === 'audio' || input.kind === 'video') &&
    !looksLikeMedia(input.mime, input.bytes)
  ) {
    return { kind: 'not_supported_media' }
  }

  let stored = input.bytes
  let width: number | null = null
  let height: number | null = null
  if (IMAGE_KINDS.has(input.kind)) {
    const scaled = await downscaled(input.bytes)
    if (scaled === null) return { kind: 'not_an_image' }
    stored = scaled.bytes
    width = scaled.width
    height = scaled.height
  }

  return inTransaction(db, async (tx) => {
    if (input.folderId !== null) {
      const facts = await accessOf(tx, viewerId, input.folderId)
      if (facts === null) return { kind: 'folder_not_found' } as const
      const action = input.kind === 'file' || input.kind === 'voice'
        ? 'file.upload.comment' : 'file.upload.page'
      const allowed = mayPerform(facts, action)
      if (!allowed.allowed) return { kind: 'forbidden', reason: allowed.reason } as const
    }
    // Lock the owner's row so two uploads racing the last megabyte serialize.
    await tx.execute(
      sql`SELECT 1 FROM users WHERE id = ${viewerId} FOR UPDATE`,
    )
    const used = await rowsOf(
      tx,
      sql`SELECT coalesce(sum(bytes), 0)::bigint AS used
          FROM files WHERE owner_id = ${viewerId}`,
    )
    if (Number(used[0]?.used ?? 0) + stored.byteLength > QUOTA_BYTES) {
      return { kind: 'quota_exceeded' } as const
    }

    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO files (owner_id, folder_id, kind, name, mime, bytes,
                             duration_ms, width, height)
          VALUES (${viewerId}::uuid,
                  ${input.folderId === null ? null : input.folderId},
                  ${input.kind}, ${input.name}, ${input.mime},
                  ${stored.byteLength}, ${input.durationMs ?? null},
                  ${width}, ${height})
          RETURNING id`,
    )
    const id = String(inserted[0]?.id)
    // Inside the transaction: a store failure throws and takes the row with it.
    await store.put(id, stored)
    return {
      kind: 'created',
      id,
      bytes: stored.byteLength,
      width,
      height,
    } as const
  })
}

/*
Who may read a stored file, as one SQL predicate over `files f`, shared by serving and every cover gate.
Folder-scoped: its members. Folder-less avatar: any signed-in account. Any other folder-less file: its owner only,
and operators when it is attached to feedback.
Do not rewrite the folder-less arm as a list of kinds. A correlated EXISTS, so callers need only `files f`.
 */
export function readableFileScope(viewerId: string): SQL {
  return sql`(
    (f.folder_id IS NULL AND (f.kind = 'avatar' OR f.owner_id = ${viewerId}))
    OR ${visibleFolder(sql`f.folder_id`, viewerId)}
    OR ${feedbackFileForOperator(viewerId)}
  )`
}

function feedbackFileForOperator(viewerId: string): SQL {
  const operators = [...operatorEmails(process.env.DANA_OPERATORS)]
  if (operators.length === 0) return sql`false`
  return sql`EXISTS (
    SELECT 1 FROM feedback_files ff JOIN users ou ON ou.id = ${viewerId} AND ou.deleted_at IS NULL
     WHERE ff.file_id = f.id AND ou.email IN (${sql.join(operators.map((email) => sql`${email}`), sql`, `)}))`
}

export interface ServedFile {
  id: string
  name: string
  mime: string
  kind: FileKind
  bytes: Buffer
}

/** 7.15's authenticated serving, scoped by `readableFileScope` only. There are no public URLs. */
export async function serveFile(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  fileId: string,
): Promise<ServedFile | null> {
  const found = await rowsOf(
    db,
    sql`SELECT f.id, f.name, f.mime, f.kind
        FROM files f
        WHERE f.id = ${fileId} AND ${readableFileScope(viewerId)}`,
  )
  const row = found[0]
  if (row === undefined) return null
  const bytes = await store.get(String(row.id))
  if (bytes === null) return null
  return {
    id: String(row.id),
    name: String(row.name),
    mime: String(row.mime),
    kind: String(row.kind) as FileKind,
    bytes,
  }
}

export type DeleteFileResult = 'deleted' | 'forbidden' | 'not_found'

/*
DELETE /files/:id. A caller who cannot read the file gets 404; one who can but may not delete it gets 403 (10.2).
The readability check runs only when nothing was deleted, in the same transaction.
 */
export async function deleteFile(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  fileId: string,
): Promise<DeleteFileResult> {
  const outcome = await inTransaction(db, async (tx) => {
    /* Read the blocks naming this file before the delete, since SET NULL erases the link. Lock the file row first
    so no block can start naming it in between. Mark them only if the delete removes the row. */
    await tx.execute(sql`SELECT id FROM files WHERE id = ${fileId} FOR UPDATE`)
    const home = await rowsOf(tx, sql`SELECT folder_id FROM files WHERE id = ${fileId}::uuid`)
    const folderId = home[0]?.folder_id
    if (folderId !== null && folderId !== undefined) {
      const access = await accessOf(tx, viewerId, String(folderId))
      if (access !== null && !mayPerform(access, 'file.delete').allowed) {
        return 'forbidden' as const
      }
    }
    const wearers = await blocksNamingFiles(tx, sql`${fileId}::uuid`)
    /* Folder-scoped files need Full control of the Folder to delete, not authorship. Folder-less files stay the owner's. */
    const removed = await rowsOf(
      tx,
      sql`DELETE FROM files f
          WHERE f.id = ${fileId}
            AND (
              (f.folder_id IS NULL AND f.owner_id = ${viewerId})
              OR EXISTS (SELECT 1 FROM folders fo
                          JOIN visible_folder_members m ON m.folder_id = fo.project_id
                          WHERE fo.id = f.folder_id
                            AND m.user_id = ${viewerId}
                            AND m.access = 'full_control'
                            AND fo.deleted_at IS NULL)
            )
          RETURNING f.id`,
    )
    if (removed.length > 0) {
      await markBlocksReclaimed(tx, wearers)
      return 'deleted' as const
    }
    const readable = await rowsOf(
      tx,
      sql`SELECT f.id FROM files f
          WHERE f.id = ${fileId} AND ${readableFileScope(viewerId)}`,
    )
    return readable.length > 0 ? ('forbidden' as const) : ('not_found' as const)
  })
  if (outcome === 'deleted') await store.remove(fileId)
  return outcome
}

/*
`file_reclaimed_at` tells "never filled" from "file was taken" on a media block whose file_id went null.
Every server path that deletes a possibly-referenced file marks it: read before the delete, write after it succeeds.
 */
export async function blocksNamingFiles(
  tx: Executor,
  fileIds: SQL,
): Promise<string[]> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id FROM page_blocks WHERE file_id IN (${fileIds}) FOR UPDATE`,
  )
  return rows.map((row) => String(row.id))
}

export async function markBlocksReclaimed(
  tx: Executor,
  blockIds: readonly string[],
): Promise<void> {
  if (blockIds.length === 0) return
  await tx.execute(
    sql`UPDATE page_blocks SET file_reclaimed_at = now()
         WHERE file_id IS NULL
           AND id IN (${sql.join(
             blockIds.map((id) => sql`${id}::uuid`),
             sql`, `,
           )})`,
  )
}

/** Stores the avatar as its own files row and points users.avatar_url at it. The previous avatar row goes. */
export async function setAvatar(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  input: Omit<UploadInput, 'kind' | 'folderId'>,
): Promise<CreateFileResult> {
  const created = await createFile(db, store, viewerId, {
    ...input,
    kind: 'avatar',
    folderId: null,
  })
  if (created.kind !== 'created') return created
  const previous = await rowsOf(
    db,
    sql`DELETE FROM files
        WHERE owner_id = ${viewerId} AND kind = 'avatar'
          AND id <> ${created.id}::uuid
        RETURNING id`,
  )
  for (const row of previous) await store.remove(String(row.id))
  await db.execute(
    sql`UPDATE users SET avatar_url = ${'/api/v1/files/' + created.id}
        WHERE id = ${viewerId}`,
  )
  return created
}

/*
Clear the avatar: the column and the stored row with its bytes, so no quota is spent on a dead picture.
Idempotent; 204 either way.
 */
export async function clearAvatar(
  db: Db,
  store: ObjectStore,
  viewerId: string,
): Promise<void> {
  const removed = await inTransaction(db, async (tx) => {
    await tx.execute(
      sql`UPDATE users SET avatar_url = NULL WHERE id = ${viewerId}`,
    )
    return rowsOf(
      tx,
      sql`DELETE FROM files
          WHERE owner_id = ${viewerId} AND kind = 'avatar'
          RETURNING id`,
    )
  })
  for (const row of removed) await store.remove(String(row.id))
}

/*
Cover file lifetime (7.19). On set, a cover not already the setter's own in the page's scope is copied,
so leaving a folder cannot blank it. Folder-less pictures nothing references are reclaimed by the 11.7 tick
30 days after `files.unreferenced_since`, not `created_at`, so a cover worn again within the window is kept.
 */

/** Nothing is destroyed sooner than 30 days (7.13, 8.8). */
export const COVER_RECLAIM_DAYS = 30

export type CoverFileResult =
  /** The named file already sits in the page's scope: no copy, no bytes. */
  | { kind: 'kept'; id: string }
  /** A copy was made. Its bytes are already stored, so a caller whose transaction fails must remove them. */
  | { kind: 'copied'; id: string }
  /** The source row exists but its bytes do not. */
  | { kind: 'bytes_missing' }
  /** 10.3's 1 GB, refused like an upload: 413. */
  | { kind: 'quota_exceeded' }

/**
 * `coverFileFor` keeps a file already the setter's own cover in the page's scope and copies anything else;
 * `copyCoverFile` always copies (duplicates must stay independent). Callers check readability and kind first.
 * `scopeFolderId` is the page's scope: null for shelf and place pages, the folder id for a folder cover.
 * Bytes are written after the row, inside the caller's transaction, so callers remove them if it later throws.
 */
export async function coverFileFor(
  tx: Executor,
  store: ObjectStore,
  viewerId: string,
  sourceFileId: string,
  scopeFolderId: string | null,
): Promise<CoverFileResult> {
  const source = await coverSource(tx, sourceFileId)
  if (source === undefined) return { kind: 'bytes_missing' }
  const sourceFolderId =
    source.folder_id === null || source.folder_id === undefined
      ? null
      : String(source.folder_id)
  if (
    sourceFolderId === scopeFolderId &&
    String(source.kind) === 'cover' &&
    String(source.owner_id) === viewerId
  ) {
    return { kind: 'kept', id: String(source.id) }
  }
  return copyOf(tx, store, viewerId, source, scopeFolderId, 'cover')
}

/** Always a new copy. Never answers `kept`. */
export async function copyCoverFile(
  tx: Executor,
  store: ObjectStore,
  viewerId: string,
  sourceFileId: string,
  scopeFolderId: string | null,
): Promise<CoverFileResult> {
  const source = await coverSource(tx, sourceFileId)
  if (source === undefined) return { kind: 'bytes_missing' }
  return copyOf(tx, store, viewerId, source, scopeFolderId, 'cover')
}

/*
Copies a page block's file and keeps the source's kind and metadata, so a video stays a video and a generic
`file` never becomes inline media. Never rewrite the kind afterwards. Dimensions and voice duration
carry only where their CHECKs allow.
 */
export async function copyPageFile(
  tx: Executor,
  store: ObjectStore,
  viewerId: string,
  sourceFileId: string,
  scopeFolderId: string | null,
): Promise<CoverFileResult> {
  const source = await coverSource(tx, sourceFileId)
  if (source === undefined) return { kind: 'bytes_missing' }
  return copyOf(
    tx,
    store,
    viewerId,
    source,
    scopeFolderId,
    String(source.kind) as FileKind,
  )
}

async function coverSource(
  tx: Executor,
  sourceFileId: string,
): Promise<Record<string, unknown> | undefined> {
  const found = await rowsOf(
    tx,
    sql`SELECT id, owner_id, folder_id, kind, name, mime, width, height,
               duration_ms
        FROM files WHERE id = ${sourceFileId}`,
  )
  return found[0]
}

async function copyOf(
  tx: Executor,
  store: ObjectStore,
  viewerId: string,
  source: Record<string, unknown>,
  scopeFolderId: string | null,
  kind: FileKind,
): Promise<CoverFileResult> {
  const bytes = await store.get(String(source.id))
  if (bytes === null) return { kind: 'bytes_missing' }

  /* Lock the owner's row for the quota, as `createFile` does. */
  await tx.execute(sql`SELECT 1 FROM users WHERE id = ${viewerId} FOR UPDATE`)
  const used = await rowsOf(
    tx,
    sql`SELECT coalesce(sum(bytes), 0)::bigint AS used
        FROM files WHERE owner_id = ${viewerId}`,
  )
  if (Number(used[0]?.used ?? 0) + bytes.byteLength > QUOTA_BYTES) {
    return { kind: 'quota_exceeded' }
  }

  /* A cover copy is always `cover`, so the reclaim sweep recognises it; a page copy keeps the source kind.
  Dimensions and duration are copied only where the new kind's CHECK admits them. */
  const carriesShape = IMAGE_KINDS.has(kind)
  const inserted = await rowsOf(
    tx,
    sql`INSERT INTO files (owner_id, folder_id, kind, name, mime, bytes,
                           width, height, duration_ms)
        VALUES (${viewerId}::uuid, ${scopeFolderId}, ${kind},
                ${String(source.name)}, ${String(source.mime)},
                ${bytes.byteLength},
                ${!carriesShape || source.width === null || source.width === undefined ? null : Number(source.width)},
                ${!carriesShape || source.height === null || source.height === undefined ? null : Number(source.height)},
                ${kind !== 'voice' || source.duration_ms === null || source.duration_ms === undefined ? null : Number(source.duration_ms)})
        RETURNING id`,
  )
  const id = String(inserted[0]?.id)
  /* A failed `put` may still have written bytes, and the caller cannot know their id, so remove them here. */
  try {
    await store.put(id, bytes)
  } catch (error: unknown) {
    try {
      await store.remove(id)
    } catch {
      // Unreachable bytes; they must not replace the real error.
    }
    throw error
  }
  return { kind: 'copied', id }
}

/*
Every column that can reference a file. users.avatar_url is a URL, not a key, so it is not here:
the sweep's kind clause is the only thing protecting avatars. guard-reclaim-reference-arms.test.ts
checks FKs against this predicate but cannot see text references.
 */
function fileIsUnreferenced(): SQL {
  return sql`(
    NOT EXISTS (SELECT 1 FROM comment_files cf WHERE cf.file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM page_blocks b WHERE b.file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM folders fo WHERE fo.cover_file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM shelves s WHERE s.cover_file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM user_page_covers u WHERE u.file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM feedback_files ff WHERE ff.file_id = f.id)
  )`
}

/*
The kinds the reclaim sweep may touch, shared by its clear, mark and delete arms, which must agree.
Widen only by naming kinds, never NOT IN: leaving out `avatar` is what protects profile pictures.
Not FOLDERLESS_UPLOAD_KINDS: that list answers a different question and may widen.
 */
const RECLAIMABLE_KINDS = [
  'cover',
  'image',
  'file',
  'audio',
  'video',
] as const satisfies readonly FileKind[]

/** `RECLAIMABLE_KINDS` as bound parameters over `files f`. */
function kindIsReclaimable(): SQL {
  return sql`f.kind IN (${sql.join(
    RECLAIMABLE_KINDS.map((kind) => sql`${kind}`),
    sql`, `,
  )})`
}

/**
 * The 11.7 tick's reclaim: folder-less files of `RECLAIMABLE_KINDS` that nothing references.
 * One statement, three CTEs on one snapshot: clear marks on referenced rows, mark newly unreferenced rows,
 * delete rows marked over 30 days ago. The delete re-tests `fileIsUnreferenced()` itself, so it never relies
 * on the other arms. The claim is FOR UPDATE SKIP LOCKED, capped at SWEEP_BATCH; objects are removed after.
 * Logs one `file_reclaimed` line per row.
 */
export async function reclaimUnwornPictures(
  db: Db,
  store: ObjectStore | undefined,
  logger: SecurityLogger,
): Promise<string[]> {
  const removed = await rowsOf(
    db,
    sql`WITH cleared AS (
          UPDATE files f SET unreferenced_since = NULL
           WHERE f.unreferenced_since IS NOT NULL
             AND ${kindIsReclaimable()}
             AND NOT ${fileIsUnreferenced()}
          RETURNING f.id),
        marked AS (
          UPDATE files f SET unreferenced_since = now()
           WHERE ${kindIsReclaimable()}
             AND f.folder_id IS NULL
             AND f.unreferenced_since IS NULL
             AND ${fileIsUnreferenced()}
          RETURNING f.id)
        DELETE FROM files WHERE id IN (
          SELECT f.id FROM files f
           WHERE ${kindIsReclaimable()}
             AND f.folder_id IS NULL
             AND f.unreferenced_since
                   < now() - ${COVER_RECLAIM_DAYS}::int * interval '1 day'
             AND ${fileIsUnreferenced()}
           LIMIT ${SWEEP_BATCH}
           FOR UPDATE SKIP LOCKED)
        RETURNING id, kind, owner_id, bytes,
                  to_char(unreferenced_since AT TIME ZONE 'UTC',
                          'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS unreferenced_since`,
  )
  const ids = removed.map((row) => String(row.id))

  /* Log every row before removing any object: the rows are already gone, so a crash mid-loop
  must not lose the record. */
  for (const row of removed) {
    logger.fileReclaimed({
      fileId: String(row.id),
      ownerId: String(row.owner_id),
      kind: String(row.kind),
      bytes: Number(row.bytes),
      unreferencedSince:
        row.unreferenced_since === null || row.unreferenced_since === undefined
          ? null
          : String(row.unreferenced_since),
    })
  }

  if (store !== undefined) {
    for (const id of ids) {
      try {
        await store.remove(id)
      } catch {
        // Unreachable bytes: the row is already gone, so a refused rm is not actionable.
      }
    }
  }
  return ids
}
