/*
The S4 domain module: files per 4.16 and 7.15 (RFC 0005). The table is the
authority on existence, ownership and quota; the object store holds bytes
under the row's id and is handed in by the caller, never constructed here.

Order of decisions, and why it is 10.2's order: scope first (a folder the
viewer cannot read answers not-found before their body is judged), then the
shape rules (kind against mime, the caps), then quota, then the write. The
row inserts before the bytes land so the store failure rolls the row back;
the orphan the opposite order leaves is a row without bytes, which serving
would then have to explain forever.

Images pass through sharp once, downscale and validation in one act: a
payload that claims image/* and cannot be decoded is refused as the lying
mime it is (AC-194's security half), and one that can is bounded to 2048px
on its longest edge, which is 7.15's server-side downscale.

That same pass now answers the shape of what it wrote (4.16's width and
height, migration 0009, issue #27). The numbers are read off sharp's own
report of the buffer it produced rather than off the bytes that arrived, so
they describe the object the store holds: the rotation is already applied and
the downscale has already happened, and a reader reserving a box from them is
reserving it for the picture it will actually be served. They cost nothing
extra because the pass was already being made. Only the image kinds have
them; a voice note and a downloaded attachment keep null, which 0009's
files_dimensions_kind_check enforces rather than trusts.

No events: a file upload is not one of 4.13's subjects. The act that
consumes the file (a page edit, a comment, a cover) records itself.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { ObjectStore } from '../files/store.js'
import { inTransaction, rowsOf } from './db.js'
import { accessOf } from './folders.js'

export type FileKind = 'image' | 'file' | 'voice' | 'cover' | 'avatar'

/** 10.3: one uploaded file up to 25 MB. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024
/** 10.3: a voice note up to 10 minutes. */
export const MAX_VOICE_MS = 10 * 60 * 1000
/** 10.3 (D5): 1 GB per account across every kind. */
export const QUOTA_BYTES = 1024 * 1024 * 1024
/** 7.15: the longest edge an image keeps. */
const MAX_IMAGE_EDGE = 2048

const IMAGE_KINDS: ReadonlySet<FileKind> = new Set(['image', 'cover', 'avatar'])

/** Raster formats only for the image kinds (the S4 security review's first
 * condition): SVG decodes like an image and serves like a document, and a
 * document with scripts on the application's own origin is a session
 * walking out the door. */
const RASTER_MIMES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
])

export interface UploadInput {
  kind: FileKind
  folderId: string | null
  name: string
  mime: string
  bytes: Buffer
  durationMs?: number
}

export type CreateFileResult =
  /** 4.16's dimensions ride back with the id (issue #27): null for every
   *  kind that does not pass through the re-encode, and never a guess. */
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
  | { kind: 'too_large' }
  | { kind: 'voice_too_long' }
  | { kind: 'quota_exceeded' }

function mimeMatchesKind(kind: FileKind, mime: string): boolean {
  if (IMAGE_KINDS.has(kind)) return RASTER_MIMES.has(mime)
  if (kind === 'voice') return mime.startsWith('audio/')
  return true
}

/** What the re-encode produced: the bytes that will be stored, and the shape
 * they have once `.rotate()` and the downscale have both been applied. */
interface Reencoded {
  bytes: Buffer
  width: number
  height: number
}

/** sharp is imported lazily so constructing the app never loads a native
 * module it might not use; the import cost is paid by the first upload.
 *
 * The decompression-bomb guard here is sharp's default limitInputPixels,
 * about 0.268 gigapixels: a pixel-flood image throws inside this call, the
 * catch answers null, and the route refuses 422. That protection is a
 * library default rather than anything written below, so passing
 * limitInputPixels: false to this constructor would remove it with nothing
 * to notice (S14 security review F-7, RFC 0005 change control item 18). */
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
  // Scope before shape (10.2): every kind but avatar lives in a folder.
  if (input.kind === 'avatar') {
    if (input.folderId !== null) return { kind: 'kind_mime_mismatch' }
  } else {
    if (input.folderId === null) return { kind: 'folder_not_found' }
    if ((await accessOf(db, viewerId, input.folderId)) === null) {
      return { kind: 'folder_not_found' }
    }
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
    // The quota read locks the owner's row so two uploads racing the last
    // megabyte serialize, the folder-cap shape from P2 applied to bytes.
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
    // Inside the transaction window: a store failure throws and takes the
    // row with it.
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

export interface ServedFile {
  id: string
  name: string
  mime: string
  kind: FileKind
  bytes: Buffer
}

/**
 * 7.15's authenticated serving under 10.2: a folder-scoped file is its
 * members', and a file with no folder (an avatar) is readable by any
 * signed-in account, profile pictures being what member lists render.
 * There are no public URLs; the session got the caller this far.
 */
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
        LEFT JOIN folders fo ON fo.id = f.folder_id
        WHERE f.id = ${fileId}
          AND (
            f.folder_id IS NULL
            OR (fo.deleted_at IS NULL AND EXISTS (
              SELECT 1 FROM folder_members m
              WHERE m.folder_id = f.folder_id AND m.user_id = ${viewerId}))
          )`,
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

/** 7.15: uploader or folder owner deletes; everyone else meets not-found,
 * ownership being invisible to those without it (10.2). */
export async function deleteFile(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  fileId: string,
): Promise<'deleted' | 'not_found'> {
  const outcome = await inTransaction(db, async (tx) => {
    const removed = await rowsOf(
      tx,
      sql`DELETE FROM files f
          WHERE f.id = ${fileId}
            AND (
              f.owner_id = ${viewerId}
              OR EXISTS (SELECT 1 FROM folders fo
                          WHERE fo.id = f.folder_id
                            AND fo.owner_id = ${viewerId})
            )
          RETURNING f.id`,
    )
    return removed.length > 0 ? ('deleted' as const) : ('not_found' as const)
  })
  if (outcome === 'deleted') await store.remove(fileId)
  return outcome
}

/**
 * 7.15's avatar arm: store the picture as a files row of its own kind and
 * point users.avatar_url at the serving route. The previous avatar row goes
 * with the same act, one avatar being the shape of the feature and the
 * quota's reason.
 */
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
7.15's other avatar arm, added in the polish round of 2026-08-30 under the
owner's waiver of section 7's freeze: clear `users.avatar_url` and take the
stored picture with it.

**The file row goes rather than staying, and the choice is `setAvatar`'s own
reasoning read the other way.** That function already deletes the previous
avatar row and its bytes on every upload, "one avatar being the shape of the
feature and the quota's reason"; a Remove that left the row would keep an
account's quota (10.3's 1 GB) spent on a picture nothing points at and no
surface can ever show again, and would leave the bytes on a serving path that
still answers to anyone holding the URL. Neither is what the word Remove
promises. There is no history to preserve: an avatar is a current fact about a
person and not a record of one, which is what separates it from a comment's
attachment, where 4.16 hangs the file on something that was said.

**Idempotent, and it answers 204 either way**, per 7.15's own removal shape
and 10.2's discipline that a person's second press of a control they have
already used is not an error. A viewer whose picture came from Google at
sign-in has a column and no row of their own; clearing the column is still the
whole of what Remove means there, and the loop below simply removes nothing.
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
