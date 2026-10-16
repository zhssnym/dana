import { z } from 'zod'

/** A document that holds the original or a copy of a synced block. */
export const syncedPage = z.object({
  home: z.enum(['folder', 'task', 'shelf']),
  /** The Page, Task or Shelf. */
  home_id: z.uuid(),
  /** The Facet on a Page; null for a Task or a Shelf. */
  facet_id: z.uuid().nullable(),
  label: z.string(),
  /** The original, or the first copy in this document. */
  block_id: z.uuid(),
  original: z.boolean(),
})
export type SyncedPage = z.infer<typeof syncedPage>

/** GET /synced-blocks/:id: the original first, then each document with a copy the reader can open. 404 when the reader cannot open the original. */
export const syncedSource = z.object({
  block_id: z.uuid(),
  pages: z.array(syncedPage).min(1),
})
export type SyncedSource = z.infer<typeof syncedSource>
