/*
The /me request bodies and response. Body schemas here and across src/shared
are z.object (unknown fields stripped), and messages omit the field name
because sendValidationError prefixes the path.
*/
import { z } from 'zod'

import { ianaTimezone } from './timezone.js'

export const patchMeBody = z.object({
  timezone: ianaTimezone,
})
export type PatchMeBody = z.infer<typeof patchMeBody>

export const deleteMeBody = z.object({
  confirm: z.literal('DELETE', { error: 'must be the literal string "DELETE"' }),
})
export type DeleteMeBody = z.infer<typeof deleteMeBody>

/* A strict boolean; null is refused because the columns are NOT NULL. */
export const settingsToggle = z.boolean({ error: 'must be a boolean' })

/* The `settings` key of GET /me; domain/bundle.ts derives these into `pinned_views`. */
export const settings = z.object({
  show_important: settingsToggle,
  show_all: settingsToggle,
  show_done: settingsToggle,
})
export type Settings = z.infer<typeof settings>

/*
GET /me. `email` is nullable because 8.10's scrub empties the column, unlike
connections.ts, whose roster excludes deleted users.
*/
export const meResponse = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.string().nullable(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    timezone: ianaTimezone,
    /** The answer to "How did you hear about Dana?"; null until asked. */
    heard_about: z.string().nullable(),
  }),
  settings,
  pending_invite_count: z.int().nonnegative(),
})
export type MeResponse = z.infer<typeof meResponse>
