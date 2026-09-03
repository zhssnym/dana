/*
The 7.16 shelf contract (RFC 0005, 4.18): a shelf is a stable id wearing a
changeable name. Membership of a shelf stays folder_members.label, frozen
since 4.4; these shapes carry only what the shelves table owns.

The message convention is `folders.ts`'s, and #39 brought this file into it
after measuring what the old messages actually put on the wire. A per-field
message is phrased **without** the field name, because `sendValidationError`
hands the issue to `sendFieldValidationError`, which builds every sentence as
`${path}: ${message}` (10.3). These two carried their own prefix and were
therefore doubling it in a real 422:

    POST /shelves { name: 'ok', color: 'red' }
      before  422 "color: color: must be #RRGGBB."
      after   422 "color: must be a hex color in #RRGGBB form."
    POST /shelves { name: '' }
      before  422 "name: name: must be 1 to 40 characters."
      after   422 "name: must be 1 to 40 characters."

Both sentences are user-visible strings and both changed. `shelves.test.ts`
pins them through the same formatter the route uses, so the next person to
write a message here finds out from a test rather than from a caller.
*/
import { z } from 'zod'

import { hexColor } from './folders.js'

/*
7.16's name bound, kept as its own primitive rather than folded into
`folders.ts`'s `personalLabel`, which happens to share the 1-to-40 range: a
shelf's name (4.18) and a member's private label for a folder (4.4) are two
contract facts, and one moving should not drag the other.

The colour is **not** its own primitive, and that is the #39 fix. It was a
second copy of `folders.ts`'s `hexColor` regex, already diverged in its
message, over a value 4.3 and 4.18 CHECK with the same six-hex-digit rule.
One definition, imported.
*/
const shelfName = z
  .string()
  .min(1, 'must be 1 to 40 characters')
  .max(40, 'must be 1 to 40 characters')

/** The four fields both write shapes have always shared. */
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
The cover, added 2026-09-03 for issues #20 and #100.

**#100 is the defect these three fields close and it is a silent one.**
`shelves.cover_file_id` has existed since 0003 and no route had ever written
it, while `client/lib/page-identity.ts` sends it to this endpoint whenever
somebody sets or clears a shelf cover. Nothing in this folder is `.strict()`,
so the field was parsed away and answered 200 — measured on the wire as
`PATCH /shelves/:id { cover_file_id: … }` → 200 with `cover_file_id: null`,
and a later GET still null. Declaring the field is therefore only half a fix
and the issue says so itself; `domain/shelves.ts` writes it in the same
change, and AC-368 is what proves the write rather than the declaration.

The shapes are 4.3's, because the rules are: `cover_preset` takes 4.20's key
alphabet, `cover_focal_y` is a percentage down the picture, and a body naming
both a file and a preset is refused here rather than left to migration 0012's
`shelves_cover_one_source_check` to answer as a 500.
*/
const coverPreset = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, 'must be a preset key')

/*
**Creation does not take a cover, and refuses one out loud rather than
dropping it.** A shelf is made and then dressed, which is what the client
does; offering the cover on both shapes would mean two gates over one rule for
a call nobody makes. `z.never().optional()` is the house way an endpoint
declines a field it does not honour — the #40 ruling, grounds in spec 11.14 —
and it exists precisely so this file's one real hazard, a field accepted and
thrown away, cannot be reintroduced by the next person who tries the obvious
thing.
*/
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
  /* Issues #20 and #100, migration 0012: the read half of the two columns a
     folder has carried since 0006. A response schema is the safe kind to
     widen — the compiler catches both sides — which is the whole reason the
     write half above needed the paragraph it has. */
  cover_preset: z.string().nullable(),
  cover_focal_y: z.int().min(0).max(100),
  description: z.string().nullable(),
  created_at: z.string(),
})

export const getShelvesResponse = z.array(shelf)
export type GetShelvesResponse = z.infer<typeof getShelvesResponse>
