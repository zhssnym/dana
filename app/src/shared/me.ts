/*
Request bodies for the 7.1 /me endpoints. The server validates with these
authoritatively; the client may import them for convenience, which per 7.11
carries no authority. Convention set here for every body schema to follow:
z.object so unknown fields are stripped, never refused (7.0 tolerates them),
a camelCase schema named for method and route, its inferred PascalCase type
beside it, and per-field messages phrased without the field name, because
sendValidationError prefixes the path when it builds the 422 (10.3).
*/
import { z } from 'zod'

import { ianaTimezone } from './timezone.js'

// PATCH /me. Body { timezone }, 422 if not IANA (7.1).
export const patchMeBody = z.object({
  timezone: ianaTimezone,
})
export type PatchMeBody = z.infer<typeof patchMeBody>

// DELETE /me. Body { confirm: "DELETE" }, literal string required, else 422
// (7.1). z.literal refuses every non-string and every other string, and the
// message spells the one accepted value.
export const deleteMeBody = z.object({
  confirm: z.literal('DELETE', { error: 'must be the literal string "DELETE"' }),
})
export type DeleteMeBody = z.infer<typeof deleteMeBody>
