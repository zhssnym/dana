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

/*
The read half, added by the S9 client arm on 2026-08-24.

**A boundary note, because this file is not the client arm's.** S5 built the
7.16 routes and published the write bodies and the `Shelf` interface, but no
zod schema for what a read answers, and `api/http.ts` parses every response
through one: a client cannot call GET /shelves without this. The same gap sits
in `bundle.ts` and over the 7.13 trash view, and all three are recorded
together in RFC 0005's change control rather than worked around with a private
schema in `src/client`, which would put the contract in two places and let
them drift. Nothing existing is touched; this only adds what a reader needs.
*/
export const shelf = z.object({
  id: z.uuid(),
  name: shelfName,
  icon: z.string().nullable(),
  color: z.string().nullable(),
  cover_file_id: z.uuid().nullable(),
  description: z.string().nullable(),
  created_at: z.string(),
})

export const getShelvesResponse = z.array(shelf)
export type GetShelvesResponse = z.infer<typeof getShelvesResponse>
