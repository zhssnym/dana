import { z } from 'zod'

/*
The operators' stats (GET /stats). Counts across every account and nothing
else: no id, name, email or title of any one person or page crosses the wire.
*/
export const statsWeek = z.object({
  /** Monday of the week, YYYY-MM-DD, UTC. */
  week_start: z.string(),
  new_people: z.number().int(),
  new_work_pages: z.number().int(),
})

export const getStatsResponse = z.object({
  people: z.object({ total: z.number().int(), new_this_week: z.number().int() }),
  /** People with a request in the last day, 7 days, 30 days. */
  active: z.object({ day: z.number().int(), week: z.number().int(), month: z.number().int() }),
  work_pages: z.object({ total: z.number().int(), new_this_week: z.number().int() }),
  /** The last 12 weeks, oldest first, the current week last. */
  weeks: z.array(statsWeek),
})

export type StatsWeek = z.infer<typeof statsWeek>
export type GetStatsResponse = z.infer<typeof getStatsResponse>
