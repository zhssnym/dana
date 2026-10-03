/*
Connected work (#488): the source-aware projection of facet references.

A facet reference is still persisted as an ordinary Dana Link href. This
contract does not add a relationship row or a second graph. It only enriches
the existing facet backlink read with the exact source objects that already
contain a reference, so a facet can show the work that points at it rather
than only the document that owns that work.

`source` is intentionally the containing object, never a proximity guess: an
inline facet chip in a paragraph makes that paragraph the source; a chip in an
image caption makes that image block the source; a chip in a Discussion post
makes that post the source. Media blocks that cannot carry rich text are not
silently associated with a neighbouring chip.

A page-block source also carries its canonical PageBlock read model. This is
not a copy to edit: it lets another facet render the same block identity with
Dana's native renderer while the source document remains the only write path.
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
  /** Kept verbatim from #214 so this response is a backward-compatible
   * superset of GetBacklinksResponse for facet targets. */
  block_ids: z.array(z.uuid()),
  /** Exact source objects, in their document/thread order. Responsibility
   * documents have no stable block ids and therefore answer an empty list. */
  sources: z.array(connectedWorkSource),
})
export type ConnectedWorkItem = z.infer<typeof connectedWorkItem>

export const getConnectedWorkResponse = z.object({
  results: z.array(connectedWorkItem).max(BACKLINK_LIMIT),
  truncated: z.boolean(),
})
export type GetConnectedWorkResponse = z.infer<typeof getConnectedWorkResponse>
