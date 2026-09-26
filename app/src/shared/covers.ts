/*
The 7.19 place-cover contract: the cover a person has chosen for one of Dana's own place pages.

**Why this is a contract at all**, since folders and shelves have carried a
cover since 4.3 and 4.18: a place page has no row anywhere to hang one on,
which is why the table exists. It is
per viewer, so nothing here names anybody: every route reads and writes the
caller's own and there is no path to another person's.

**Exactly one source.** A cover is a stored file or a built-in, never both
and never neither, which is 4.20's CHECK. The schema below refuses both
shapes with 422 naming the pair, rather than letting the database answer a
constraint violation as a 500.

**The preset is checked for shape and not against a list**, here as in the
column. The built-in covers are the design system's gradients and ribbon
marks; a value list in a shared schema would be a design vocabulary fixed
in the contract, which 11.13 puts in the design record instead.
*/
import { z } from 'zod'

/**
 * 4.20's native place-page set. Desk is absent because it is a folder and
 * carries 4.3's own cover column. `overdue` joined this set in issue #353 so
 * every Focus destination can use the same durable cover path.
 */
export const PLACE_COVER_PLACES = [
  'today',
  'scheduled',
  'assignments',
  'important',
  'overdue',
  'all',
  'done',
  'abandoned',
  'anytime',
] as const
export type PlaceCoverPlace = (typeof PLACE_COVER_PLACES)[number]

export const placeCoverPlace = z.enum(PLACE_COVER_PLACES)

/** 4.20's reposition, a percentage down the picture. */
export const DEFAULT_FOCAL_Y = 50

export const putPlaceCoverBody = z
  .object({
    file_id: z.uuid().optional(),
    preset: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/, 'preset: a built-in cover’s name')
      .optional(),
    focal_y: z.number().int().min(0).max(100).optional(),
  })
  .superRefine((body, ctx) => {
    if ((body.file_id === undefined) === (body.preset === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['preset'],
        message:
          'a cover names exactly one of file_id and preset, never both and never neither',
      })
    }
  })
export type PutPlaceCoverBody = z.infer<typeof putPlaceCoverBody>

export const placeCover = z.object({
  place: placeCoverPlace,
  file_id: z.uuid().nullable(),
  preset: z.string().nullable(),
  focal_y: z.number().int(),
})
export type PlaceCover = z.infer<typeof placeCover>

export const getPlaceCoversResponse = z.object({
  covers: z.array(placeCover),
})
export type GetPlaceCoversResponse = z.infer<typeof getPlaceCoversResponse>
