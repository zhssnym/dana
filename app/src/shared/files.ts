/*
The 7.15 upload surface's two answers: `POST /files` and `POST /me/avatar`.

**Why this file exists (#39).** Both shapes were written twice — once as a
`res.json` literal in `server/routes/files.ts` and once as a zod schema inside
`client/api/http.ts` — with nothing between them. That is the same fault the
trash view carried, on the one surface where it costs most: a file upload
whose response gains or loses a field breaks the parse in the client's own
transport layer, above every screen, and no test in the repository compares
the two literals.

Neither shape belongs in `me.ts`, avatar included. `me.ts` is 7.1 and 7.2, the
JSON `/me` surface; these two are 7.15's multipart one, answered by the same
route module, refused by the same quota, and served from the same store. The
path is what they share least.

**The client half is not done.** `api/http.ts` still declares its own two
schemas; these are asserted against the server instead. Swapping them is a
one-line change per call site, and is additive: these parse strictly what the
literals there parse today.
*/
import { z } from 'zod'

/**
 * `POST /files` → 201. The row's id and the bytes actually stored, which is
 * the downscaled length for an image and not what the caller sent, so a
 * client showing "uploaded N bytes" is showing the truth (`domain/files.ts`).
 */
export const postFilesResponse = z.object({
  id: z.uuid(),
  bytes: z.number().int(),
  /* 4.16's pair, and it is the stored shape rather than the sent one: 7.15
     downscales anything past 2048px, so this is what the store actually kept
     (#27). Null for every kind that carries no dimensions — a voice note, a
     document — which is also every row uploaded before the column existed,
     because no backfill has been run. A reader must treat null as unknown. */
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
})
export type PostFilesResponse = z.infer<typeof postFilesResponse>

/**
 * `POST /me/avatar` → 200. A serving **path** under this origin and never an
 * absolute URL: the route answers `/api/v1/files/:id`, and 4.1's `avatar_url`
 * column holds the same. `z.url()` would refuse the value the server sends,
 * which is why this is a plain string and must stay one.
 */
export const postAvatarResponse = z.object({
  avatar_url: z.string(),
})
export type PostAvatarResponse = z.infer<typeof postAvatarResponse>

/*
========================================================================
#220's file vocabulary: the kinds, and the MIME allowlists behind them
========================================================================

**This is the single place the vocabulary is written down**, and it is here
rather than in `server/domain/files.ts` because the frontend has to know it
too: which kinds it may declare on an upload, which of them may stand outside
a folder, and which MIME types the server will accept as previewable media
before it falls back to the generic File treatment. A second copy in the
client is the fault `postFilesResponse` above exists to stop, one field over.

**`voice` and `audio` are different kinds and stay different.** `voice` is the
recorded voice note on a comment thread (4.16, 7.14) with its own ten-minute
duration rule and its own folder requirement. `audio` is an uploaded composer
track. Nothing converts between them.

**Filename and extension are presentation and never security truth.** Nothing
in this file reads a filename, and nothing on the server classifies a file
from one. The kind is *declared* by the caller, *validated* by the server, and
then preserved: the same JPG is an `image` when it was dropped as media and a
`file` when it was inserted through the File command, and no later code path
re-derives which.
*/

/** 4.16's durable file vocabulary as #220 leaves it. */
export const FILE_KINDS = [
  'image',
  'file',
  'voice',
  'cover',
  'audio',
  'video',
  'avatar',
] as const
export type FileKind = (typeof FILE_KINDS)[number]

/** What `POST /files` accepts in its `kind` field. `avatar` is absent on
 * purpose: it has its own route, and `createFile` refuses a folder for it. */
export const UPLOAD_FILE_KINDS = [
  'image',
  'file',
  'voice',
  'cover',
  'audio',
  'video',
] as const
export type UploadFileKind = (typeof UPLOAD_FILE_KINDS)[number]

/**
 * The kinds an upload may send with no `folder_id` at all, which is migration
 * 0024's `files_folderless_kind_check` less the avatar — an avatar *refuses* a
 * folder rather than merely allowing none.
 *
 * **`voice` is the only kind left out**, and the reason is the reason it was
 * left out before: a voice note hangs on a comment thread, a thread lives in a
 * folder, and there is no page kind for which that is not so. Every other kind
 * decorates or attaches to a page, and not every page is a folder — a shelf is
 * private (4.18) and has none — so a composer asset has to be able to take its
 * page's scope. A folder-less row of any of these kinds is **its owner's
 * alone**: `readableFileScope` serves it to nobody else, and no page a
 * stranger can read may name it.
 */
export const FOLDERLESS_UPLOAD_KINDS = [
  'cover',
  'image',
  'file',
  'audio',
  'video',
] as const

/** The raster set the image kinds decode and re-encode through sharp. SVG is
 * absent and must stay absent: it decodes like an image and serves like a
 * document, and a document with scripts on this origin is a session walking
 * out the door. */
export const RASTER_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const

/**
 * `audio`'s allowlist, and it is deliberately short.
 *
 * #220 R1 forbids introducing FFmpeg or any media-probing subsystem in M1 and
 * says in terms what to do instead: **keep the allowlist narrow and fail
 * closed, with the generic File path still available.** So this is the set of
 * container types a current browser plays from an `<audio>` element without
 * help, and anything else — including a format some browsers do play — is not
 * refused outright but may be uploaded as a generic `file` and offered for
 * download. Refusing to *preview* something is cheap; claiming playback that
 * does not work is not.
 */
export const AUDIO_MIMES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/flac',
] as const

/** `video`'s allowlist, on the same rule and the same reasoning. QuickTime is
 * deliberately absent: `.mov` plays in some browsers and not others, so it
 * takes the generic File path rather than a player that may show nothing. */
export const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/ogg'] as const

/** 10.3, unchanged by #220: one uploaded file up to 25 MiB. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024
