/*
The 7.21 place descriptions: a person's sentence under one of Dana's own place
pages, over 4.20's place set. The read is dense: every place answers, null
meaning the client's default sentence. 500 characters, as folders and shelves.
*/
import { z } from 'zod'

import { PLACE_COVER_PLACES, placeCoverPlace } from './covers.js'

export const PLACE_DESCRIPTION_PLACES = PLACE_COVER_PLACES
export type PlaceDescriptionPlace = (typeof PLACE_DESCRIPTION_PLACES)[number]

export const placeDescriptionPlace = placeCoverPlace

export const PLACE_DESCRIPTION_MAX = 500

/*
`description` is required and nullable, so an empty body is refused rather than
dropped with a 200. Null or whitespace clears; the server trims before storing.
*/
export const putPlaceDescriptionBody = z.object({
  description: z.string().max(PLACE_DESCRIPTION_MAX).nullable(),
})
export type PutPlaceDescriptionBody = z.infer<typeof putPlaceDescriptionBody>

export const placeDescription = z.object({
  place: placeDescriptionPlace,
  description: z.string().nullable(),
})
export type PlaceDescription = z.infer<typeof placeDescription>

export const getPlaceDescriptionsResponse = z.object({
  descriptions: z.array(placeDescription),
})
export type GetPlaceDescriptionsResponse = z.infer<
  typeof getPlaceDescriptionsResponse
>
