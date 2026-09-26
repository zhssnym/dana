/*
The domain module for files per 4.16 and 7.15. The table is the
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
mime it is, and one that can is bounded to 2048px
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
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { ObjectStore } from '../files/store.js'
import { SWEEP_BATCH, inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import type { SecurityLogger } from '../security/log.js'
import { mayPerform } from './folder-access.js'
import { accessOf } from './folders.js'
import {
  AUDIO_MIMES,
  FOLDERLESS_UPLOAD_KINDS,
  MAX_FILE_BYTES,
  RASTER_MIMES as RASTER_MIME_LIST,
  VIDEO_MIMES,
} from '../../shared/files.js'
import type { FileKind } from '../../shared/files.js'

/** 4.16's vocabulary lives in `shared/files.ts` since #220, because the
 * browser needs it too; this re-export keeps every existing importer of
 * `domain/files.js` working. */
export type { FileKind }

export { MAX_FILE_BYTES }
/** 10.3: a voice note up to 10 minutes. */
export const MAX_VOICE_MS = 10 * 60 * 1000
/** 10.3 (D5): 1 GB per account across every kind. */
export const QUOTA_BYTES = 1024 * 1024 * 1024
/** 7.15: the longest edge an image keeps. */
const MAX_IMAGE_EDGE = 2048

const IMAGE_KINDS: ReadonlySet<FileKind> = new Set(['image', 'cover', 'avatar'])

/*
The kinds a caller may store with no `folder_id` at all, which is migration
0015's `files_folderless_kind_check` less the avatar — an avatar *refuses* a
folder rather than merely allowing none, and `setAvatar` is its only door.

**`image` joined `cover` on 2026-09-04 for issue #167.** A picture on a shelf
page is in the position a cover was before issues #20 and #100: a shelf is
private (4.18) and is not a folder, so an image block there has no folder to
take its visibility from, and `POST /files { kind: image }` answered 422 for
the one page kind that most needed it. The picture belongs to the uploader
instead, readable under `readableFileScope`'s folder-less owner arm below and
nameable by a block only where `putPage`'s shelf-homed clause admits it
(issue #107).

**`file`, `audio` and `video` joined them on 2026-09-20 for issue #220, and
`voice` is now the only kind still requiring a folder.** The sentence above is
what changed: a composer File, Audio or Video block is in exactly the position
the shelf page's image was, and the private Shelf composer #220 names is the
case it has to serve. `voice` stays out because a recorded voice note hangs on
a comment thread and a thread lives in a folder, which is still true of every
page kind there is.

**A folder-less row of any of these kinds is its owner's alone**, and the
predicate below needed no widening to make that so — it names `avatar` and
falls through to ownership for everything else, which is the property issue
#167 already relied on. Nothing else may read one: not another member, not a
signed-in stranger, and no page they can open, because a page block may only
name a file its own home can reach.
*/
const FOLDERLESS_KINDS: ReadonlySet<FileKind> = new Set(FOLDERLESS_UPLOAD_KINDS)

/** Raster formats only for the image kinds: SVG decodes like an image and serves like a document, and a
 * document with scripts on the application's own origin is a session
 * walking out the door. */
const RASTER_MIMES: ReadonlySet<string> = new Set(RASTER_MIME_LIST)

/*
#220's two media allowlists, and the container check behind them.

**They fail closed, and that is the intended behaviour rather than a compromise.**
#220's R1 forbids introducing FFmpeg or any media-probing subsystem in M1 and says
what to do instead: keep the allowlist narrow, fail closed, and leave the
generic File path available. So a payload that is not one of these container
types is refused *as `audio` or `video`* and may be uploaded as a generic
`file` instead, where it is served as an attachment and offered for download
rather than dressed as something the browser can play.

**The declared MIME is checked and then not believed.** A browser's label is a
guess taken from the filename in the first place, which is exactly what #220
says must never be security truth. `looksLikeMedia` reads the first bytes of
the payload for the container signature the declared type implies, which is
the practical validation the issue asks for where one exists — it costs one
buffer read, it needs no dependency, and it is the same discipline the image
path already applies by decoding through sharp. It is **container validation
and not codec validation**: nothing here can tell a playable H.264 stream from
an unplayable one, and proving that would need the subsystem R1 forbids.

**What it proves, exactly.** `containerOf` reads the leading bytes and refuses
a payload whose leading bytes match no allowlisted container. That stops the
honest mistake — the wrong file picked, the label a browser guessed from an
extension — and it stops the lazy attempt, which is worth having and is the
whole of what it is worth. **It does not prove anything about the rest of the
payload**, and the sentence here used to claim it did: that a caller could not
hand this path an executable, a zip or an HTML document by writing
`audio/mpeg` on it. They can. Anything at all may follow a real signature, and
one case needs no prefix even in principle — a UTF-16LE byte-order mark is
`FF FE`, which is a legal MPEG-1 Layer I frame sync and is exactly what the
last arm of `containerOf` looks for, so a UTF-16LE HTML document *is* an
allowlisted container as far as this check can tell. Reading further than the
leading bytes is the subsystem R1 rules out, so this is the intended shape of
the check rather than a hole to be closed.

**What stops those bytes being rendered is the response, and it is worth
naming here because it is not in this file.** Three things, none of them this
check: `X-Content-Type-Options: nosniff`, so the browser never looks past the
declared type at the bytes; a `Content-Type` that is the allowlisted audio or
video type the caller declared, which no browser renders as markup; and 10.8's
policy, set on every response including this one — `default-src 'self'`,
`object-src 'none'`, and a `script-src` of `'self'` and one hash with no
`unsafe-inline` in it. The two halves of this paragraph move together or not
at all.
*/
const MEDIA_MIMES: Readonly<Record<'audio' | 'video', ReadonlySet<string>>> = {
  audio: new Set(AUDIO_MIMES),
  video: new Set(VIDEO_MIMES),
}

/** The container signatures, by the leading bytes they put on the wire. Each
 * is a fact about the file format rather than about any codec inside it. */
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
  /* A bare MPEG audio frame: eleven set sync bits, which is also every ADTS
     AAC frame. Last, so a tagged file is recognised by its tag first. */
  if (
    bytes.length >= 2 &&
    bytes[0] === 0xff &&
    ((bytes[1] ?? 0) & 0xe0) === 0xe0
  ) {
    return 'mpeg-frame'
  }
  return null
}

/** Which containers each allowlisted MIME may actually arrive in. A type
 * whose bytes say something else is refused, whatever the label claims. */
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
  /** #220: the declared MIME is on the `audio` or `video` allowlist and the
   *  bytes are not that container. The generic `file` path is still open. */
  | { kind: 'not_supported_media' }
  | { kind: 'too_large' }
  | { kind: 'voice_too_long' }
  | { kind: 'quota_exceeded' }
  /** The folder is visible to the actor and the upload is not theirs to make
   * (issue #228). */
  | { kind: 'forbidden'; reason: string }

/*
**`file` is the only kind that accepts anything**, and it accepts anything on
purpose: #220 R1 rules that a generic file may carry essentially any extension
or none, that it is untrusted bytes, that Dana never executes it, and that it
is always served `Content-Disposition: attachment` with nosniff. The safety of
that path is in how it is *served*, not in what it is allowed to be, which is
why no list here is doing any work for it.

`voice` keeps `audio/*` rather than the new allowlist, deliberately. It is the
recorded voice note of 7.14, its bytes come from the browser's own recorder
rather than from a file picker, and narrowing it would refuse recordings that
work today for a reason #220 never asked for. `voice` is untouched by this
issue and must stay untouched.
*/
function mimeMatchesKind(kind: FileKind, mime: string): boolean {
  if (IMAGE_KINDS.has(kind)) return RASTER_MIMES.has(mime)
  if (kind === 'voice') return mime.startsWith('audio/')
  if (kind === 'audio' || kind === 'video') return MEDIA_MIMES[kind].has(mime)
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
 * to notice. */
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
  /* Scope before shape (10.2), and which kinds may stand outside a folder is
     migration 0015's files_folderless_kind_check, restated here so the
     refusal is a sentence rather than a constraint violation.

     **A cover or a page image may have a folder or no folder, and that is
     the whole of issue #20's backend and of issue #167's.** A `file` and a
     `voice` note hang on a comment thread that lives in a folder and take
     that folder's visibility. A picture decorates a page, and the kinds of
     page are not all folders: a folder's cover and a folder page's image are
     shared with its members and must be folder-scoped so they can read them
     (4.3, "one look for every member"), while a shelf is private (4.18) and a
     place cover is per viewer (4.20), so theirs belong to the person. The
     rule is therefore *a picture's scope matches its page's scope*, and the
     caller chooses it by sending a folder_id or not. An avatar continues to
     refuse one. */
  if (input.kind === 'avatar') {
    if (input.folderId !== null) return { kind: 'kind_mime_mismatch' }
  } else if (input.folderId === null) {
    if (!FOLDERLESS_KINDS.has(input.kind)) return { kind: 'folder_not_found' }
  } else {
    const facts = await accessOf(db, viewerId, input.folderId)
    if (facts === null) return { kind: 'folder_not_found' }
    /*
    #228 splits folder-scoped uploads by *what the file supports*,
    not by who is uploading it, and the two bars are different. A `file` or a
    `voice` note hangs on a comment thread, so it takes commenting's bar; a
    `cover` or an `image` decorates the Folder's page, so it takes ordinary
    shared Work's.

    **#228 wrote "those four kinds are the whole of what can arrive here with
    a folder" and migration 0024 (#220) made that six**, which is recorded
    here rather than quietly corrected because the two halves landed on
    different branches and only their merge can see it. `audio` and `video`
    join `cover` and `image` on the page bar: they are composer assets that
    decorate a page, which is the sentence above applied and not extended.
    The `else` is still total over `FileKind` minus `avatar`, so the two
    actions remain exhaustive.

    **`file` keeps the commenting bar, and that is decided rather than
    inherited (#220 with #228).** Before 0024 a `file` could only hang on a
    comment thread, so commenting's bar *was* what it supports; #220 makes it
    a composer block kind too, and the question the merge raised is whether a
    folder-scoped `file` should therefore have been promoted to the page bar.
    It should not, for a reason about what this function can see.

    **This route cannot know what the bytes are for.** An upload names a kind
    and a folder and nothing about its destination: the same `file` upload is
    a comment attachment or a composer File block depending on what the caller
    does next, and nothing in `UploadInput` distinguishes them. So the bar here
    has to be the *floor* over the destinations the kind admits, and a `file`
    is always uploadable as a comment attachment. `file.upload.comment` is
    that floor (`can_comment`, shared/folder-actions.ts); `file.upload.page` is
    `can_edit`. Asking the higher one would refuse every commenter attaching a
    file to a comment, which is a right #228 grants them outright, in order to
    pre-empt a page write they may never attempt.

    **Nothing is weakened by the floor, because placing a file on a page is
    gated where that write happens rather than here.** Both page-write paths
    ask for `can_edit` before a block is stored: `actOnFolderPage` asks
    `folder.section.manage` (domain/pages.ts, reached through the route's own
    gate in routes/workshop.ts) and the whole-page `PUT` asks
    `folder.page.edit` (`putPage`). Both sit at `can_edit` in the same table
    that puts `file.upload.comment` at `can_comment`, so a commenter who
    uploads a `file` and then tries to insert it is refused at the
    transaction, with no block written. What they are left holding is a
    folder-scoped `files` row, which is listed in its folder and deletable by
    its members exactly as any other folder-scoped attachment is — the reclaim
    sweep does not and must not take it, `folder_id IS NULL` being one of the
    two clauses that decide what is sweepable.

    This is the upload half of undoing "uploader authorship is standing
    authority". The delete half is in `deleteFile` below.
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

  /* #220's practical validation for the two previewable media kinds, after
     the size cap so a 25 MB payload is refused on its size first. The bytes
     must be the container their declared type implies; a lying label is
     refused here rather than served to an `<audio>` element that will show a
     broken player. The refusal is its own outcome so the route can say that
     the generic File path is still available, which R1 requires it to be. */
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
    // The quota read locks the owner's row so two uploads racing the last
    // megabyte serialize, the folder-cap shape applied to bytes.
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

/*
Who may read one stored file, as one SQL predicate over a `files` row aliased
`f`.

**It is a function rather than three copies because the three copies had
already drifted.** `serveFile` below decides what bytes go over the wire;
`putPlaceCover` (7.19) and now `patchShelf` (7.16) decide which file id a
person may point a cover at, and a cover pointing at a file its owner cannot
read is a broken picture the server promised. `domain/covers.ts` used to carry
its own transcription of this, with a comment saying it was "restated as a
scope rather than re-derived" — which is the drift risk named and then taken.
One definition, imported.

**The folder-less arm is narrower than it was before issues #20 and #100, and
the narrowing is the load-bearing half of this change.** It used to read
`f.folder_id IS NULL` and stop, on the reasoning that the only folder-less
rows were avatars and "profile pictures are what member lists render". That
was true while `createFile` refused a folder-less anything else. The moment a
person can upload a cover of their own with no folder, the same clause hands
every signed-in account read access to every personal cover picture in Dana
for the cost of guessing a uuid, which is not what "pictures belong to the
user" means.

So: a folder-scoped file is its members', unchanged; an **avatar** with no
folder stays readable by any signed-in account, because a member list renders
other people's pictures and that behaviour is 7.15's; every other folder-less
file is its owner's alone.

**Issue #167 widened which kinds may be folder-less and this predicate needed
no widening at all**, which is worth saying because the obvious reading of the
arm above is that it names kinds. It does not: it names `avatar` and then
falls through to ownership for everything else, so a folder-less `image`
became its uploader's alone the moment `createFile` began storing one, on the
same clause that already held a folder-less `cover`. A predicate written as
`kind = 'cover' OR ...` would have had to be found and changed here, and a
change missed there would have been a disclosure rather than a refusal.

The predicate is deliberately self-contained — a correlated EXISTS rather than
a join — so a caller needs nothing in its FROM clause but `files f`.
*/
export function readableFileScope(viewerId: string): SQL {
  return sql`(
    (f.folder_id IS NULL AND (f.kind = 'avatar' OR f.owner_id = ${viewerId}))
    OR EXISTS (
      SELECT 1 FROM folders fo
      JOIN folder_members m ON m.folder_id = fo.id
      WHERE fo.id = f.folder_id
        AND fo.deleted_at IS NULL
        AND m.user_id = ${viewerId})
  )`
}

export interface ServedFile {
  id: string
  name: string
  mime: string
  kind: FileKind
  bytes: Buffer
}

/**
 * 7.15's authenticated serving under 10.2, the scope being
 * `readableFileScope` above and nothing else. There are no public URLs; the
 * session got the caller this far.
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
7.15: uploader or folder owner deletes. **Everyone else meets one of two
answers and not one, corrected 2026-09-04 under issue #74.**

This function used to answer `not_found` for every caller the DELETE did not
match, under a comment saying "ownership being invisible to those without it
(10.2)". That reading was right about half its callers and wrong about the
other half, and 10.2 draws the line the other way: *inaccessible* resources
answer 404 to avoid an existence leak, and *permitted-visibility but
forbidden-action* answers 403. A member of the folder who did not upload the
file can read the same bytes at 200 through `serveFile` a few lines up, so
there is nothing left to leak — they have already been told the file exists,
by being handed it. AC-397's authorization sweep holds this. `deleteComment` in `domain/comments.ts` is the same shape and has always
answered 403.

So the fault was never the rule, which is 7.15's and unchanged: the same
people delete the same files as before, and no caller who was refused is now
admitted. What moved is which refusal they hear, and it moved toward 10.2's
own grammar rather than away from it.

**The readability check runs only when the delete removed nothing**, so the
ordinary path costs exactly the one statement it always did. It is
`readableFileScope`, the predicate `serveFile` uses, imported rather than
restated for the reason `domain/covers.ts` records at length: a second copy of
this scope diverged once already and admitted a file it should not have.
Asking the same predicate is what makes "readable" here mean what it means
there, and a 403 that disagreed with the GET beside it would be a worse defect
than the 404 this replaces.

Both reads sit inside the one transaction, so a file deleted by somebody else
between the two statements answers `not_found` rather than a 403 about a row
that no longer exists.
*/
export async function deleteFile(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  fileId: string,
): Promise<DeleteFileResult> {
  const outcome = await inTransaction(db, async (tx) => {
    /* Issue #267: the blocks this file is about to be taken from, read before
       the delete because `page_blocks_file_id_fkey`'s SET NULL erases the
       only link. The file row is locked first so no block can come to name it
       between this read and the delete (an inserting FK check needs a KEY
       SHARE lock that FOR UPDATE refuses). They are marked only if the delete
       below actually removes the row. */
    await tx.execute(sql`SELECT id FROM files WHERE id = ${fileId} FOR UPDATE`)
    const wearers = await blocksNamingFiles(tx, sql`${fileId}::uuid`)
    /*
    **The rule changed here, and it is the sharpest edge of #228's
    authorship rule.**

    It was "the uploader or the folder owner". The uploader half is exactly
    what the accepted cross-cutting rule forbids -- a member reduced to Can
    view kept permanent delete authority over every file they had ever put in
    the Folder, which is authorship surviving a downgrade as hidden mutation
    power. The owner half is the ownership-as-authority proxy #209 removes
    everywhere else.

    Both are replaced by one question: does the actor hold Full control of the
    Folder this file lives in? #228's Full-control list puts direct
    permanent deletion of a Folder-scoped file there, beside the other
    irreversible acts.

    A **folderless** file has no Folder Access to resolve -- an avatar, a
    shelf's picture, a place cover -- and stays the owner's alone, which no
    accepted record touches and which the statement's own `folder_id IS
    NULL` branch expresses. That is not a hole: those rows are personal by
    construction and no Folder's members can read them.
    */
    const removed = await rowsOf(
      tx,
      sql`DELETE FROM files f
          WHERE f.id = ${fileId}
            AND (
              (f.folder_id IS NULL AND f.owner_id = ${viewerId})
              OR EXISTS (SELECT 1 FROM folder_members m
                          JOIN folders fo ON fo.id = m.folder_id
                          WHERE m.folder_id = f.folder_id
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
Issue #267: what a media block remembers when the server takes its file.

`page_blocks_file_id_fkey` is ON DELETE SET NULL, so a deleted file leaves
every block that named it with a null `file_id` — and an image block with a
null `file_id` is also what a freshly inserted, never-filled picture saves as.
Stored data could not tell "not chosen yet" from "was chosen and is gone", and
only the first is safe to fill in by clicking. `page_blocks.file_reclaimed_at`
(migration 0033) is the difference, stamped by every server path that deletes
a file a block may still name: `deleteFile` above and account deletion's step
6a. The 7.19 sweep and the Trash purge's comment-file victims never delete a
referenced file (`fileIsUnreferenced()`), so they need no mark.

Two halves because the mark must be taken before the delete — afterwards the
SET NULL has erased the link — but written only once the delete succeeded.
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

/*
========================================================================
A cover file's lifetime (issues #116 and #128, 2026-09-04, spec 7.19)
========================================================================

Dana had no story for how long a cover file lives. Two halves of one gap,
both recorded on #116 and both closed here.

**Copy at set-time**, below. A page's cover used to be whatever file id the
caller named, which could be a picture living in somebody else's folder. When
the wearer later left that folder, `readableFileScope` correctly refused them
and the cover drew as the flat fallback with nothing said and no row cleaned
up. So a set now normalises the file's scope to the page's: if the named file
is not already a `cover` in the page's own scope owned by the person setting
it, the server copies it — a new row and new bytes — and the page stores the
copy. After that a page's cover is a file its own owner holds outright, and
leaving a folder cannot blank it.

**Reclaim when nothing references it**, further below. A folder-less cover is
listed by no surface and reachable by no route, so a replaced one used to
spend its owner's 1 GB (10.3) forever with nothing able to delete it. It is
now swept by the 11.7 tick once nothing references it.

**Why the sweep is deferred rather than done at the moment of replacement,
which was the obvious design and is wrong.** A file this server has stopped
referencing is still a file the *caller* is holding the id of: setting a
shelf's cover to a picture, replacing it with a gradient, and setting the same
picture back is an ordinary thing for a picker to do and would answer
422 against a row deleted the instant the gradient landed. So reclamation is
about a file nothing has referenced *for a while*, and 30 days is the line
Dana already draws everywhere it destroys something (7.13's Trash, 8.8's
purge). **A cover is reclaimed thirty days after it stopped being worn, and a
cover worn again inside that window is kept.**

**That sentence was `created_at` until it was reviewed, and the difference is
the whole reason 0014 exists.** Aging from the upload measures when the bytes
arrived, not when the last reference went: a cover uploaded in June and worn
until this morning is, the instant it is replaced, both unreferenced and four
months old, so the next tick took it with no window at all — which is exactly
the case the window was traded for. `files.unreferenced_since`
(migration 0014) records the moment instead, and the tick writes it, clears it
and reads it.

**Legacy rows are not backfilled and need no special case.** A cover set
before tonight may name a folder's file or a file two pages share; neither is
touched, because the sweep takes only folder-less pictures — `cover` and, since
issue #167, `image` — that nothing references, and each of those legacy rows is
one or the other.
*/

/** 7.13 and 8.8's line, one object over: nothing is destroyed sooner. */
export const COVER_RECLAIM_DAYS = 30

export type CoverFileResult =
  /** The named file already sits in the page's scope: no copy, no bytes. */
  | { kind: 'kept'; id: string }
  /** A copy was made. `id` is the new row, and its bytes are already in the
   * store, so a caller whose transaction then fails must remove them. */
  | { kind: 'copied'; id: string }
  /** The source row exists and its bytes do not, so there is nothing to
   * copy. The caller decides what that means for its own act. */
  | { kind: 'bytes_missing' }
  /** 10.3's 1 GB, refused exactly as an upload is: 413, never 422. */
  | { kind: 'quota_exceeded' }

/**
 * The two acts that put a file behind a cover, over one copy primitive.
 *
 * **`coverFileFor` normalises and `copyCoverFile` duplicates**, and they are
 * two functions rather than a flag because they answer two different
 * questions. A *set* asks "may this page point at this row as it stands?",
 * and the answer is yes when the row is already a `cover` in the page's own
 * scope owned by the person setting it — that file is theirs outright and
 * copying it would buy nothing, and one folder-less
 * picture of a person's own may dress a shelf and a place page at once, both
 * reading back the same id. A *duplicate* asks for a second, independent
 * picture and must never answer with the first: #117 requires
 * that "changing or removing the cover on either shelf must not change the
 * other", and two shelves on one `cover_file_id` are blanked together by
 * 0003's SET NULL the moment that file is deleted.
 *
 * **The caller has already decided the file may be worn.** Neither takes a
 * view on readability or kind — `readableFileScope` and the
 * `kind IN ('cover','image')` clause are the gates, and they run first.
 *
 * **`scopeFolderId` is the page's scope, not the file's**, and it is what
 * lets one primitive serve every page kind. A shelf and a place page are
 * their person's, so they pass null and get a folder-less copy; a folder's
 * cover is one look for every member (4.3, D1), so a folder passes its own
 * id and gets a copy inside itself, which is the only scope its members can
 * read. The rule 4.16 states — a cover file's scope matches its page's — is
 * therefore produced by the copy rather than merely hoped for.
 *
 * **The bytes are written inside the caller's transaction**, after the row,
 * which is `createFile`'s own order and for its reason: a store failure
 * throws and takes the row with it, where the opposite order leaves a row
 * with no bytes that serving would have to explain forever. What that order
 * does leave is the reverse orphan — bytes whose row rolled back later in
 * the caller's transaction — and every caller answers it by removing the
 * object it was told about when its transaction throws.
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

/** The duplicate's arm: a second picture, always, whatever the source's
 * scope. Never answers `kept`. */
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
#220's generalisation, and the trap it closes is named in the issue.

Folder duplication and workflow import both wanted "a second, independent copy
of the bytes behind this page block". Neither had one. What they had was
`copyCoverFile`, which writes `kind = 'cover'` whatever the source was, so each
call site followed it with `UPDATE files SET kind = 'image'` to put the copy
back where a page block could use it. That was true while a page block could
only hold a picture. The moment a block may be a File, an Audio or a Video, the
same two statements **destroy the thing #220 exists to preserve**: an MP4
duplicated into a new folder would come out declared an image, a generic File —
untrusted bytes, attachment-served — would come out declared previewable media,
and the insertion mode the person chose would be gone with no way to recover it.

So this is the primitive those two call sites needed all along: copy the bytes,
**and keep the source's own semantic kind and metadata**. It answers with the
kind it wrote, so a caller never has to guess. Nothing is rewritten afterwards
and no caller may rewrite it.

`duration_ms` rides across only for `voice`, the one kind allowed to carry it
(`files_duration_voice_check`); width and height ride only for the kinds
allowed to carry them (`files_dimensions_kind_check`), and the bytes are the
same bytes sharp already reported on, so nothing is re-measured. No audio or
video duration is persisted at all, per #220's R1: browser playback
discovers it at runtime and M1 adds no probing subsystem to write it down.
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

/*
Issue #221's move seam: a Task's files follow the Task.

A file is scoped to one Folder (`files.folder_id`): its members read it
(`readableFileScope`) and the Folder's purge cascades it
(`files_folder_id_fkey`), which SET NULLs every block still naming it. A Task
moved to another Folder takes its document and its comments with it, so the
files they name must go too, or the new Folder's members cannot open them and
the old Folder's purge takes them from under the Task.

Per file named by this Task's document blocks or its comments' attachments,
and scoped to the Folder being left:

- named by nothing else: re-scoped in place (`folder_id` updated). No bytes
  move, no quota is spent, and the id every block holds stays true;
- also named by something that stays (the old page, a recurrence predecessor
  whose document was copied with the same file ids, a cover): the Task's
  references are pointed at an independent copy in the new Folder
  (`copyPageFile`, the duplicate's primitive), charged to the mover like any
  copy, and the original stays where its other readers are. A source whose
  bytes are gone is left as it is; there is nothing to carry.

Called inside the move's transaction, after its refusals and before its
writes. `copied` collects each object written so the caller can remove them
if the transaction does not commit.
*/
export async function carryTaskFilesOnMove(
  tx: Executor,
  store: ObjectStore | undefined,
  viewerId: string,
  taskId: string,
  fromFolderId: string,
  toFolderId: string,
  copied: string[],
): Promise<'carried' | 'quota_exceeded'> {
  /* M5: a task's conversation is its Discussions (`discussions.task_id`),
     which move with it. */
  const taskComments = sql`SELECT c.id FROM comments c
    JOIN discussions d ON d.id = c.discussion_id
    WHERE d.task_id = ${taskId}::uuid`
  const named = await rowsOf(
    tx,
    sql`SELECT f.id FROM files f
         WHERE f.folder_id = ${fromFolderId}::uuid
           AND (f.id IN (SELECT file_id FROM page_blocks WHERE task_id = ${taskId}::uuid)
                OR f.id IN (SELECT file_id FROM comment_files
                             WHERE comment_id IN (${taskComments})))
         ORDER BY f.id
         FOR UPDATE`,
  )
  for (const row of named) {
    const fileId = String(row.id)
    const elsewhere = await rowsOf(
      tx,
      sql`SELECT (
            EXISTS (SELECT 1 FROM page_blocks b
                     WHERE b.file_id = ${fileId}::uuid
                       AND b.task_id IS DISTINCT FROM ${taskId}::uuid)
            OR EXISTS (SELECT 1 FROM comment_files cf
                        WHERE cf.file_id = ${fileId}::uuid
                          AND cf.comment_id NOT IN (${taskComments}))
            OR EXISTS (SELECT 1 FROM folders fo WHERE fo.cover_file_id = ${fileId}::uuid)
            OR EXISTS (SELECT 1 FROM shelves s WHERE s.cover_file_id = ${fileId}::uuid)
            OR EXISTS (SELECT 1 FROM user_page_covers u WHERE u.file_id = ${fileId}::uuid)
          ) AS shared`,
    )
    if (elsewhere[0]?.shared !== true) {
      await tx.execute(
        sql`UPDATE files SET folder_id = ${toFolderId}::uuid WHERE id = ${fileId}::uuid`,
      )
      continue
    }
    if (store === undefined) {
      throw new Error('The application was constructed without an object store.')
    }
    const held = await copyPageFile(tx, store, viewerId, fileId, toFolderId)
    if (held.kind === 'quota_exceeded') return 'quota_exceeded'
    if (held.kind !== 'copied') continue
    copied.push(held.id)
    await tx.execute(
      sql`UPDATE page_blocks SET file_id = ${held.id}::uuid
           WHERE task_id = ${taskId}::uuid AND file_id = ${fileId}::uuid`,
    )
    await tx.execute(
      sql`UPDATE comment_files SET file_id = ${held.id}::uuid
           WHERE file_id = ${fileId}::uuid AND comment_id IN (${taskComments})`,
    )
  }
  return 'carried'
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

  /* The quota read locks the owner's row, `createFile`'s shape: a copy
     spends the setter's gigabyte exactly as an upload does, and two acts
     racing the last megabyte serialize rather than both passing. */
  await tx.execute(sql`SELECT 1 FROM users WHERE id = ${viewerId} FOR UPDATE`)
  const used = await rowsOf(
    tx,
    sql`SELECT coalesce(sum(bytes), 0)::bigint AS used
        FROM files WHERE owner_id = ${viewerId}`,
  )
  if (Number(used[0]?.used ?? 0) + bytes.byteLength > QUOTA_BYTES) {
    return { kind: 'quota_exceeded' }
  }

  /* `kind` is the caller's, and there are exactly two callers of that choice.
     A cover copy is a `cover` whatever the source was, because an `image` on a
     folder page may be named as a cover (7.16's pair) and the copy must be
     recognisable to the reclaim sweep below. A page copy keeps the source's
     kind, because that kind *is* the insertion mode the person chose (#220).
     The dimensions and a voice note's duration ride across rather than being
     re-measured — the bytes are the same bytes (4.16, migrations 0003 and
     0009) — and each is written only where its own CHECK admits it, so a copy
     that lands as a different kind cannot carry a column that kind forbids. */
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
  /* **The write cleans up after itself, and the caller cleans up after the
     rest of its transaction.** A `put` that fails may still have written —
     a disk that filled on fsync, an object store that timed out after
     committing — and the row it belongs to is about to roll back, so the
     bytes would be an orphan nothing indexes. The caller's own catch cannot
     reach this one: it removes what it was *told* about, and a throw from
     here returns no id to tell it. #128 asks for no unattached copied file
     and this is the half of that sentence which is not free. */
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
Every column in the schema that can name a file, as one predicate over a
`files` row aliased `f`. Five foreign keys reference `files(id)` — 0003's
`comment_files`, `shelves.cover_file_id`, `page_blocks.file_id` and
`folders.cover_file_id`, and 0005's `user_page_covers.file_id` — and this is
all five. `users.avatar_url` is a URL rather than a key and needs no clause:
the sweep takes folder-less `cover`, `image`, `file`, `audio` and `video` rows
— the last three added for issue #220 on 2026-09-20 — and an avatar is none of
them. **That sentence is load-bearing and not an aside.** This predicate is
true of every avatar row that exists, and an avatar is folder-less by force
(`createFile` refuses one that names a folder), so the `kind` clause below is
the whole of what stands between the 11.7 tick and every profile picture in
Dana — which is why #220 widened that clause by naming three more kinds and not
by restating it as everything-but.
`guard-reclaim-reference-arms.test.ts` cannot see that — it reads
`pg_constraint`, and a reference held as text is not there — so read this
before touching the two clauses that decide what is sweepable.

**It is a query and not a counter column**, which is why no migration comes
with this work. A counter is a second record of a fact the foreign keys
already hold, and the two are free to disagree; `destroyTasks` in
`domain/trash.ts` reached the same conclusion over the same five columns, and
its list is the one this generalises.
*/
function fileIsUnreferenced(): SQL {
  return sql`(
    NOT EXISTS (SELECT 1 FROM comment_files cf WHERE cf.file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM page_blocks b WHERE b.file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM folders fo WHERE fo.cover_file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM shelves s WHERE s.cover_file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM user_page_covers u WHERE u.file_id = f.id)
  )`
}

/*
The kinds the 11.7 reclaim sweep may touch, in one place because all three of
its arms must agree (issue #276's rebase onto #220, 2026-09-21).

**This list was written out three times and the three did not agree, which is
the defect this constant exists to make impossible.** #220 widened the mark
and the delete from `('cover', 'image')` to these five; #276, written against
the tree before it, gave the clear arm a `kind` clause of the two. Git merged
both cleanly — neither touched the other's line — and the result marked five
kinds and cleared two. What that costs is not a file taken while referenced,
which the delete arm's own `fileIsUnreferenced()` still refuses on its own;
it is the **clock**. A `file`, `audio` or `video` that is referenced again
after being marked would keep the stale mark for ever, so the thirty days
would be counted from the first time it went unreferenced rather than from
the last, and the pass after it next came off a block would delete it on the
same tick with no window at all. The window is the whole of what 7.19 and
migration 0014 bought, and a two-kind clear arm silently withdraws it from
three of the five kinds.

Widen this list by naming kinds and never by restating it as a `NOT IN`: an
avatar's absence from it is the only thing standing between the tick and every
profile picture in Dana, and `voice` is absent structurally, being the one kind
that still requires a folder (migration 0024) and so unable to satisfy the
`folder_id IS NULL` beside it.

**It is its own list rather than `FOLDERLESS_UPLOAD_KINDS`**, which #220 left
in `shared/files.ts` holding these same five today. That one answers what an
upload may send with no folder, and it omits the avatar because the avatar has
a route of its own rather than because a timer must never eat one. Two
different questions that agree by coincidence, and the day the upload one
widens — an avatar moving onto `POST /files` would do it — importing it here
would hand the sweep every profile picture in Dana with nothing to review.
*/
const RECLAIMABLE_KINDS = [
  'cover',
  'image',
  'file',
  'audio',
  'video',
] as const satisfies readonly FileKind[]

/** `RECLAIMABLE_KINDS` as a predicate over a `files` row aliased `f`, bound
 * as parameters rather than interpolated, for the three arms of the sweep. */
function kindIsReclaimable(): SQL {
  return sql`f.kind IN (${sql.join(
    RECLAIMABLE_KINDS.map((kind) => sql`${kind}`),
    sql`, `,
  )})`
}

/**
 * The 11.7 tick's fifth duty: reclaim the folder-less pictures nothing uses.
 *
 * **It took `cover` rows alone until 2026-09-04 and takes folder-less `image`
 * rows on the same rule since issue #167**, which widened `createFile` to
 * store one. The reason is the reason the clause below gives for excluding a
 * page image in the first place, read against the row that now exists: a page
 * image *in a folder* is listed by that folder's surfaces and its members can
 * delete it, so it is somebody's to manage; a folder-less one is a shelf
 * page's picture, listed by nothing and reachable by no route once the block
 * that named it is gone, which is exactly the state this duty exists for. So
 * the same reference query, the same mark and the same window: an image
 * dropped from a shelf page is reclaimed thirty days after it came off, and
 * one put back inside the window loses its mark and starts over. **`file`,
 * `audio` and `video` joined it on 2026-09-20 for issue #220**, on the same
 * sentence: they too may now be folder-less, and a folder-less one is reached
 * by nothing once its block is gone. `voice` still cannot reach this sweep at
 * all, `folder_id IS NULL` being impossible for it (migration 0024).
 *
 * **Three acts, and one statement rather than three.** Clear: a marked row
 * that something references again loses its mark, which is what makes a
 * picker putting a picture back inside the window safe rather than merely
 * lucky. Mark: a folder-less `cover` that nothing references and carries no
 * mark gets `unreferenced_since = now()`. Delete: a row marked more than 30
 * days ago goes, row and object.
 *
 * They are data-modifying CTEs of one statement, which is `destroyFolders`'s
 * shape in `domain/trash.ts` and is chosen for its reason: one snapshot, one
 * wrapperless statement, and the pass keeps one transaction per tick. It is
 * also stronger than three statements sharing a
 * transaction would be, which at READ COMMITTED would still take three
 * snapshots.
 *
 * **The CTEs cannot see each other's work, and that is safe here rather than
 * merely tolerated.** Postgres runs every arm of a WITH against the same
 * snapshot, so the delete reads the marks as they were before the clear and
 * the mark ran. It takes nothing it should not: a row this statement marks
 * carries `now()` and is not thirty days old under any reading, and a row the
 * clear un-marks is by definition referenced, which the delete's own
 * unreferenced clause excludes on its own. The delete therefore never depends
 * on the other two having run first.
 *
 * Narrow on purpose, and every clause earns its place.
 * **`RECLAIMABLE_KINDS`**, which is
 * `('cover', 'image', 'file', 'audio', 'video')` — widened from the
 * first two on 2026-09-20 for issue #220 and on the clause's own reasoning
 * rather than past it, and hoisted to that one constant on 2026-09-21 when
 * #276's rebase proved three hand-written copies could disagree. A voice
 * note is still absent, and now for a structural
 * reason rather than a judged one: `voice` is the only kind that still
 * requires a folder (migration 0024), so no `voice` row can satisfy the
 * `folder_id IS NULL` beside this and naming it would be decoration. An
 * avatar is still absent too, and that exclusion stays judged and
 * load-bearing rather than structural — being wrong about it destroys every profile picture in the product, so this list is
 * widened by naming kinds and never by restating it as a `NOT IN`. What
 * changed is that a composer File, Audio or Video may now be folder-less, and
 * a folder-less one is in exactly the position the folder-less page image was
 * in at issue #167: listed by no surface, reachable by no route once the block
 * that named it is gone, and otherwise spending its owner's gigabyte for ever
 * with nothing able to delete it. A folder-**scoped** attachment is still
 * untouched, because it is listed in its folder and its members can delete it
 * themselves. **`folder_id IS NULL`**,
 * because a folder-scoped file is listed in its folder and its members can
 * delete it themselves, and because a folder's own deletion already cascades
 * it away (8.8) with the purge removing its object. **And unreferenced**, by
 * every column that can name a file rather than by the cover columns alone,
 * so a legacy row two pages share, or a picture that is both a page block and
 * a cover, is neither marked nor taken while either reference lives.
 *
 * The delete repeats the unreferenced clause the clear arm also tests, and
 * that repetition is load-bearing twice over: it is what makes the shared
 * snapshot safe, above, and it is what stops a mark written a month ago —
 * evidence about a month ago — from being the only thing standing between a
 * worn picture and its deletion.
 *
 * The claim is `FOR UPDATE SKIP LOCKED` and every pass is idempotent, which
 * is what the other purge duties do and what keeps 11.7's missed-tick and
 * deploy-overlap properties true. The objects leave the store only after the
 * rows are gone, 7.15's order, so a refused delete cannot have destroyed
 * bytes whose rows survived.
 *
 * **The claim is capped at `SWEEP_BATCH`, and that arm alone (issue #276).**
 * This is the one duty that follows its statement with per-row work outside
 * the database — a serial, awaited `store.remove(id)` — so it is the one
 * that can make a 60-second tick arbitrarily long, and `interval.ts` answers
 * a long pass by *skipping* the next tick rather than queueing it. The cap
 * is on the delete arm and not on the clear or the mark, which do their work
 * inside one statement the planner bounds; the honest statement of what is
 * left is that the mark arm still scans `files` for want of an index on
 * `(kind, folder_id) WHERE unreferenced_since IS NULL`, which is a migration
 * and is not this change. Truncating a pass is safe because every pass is
 * idempotent: the rest waits one tick, having already waited thirty days.
 *
 * **The clear arm carries the kind clause too, since issue #276, and it is
 * the same list as the other two — `RECLAIMABLE_KINDS`, from one constant
 * rather than from three copies.** #276 was written against the tree before
 * #220 and gave this arm a clause of `('cover', 'image')`, which was true of
 * the mark arm then and false of it by the time the two met: the rebase of
 * 2026-09-21 merged both cleanly and left the sweep marking five kinds and
 * clearing two. **The cost of that is the window, not a wrongly taken file.**
 * The delete arm tests `fileIsUnreferenced()` itself, so a referenced row is
 * safe from it whatever mark it carries; what a narrow clear arm loses is the
 * thirty days. A `file`, `audio` or `video` referenced again after a mark
 * would keep that mark for ever, so the window would be counted from the
 * first time it went unreferenced rather than from the last, and the pass
 * after it next came off a block would take it on that same tick. That is the
 * whole of what migration 0014 and 7.19 bought, withdrawn from three kinds
 * by a clause that reads like a narrowing of what is scanned. The constant's
 * own comment carries the rest.
 *
 * **What it destroys, it says (issue #276).** One `file_reclaimed` line per
 * row, carrying the id, the owner, the kind, the bytes and the mark the
 * thirty days were counted from. Before #276 this path wrote nothing at all
 * on success: `pass.ts` put the count in its outcome and `interval.ts`
 * discarded it, so a person asking where their picture went had no count, no
 * id and no date to check — and two of the five reference arms cascade, so
 * the row that recorded the reference had gone with the file. **Which arm
 * last held it is not logged because nothing knows**: the mark is written by
 * the first pass that finds every arm false, and no column records which one
 * was true last. That would be a migration, and it is not this change.
 * **And no `events` row**, on the ground the sweep's own scope clause gives:
 * `events` are folder-scoped (4.13) and a reclaimable file is folder-less by
 * `folder_id IS NULL`, so the folder-event form has no home to be written
 * in.
 *
 * **No backfill, and the direction of that is the safe one.** Every existing
 * row has a null mark, so the first pass after 0014 deploys marks today's
 * orphans and reclaims nothing; they wait one window from the mark rather
 * than being taken on the strength of a date that never meant this.
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

  /* Every line before any object leaves, rather than one line per removal
     inside the loop below. The rows are already gone when this function
     resumes — the statement committed — so the window in which a crash
     destroys data and records nothing is exactly the length of this loop,
     and writing the whole record first closes it. Per-row interleaving would
     satisfy "before the object is removed" for each file and would still
     lose the record of every file after the one that killed the process. */
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
        // Unreachable bytes: the row that indexed them is already gone, so a
        // refused rm is nothing anybody can act on. `removeObjects` in
        // domain/trash.ts swallows it for the same reason.
      }
    }
  }
  return ids
}
