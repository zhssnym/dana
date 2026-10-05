import { z } from 'zod'

export const archivedWork = z.object({
  id: z.string().uuid(),
  name: z.string(),
  archived_at: z.string(),
  archived_by_name: z.string().nullable(),
  shared: z.boolean(),
  can_restore: z.boolean(),
  can_destroy: z.boolean(),
})

export const getArchivedWorkResponse = z.object({ rows: z.array(archivedWork) })
export type ArchivedWork = z.infer<typeof archivedWork>
export type GetArchivedWorkResponse = z.infer<typeof getArchivedWorkResponse>
