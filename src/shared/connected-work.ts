/*
Connected work: facet references with their exact source objects (a
paragraph, a block, a post), never a neighbouring guess. References are still
plain Dana Link hrefs; nothing new is stored. A block source carries its
canonical PageBlock for rendering; the source document stays the only writer.
*/
import { z } from 'zod'

import { BACKLINK_HOMES, BACKLINK_LIMIT, BACKLINK_SURFACES } from './backlinks.js'
import { pageBlock } from './pages.js'

export const CONNECTED_WORK_TEXT_MAX = 280

export const connectedWorkFile = z.object({
  id: z.uuid(),
  name: z.string(),
})
export type ConnectedWorkFile = z.infer<typeof connectedWorkFile>

export const connectedWorkSource = z.object({
  /** Page-block id or Discussion-post id. */
  id: z.uuid(),
  kind: z.enum(['block', 'post']),
  /** Page block kind; null for a post. */
  block_kind: z.string().nullable(),
  /** A short plain-text projection of the exact source object. */
  text: z.string().max(CONNECTED_WORK_TEXT_MAX).nullable(),
  /** Files carried by this exact block/post, never neighbouring files. */
  files: z.array(connectedWorkFile),
  /** The same canonical block payload normal page/task reads use. Posts have none. */
  block: pageBlock.nullable().optional(),
})
export type ConnectedWorkSource = z.infer<typeof connectedWorkSource>

export const connectedWorkItem = z.object({
  surface: z.enum(BACKLINK_SURFACES),
  home: z.enum(BACKLINK_HOMES),
  home_id: z.uuid(),
  folder_id: z.uuid().nullable(),
  member_id: z.uuid().nullable(),
  label: z.string(),
  /** Kept so this is a superset of GetBacklinksResponse. */
  block_ids: z.array(z.uuid()),
  /** In document or thread order; empty for Responsibilities (no block ids). */
  sources: z.array(connectedWorkSource),
})
export type ConnectedWorkItem = z.infer<typeof connectedWorkItem>

export const getConnectedWorkResponse = z.object({
  results: z.array(connectedWorkItem).max(BACKLINK_LIMIT),
  truncated: z.boolean(),
})
export type GetConnectedWorkResponse = z.infer<typeof getConnectedWorkResponse>
