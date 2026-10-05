/*
"Referenced from": computed at read time by scanning documents the reader can
open; nothing is stored. A source the reader cannot open is omitted entirely,
not counted or redacted. Names are live, never copied.
*/
import { z } from 'zod'

/** Where the referencing text lives: a page document, a Responsibility, or thread posts. */
export const BACKLINK_SURFACES = ['page', 'responsibility', 'post'] as const
export type BacklinkSurface = (typeof BACKLINK_SURFACES)[number]

export const BACKLINK_HOMES = ['folder', 'shelf', 'facet', 'task', 'discussion'] as const
export type BacklinkHome = (typeof BACKLINK_HOMES)[number]

/** Documents per read; `truncated` says the list was cut. */
export const BACKLINK_LIMIT = 50

export const backlink = z.object({
  surface: z.enum(BACKLINK_SURFACES),
  /** The object owning the document. Readers must tolerate unknown homes. */
  home: z.enum(BACKLINK_HOMES),
  home_id: z.uuid(),
  /** The document's Folder; null for a Shelf page. */
  folder_id: z.uuid().nullable(),
  /** Whose Responsibility holds the link; null otherwise. */
  member_id: z.uuid().nullable(),
  /** The home's live name (a Discussion's or Task's title for posts). */
  label: z.string(),
  /** Blocks carrying the link, in document order (empty for Responsibilities,
   * whose blocks have no ids). For posts, the comment ids, oldest first. */
  block_ids: z.array(z.uuid()),
})
export type Backlink = z.infer<typeof backlink>

export const getBacklinksResponse = z.object({
  results: z.array(backlink).max(BACKLINK_LIMIT),
  truncated: z.boolean(),
})
export type GetBacklinksResponse = z.infer<typeof getBacklinksResponse>
