import { z } from 'zod'

export const profileDocAudience = z.enum(['only_me', 'project_members', 'selected_people'])
export type ProfileDocAudience = z.infer<typeof profileDocAudience>

export const profileDocGrant = z.object({
  user_id: z.uuid(),
  may_edit: z.boolean(),
})
export type ProfileDocGrant = z.infer<typeof profileDocGrant>

export const postProfileDocBody = z.object({
  name: z.string().trim().min(1).max(120),
  custody: z.enum(['person', 'project']),
})

export const patchProfileDocAudienceBody = z.object({
  audience: profileDocAudience,
  grants: z.array(profileDocGrant).max(100),
}).superRefine((value, ctx) => {
  if (value.audience === 'only_me' && value.grants.length) {
    ctx.addIssue({ code: 'custom', path: ['grants'], message: 'Only me has no grants.' })
  }
  const ids = value.grants.map((grant) => grant.user_id)
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['grants'], message: 'A person appears more than once.' })
  }
})

export const profileDocRoot = z.object({
  id: z.uuid(),
  name: z.string(),
  audience: profileDocAudience,
  tab_position: z.string(),
  custody: z.enum(['person', 'project']),
  may_edit: z.boolean(),
  may_manage: z.boolean(),
})
export type ProfileDocRoot = z.infer<typeof profileDocRoot>
export const getProfileDocsResponse = z.object({ roots: z.array(profileDocRoot) })
export const getProfileDocSharingResponse = z.object({
  grants: z.array(profileDocGrant.extend({ display_name: z.string().nullable() })),
})
export const postProfileDocResponse = z.object({ id: z.uuid() })
export const migrateProfileDocsResponse = z.object({
  migrated: z.int().nonnegative(),
  retained: z.int().nonnegative(),
})
export const patchProfileDocPositionBody = z.object({
  before_id: z.uuid().nullable(),
  after_id: z.uuid().nullable(),
}).refine((value) => value.before_id !== value.after_id || value.before_id === null,
  'Choose two different neighboring tabs.')
