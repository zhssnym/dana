/*
The 7.15 upload surface's two answers: `POST /files` and `POST /me/avatar`.

**Why this file exists (#39).** Both shapes were written twice — once as a
`res.json` literal in `server/routes/files.ts` and once as a zod schema inside
`client/api/http.ts` — with nothing between them. That is the same fault the
trash view carried, on the one surface where it costs most: a file upload
whose response gains or loses a field breaks the parse in the client's own
transport layer, above every screen, and no test in the repository compares
the two literals.

Neither shape belongs in `me.ts`, avatar included. `me.ts` is 7.1 and 7.2, the
JSON `/me` surface; these two are 7.15's multipart one, answered by the same
route module, refused by the same quota, and served from the same store. The
path is what they share least.

**The client half is not done.** `api/http.ts` is on the frontend's
do-not-touch list for a backend session, so the two schemas there still exist
and these are asserted against the server instead. Swapping them is Imran's
one-line change per call site, and is additive: these parse strictly what the
literals there parse today.
*/
import { z } from 'zod'

/**
 * `POST /files` → 201. The row's id and the bytes actually stored, which is
 * the downscaled length for an image and not what the caller sent, so a
 * client showing "uploaded N bytes" is showing the truth (`domain/files.ts`).
 */
export const postFilesResponse = z.object({
  id: z.uuid(),
  bytes: z.number().int(),
})
export type PostFilesResponse = z.infer<typeof postFilesResponse>

/**
 * `POST /me/avatar` → 200. A serving **path** under this origin and never an
 * absolute URL: the route answers `/api/v1/files/:id`, and 4.1's `avatar_url`
 * column holds the same. `z.url()` would refuse the value the server sends,
 * which is why this is a plain string and must stay one.
 */
export const postAvatarResponse = z.object({
  avatar_url: z.string(),
})
export type PostAvatarResponse = z.infer<typeof postAvatarResponse>
