/*
The 7.21 place-description contract (issue #68, from #21): the sentence a
person has written under one of Dana's own place pages.

**Why this is a contract at all.** 9.4's shared page head names an "editable
description" in terms, and `pages/page-heading.tsx` carried the record that
Dana had nowhere to put one: a folder and a shelf keep theirs in a column
(4.3, 4.18) because they have a row, and Today, Scheduled and the rest have
none. 4.22 is that row, and this is its wire shape.

**The place set is 4.20's, imported rather than restated.** A third copy of
the eight names would be a third thing to forget; the two that exist,
`covers.ts` here and `navPages` in the client, are issue #39's to reconcile
and not this file's to add to. The set is the same set for the same reason:
Desk is a folder and carries 4.3's own description column.

**Null is the whole vocabulary of absence on the wire, and the read is
dense.** Every one of the eight places answers, carrying null where the
person has written nothing, so a client maps place to description without
having to know whether a missing entry means "not written" or "not
supported". Null means Dana's own sentence for the page, which stays in the
client where it always was: the server never invents copy it would then have
to keep in step with `routes.ts`.

**The limit is 500, folders' and shelves' own (4.3, 4.18)**, restated here
rather than chosen: a description that fits under a folder's title fits
under Today's.
*/
import { z } from 'zod'

import { PLACE_COVER_PLACES, placeCoverPlace } from './covers.js'

/** 4.22's set, which is 4.20's set: see the header. */
export const PLACE_DESCRIPTION_PLACES = PLACE_COVER_PLACES
export type PlaceDescriptionPlace = (typeof PLACE_DESCRIPTION_PLACES)[number]

export const placeDescriptionPlace = placeCoverPlace

/** 4.3's and 4.18's limit, not a new one. */
export const PLACE_DESCRIPTION_MAX = 500

/*
The write. `description` is required and nullable rather than optional,
because a body naming nothing at all is not a description this endpoint could
act on, and an optional field the server ignored would be accepted and
dropped with a 200 (the shared folder's standing hazard: there is no
`.strict()` here).

Null clears, and so does a string of nothing but whitespace: the field is a
textarea and a person who selects their sentence and deletes it has cleared
it, whatever the browser leaves behind. The server trims before it stores,
so the trimmed value is what comes back.
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
