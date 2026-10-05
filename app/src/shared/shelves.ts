/*
The 7.16 shelf contract (4.18): a stable id with a changeable name. Messages
omit the field name because sendFieldValidationError prefixes the path.
*/
import { z } from 'zod'

import { hexColor } from './folders.js'

/* Separate from folders.ts's `shelfName` (a member's Shelf on a folder), though
   both are 1 to 40: two contract facts that may change independently. */
const shelfName = z
  .string()
  .min(1, 'must be 1 to 40 characters')
  .max(40, 'must be 1 to 40 characters')

const shelfIdentity = z.object({
  name: shelfName,
  icon: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .nullable()
    .optional(),
  color: hexColor.nullable().optional(),
  description: z.string().max(500).nullable().optional(),
})

/*
Cover fields: a body naming both a file and a preset is refused here, before
`shelves_cover_one_source_check` would answer 500. domain/shelves.ts must write
them; a declared but unread field is dropped with a 200 (AC-368).
*/
const coverPreset = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, 'must be a preset key')

/* Create refuses cover fields by name (z.never) instead of dropping them; the
   cover is set with PATCH. */
const declinedHere = (where: string) =>
  z.never({ error: `is not set when a shelf is made; ${where}` }).optional()

export const postShelvesBody = shelfIdentity.extend({
  cover_file_id: declinedHere('PATCH /shelves/:id sets the cover'),
  cover_preset: declinedHere('PATCH /shelves/:id sets the cover'),
  cover_focal_y: declinedHere('PATCH /shelves/:id sets the cover'),
})
export type PostShelvesBody = z.infer<typeof postShelvesBody>

export const patchShelfBody = shelfIdentity
  .partial()
  .extend({
    cover_file_id: z.uuid().nullable().optional(),
    cover_preset: coverPreset.nullable().optional(),
    cover_focal_y: z.int().min(0).max(100).optional(),
  })
  .refine(
    (body) => !(body.cover_file_id != null && body.cover_preset != null),
    {
      message:
        'cover_file_id and cover_preset: a cover is a file or a preset, not both',
      path: ['cover_preset'],
    },
  )
export type PatchShelfBody = z.infer<typeof patchShelfBody>

export interface Shelf {
  id: string
  name: string
  icon: string | null
  color: string | null
  cover_file_id: string | null
  cover_preset: string | null
  cover_focal_y: number
  description: string | null
  created_at: string
}

/* The zod read half the client parses. */
export const shelf = z.object({
  id: z.uuid(),
  name: shelfName,
  icon: z.string().nullable(),
  color: z.string().nullable(),
  cover_file_id: z.uuid().nullable(),
  cover_preset: z.string().nullable(),
  cover_focal_y: z.int().min(0).max(100),
  description: z.string().nullable(),
  created_at: z.string(),
})

export const getShelvesResponse = z.array(shelf)
export type GetShelvesResponse = z.infer<typeof getShelvesResponse>
