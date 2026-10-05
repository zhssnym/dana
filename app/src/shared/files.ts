/* The 7.15 upload responses (`POST /files`, `POST /me/avatar`) and the file kind vocabulary. */
import { z } from 'zod'

/** `POST /files` → 201. `bytes` is the stored length (downscaled for images). */
export const postFilesResponse = z.object({
  id: z.uuid(),
  bytes: z.number().int(),
  /* The stored dimensions after downscaling. Null for kinds without them and
     for rows uploaded before the column existed: treat null as unknown. */
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
})
export type PostFilesResponse = z.infer<typeof postFilesResponse>

/** `POST /me/avatar` → 200. A path on this origin, so it must not become z.url(). */
export const postAvatarResponse = z.object({
  avatar_url: z.string(),
})
export type PostAvatarResponse = z.infer<typeof postAvatarResponse>

/*
File kinds and MIME allowlists, shared because the client must know them too.
`voice` (a comment's recorded note) and `audio` (an uploaded track) stay
separate. The kind is declared, validated and preserved; filenames and
extensions are never trusted.
*/

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

/** `avatar` has its own route. */
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
 * Kinds that may upload without `folder_id`; every kind but `voice`, which
 * always lives on a folder's thread. A folder-less row is its owner's alone.
 */
export const FOLDERLESS_UPLOAD_KINDS = [
  'cover',
  'image',
  'file',
  'audio',
  'video',
] as const

/** Rasters decoded and re-encoded through sharp. Never add SVG: it serves as a
 * document, and a script on this origin would carry the session. */
export const RASTER_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const

/**
 * Audio types browsers play natively. Kept narrow (no media probing); other
 * formats can still be uploaded as kind `file`.
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

/** Same rule. QuickTime is out: `.mov` plays in some browsers only. */
export const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/ogg'] as const

export const MAX_FILE_BYTES = 25 * 1024 * 1024
