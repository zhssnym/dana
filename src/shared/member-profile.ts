/* Project-scoped teammate content. Authorship is distinct from project authority.
 * A profile is never a private-content boundary: all current project members can read it.
 */
import { z } from 'zod'
import { richContent } from './rich-content.js'

export const PROFILE_AREAS = ['project', 'shared'] as const
export const profileArea = z.enum(PROFILE_AREAS)
export type ProfileArea = z.infer<typeof profileArea>

// Literal variants preserve discriminated narrowing in TypeScript as well as
// runtime validation. Grouped z.enum kinds validate, but do not narrow fully.
const textBlock = (kind: 'paragraph' | 'bullet' | 'numbered') =>
  z.object({ kind: z.literal(kind), content: richContent }).strict()
const mediaBlock = (kind: 'file' | 'image') =>
  z.object({ kind: z.literal(kind), file_id: z.uuid() }).strict()

export const profileContent = z.object({
  version: z.literal(1),
  blocks: z.array(z.discriminatedUnion('kind', [
    textBlock('paragraph'), textBlock('bullet'), textBlock('numbered'),
    mediaBlock('file'), mediaBlock('image'),
  ])).max(120),
}).strict().superRefine((content, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(content)).length > 64 * 1024)
    ctx.addIssue({ code: 'custom', message: 'Profile content must be at most 64 KB.' })
})
export type ProfileContent = z.infer<typeof profileContent>
export const EMPTY_PROFILE_CONTENT: ProfileContent = { version: 1, blocks: [] }

export const putProfileContentBody = z.object({
  content: profileContent,
  base_revision: z.int().nonnegative(),
}).strict()

export const profileStanding = z.object({
  content: profileContent,
  revision: z.int().nonnegative(),
  updated_at: z.iso.datetime().nullable(),
  updated_by: z.object({ id: z.uuid(), display_name: z.string().nullable(), avatar_url: z.string().nullable() }).nullable(),
  may_edit: z.boolean(),
})
export type ProfileStanding = z.infer<typeof profileStanding>
