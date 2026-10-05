/*
The 7.19 place covers: per viewer, for Dana's own place pages, which have no
row of their own. Exactly one source (file or preset), refused as 422 rather
than the CHECK's 500. Presets are shape-checked only, not listed.
*/
import { z } from 'zod'

/** The place-page set. Desk is a folder and has its own cover column. */
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
