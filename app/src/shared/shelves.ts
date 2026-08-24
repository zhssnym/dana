/*
The 7.16 shelf contract (RFC 0005, 4.18): a shelf is a stable id wearing a
changeable name. Membership of a shelf stays folder_members.label, frozen
since 4.4; these shapes carry only what the shelves table owns.
*/
import { z } from 'zod'

const shelfName = z
  .string()
  .min(1, 'name: must be 1 to 40 characters')
  .max(40, 'name: must be 1 to 40 characters')

export const postShelvesBody = z.object({
  name: shelfName,
  icon: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .nullable()
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'color: must be #RRGGBB')
    .nullable()
    .optional(),
  description: z.string().max(500).nullable().optional(),
})
export type PostShelvesBody = z.infer<typeof postShelvesBody>

export const patchShelfBody = postShelvesBody.partial()
export type PatchShelfBody = z.infer<typeof patchShelfBody>

export interface Shelf {
  id: string
  name: string
  icon: string | null
  color: string | null
  cover_file_id: string | null
  description: string | null
  created_at: string
}
