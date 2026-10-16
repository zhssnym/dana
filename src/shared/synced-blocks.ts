import { z } from 'zod'

/** GET /synced-blocks/:id: where the original of a synced block lives. 404 when the reader cannot open it. */
export const syncedSource = z.object({
  block_id: z.uuid(),
  home: z.enum(['folder', 'task', 'shelf']),
  /** The Page, Task or Shelf that holds the original. */
  home_id: z.uuid(),
  /** The Facet that holds the original on a Page; null for a Task or a Shelf. */
  facet_id: z.uuid().nullable(),
  label: z.string(),
  /** Documents that hold a copy and that the reader can open. */
  copies: z.number().int().nonnegative(),
})
export type SyncedSource = z.infer<typeof syncedSource>
