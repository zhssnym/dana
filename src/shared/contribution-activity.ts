import { z } from 'zod'

export const contributionCategory = z.enum([
  'Task created', 'Task completed', 'Task reopened', 'Task abandoned', 'Task restored',
  'Page created', 'Page edited', 'Page renamed', 'Comment posted',
])
export const contributionDay = z.object({
  date: z.iso.date(),
  count: z.number().int().nonnegative(),
  categories: z.array(z.object({ name: contributionCategory, count: z.number().int().positive() })),
  references: z.array(z.object({ kind: z.enum(['task', 'folder']), id: z.uuid(), name: z.string() })),
})
export const getContributionActivityResponse = z.object({
  timezone: z.literal('UTC'),
  days: z.array(contributionDay).length(90),
})
