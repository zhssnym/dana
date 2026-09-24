/*
"Referenced from" (issue #214, under #203's one-home rule): the reciprocal
presentation of a Dana Link, as a read.

**Nothing here is stored, and that is #320's rule as much as #223's.** A Dana
Link's only durable form is the `href` a rich-content run already holds (and,
for a Folder, the `ref_folder_id` of a `folder_ref` block). There is no
backlink table and no graph to keep in step: "what references this" is
answered by scanning the documents the reader can already open, at the moment
they ask. A link removed from a document therefore stops being a backlink the
instant the document is saved, with nothing to reconcile.

**Propagation is live, never copied.** A backlink row carries the referencing
document's *current* name and the target's own read carries the target's
current title; nothing is copied from one to the other, so a factual change
(a rename, a completion) is seen by every surface on its next read. No
interpretive content is ever rewritten automatically: a document that says
something about a target keeps saying it until a person edits it.

**Access filtering is the whole contract.** A source the reader could not
open is not answered — not as a count, not as a redacted row. The target
itself resolves through `resolveReference`, so a target the reader cannot
open is the same 404 a missing one is.
*/
import { z } from 'zod'

/** Where the referencing text lives: a page document (a Folder's page, a
 * Shelf's page, a Facet's page or a Task's document) or a member's
 * Responsibility document. */
export const BACKLINK_SURFACES = ['page', 'responsibility'] as const
export type BacklinkSurface = (typeof BACKLINK_SURFACES)[number]

/** The object that owns the referencing document. */
export const BACKLINK_HOMES = ['folder', 'shelf', 'facet', 'task'] as const
export type BacklinkHome = (typeof BACKLINK_HOMES)[number]

/** The most referencing documents one read answers. A backlink panel lists
 * places, and a target referenced from more than this many documents the
 * reader can open is better served by search than by a longer list;
 * `truncated` says the list was cut. */
export const BACKLINK_LIMIT = 50

export const backlink = z.object({
  surface: z.enum(BACKLINK_SURFACES),
  /** `folder` for a Folder page and for a Responsibility document, `shelf`
   * for a Shelf page, `facet` for a Facet page, `task` for a Task document
   * (#221). A reader must tolerate a home it does not know. */
  home: z.enum(BACKLINK_HOMES),
  /** The id of the home: a folder, shelf, facet or task id. */
  home_id: z.uuid(),
  /** The Folder the document belongs to: the folder itself, the facet's
   * folder, the Responsibility's folder, the Task's folder; null for a Shelf
   * page. */
  folder_id: z.uuid().nullable(),
  /** The member whose Responsibility document holds the link; null on a page. */
  member_id: z.uuid().nullable(),
  /** The home's live name, as its own read answers it. */
  label: z.string(),
  /** The blocks of a page document that carry the link, in document order.
   * Empty for a Responsibility document, whose blocks have no stable ids. */
  block_ids: z.array(z.uuid()),
})
export type Backlink = z.infer<typeof backlink>

export const getBacklinksResponse = z.object({
  results: z.array(backlink).max(BACKLINK_LIMIT),
  truncated: z.boolean(),
})
export type GetBacklinksResponse = z.infer<typeof getBacklinksResponse>
