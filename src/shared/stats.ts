import { z } from 'zod'

/*
The operators' stats (GET /stats): counts across every account, and one row
per account with its email, the day it joined, the day it was last active and
how many work pages it has. No page's name or content crosses the wire. The
Privacy page says operators see exactly this; change both together.
*/
export const statsWeek = z.object({
  /** Monday of the week, YYYY-MM-DD, UTC. */
  week_start: z.string(),
  new_people: z.number().int(),
  new_work_pages: z.number().int(),
})

export const statsPerson = z.object({
  email: z.string().nullable(),
  /** YYYY-MM-DD, UTC. */
  joined_on: z.string(),
  /** YYYY-MM-DD, UTC; null when no live session (signed out, or idle 30 days). */
  last_active_on: z.string().nullable(),
  work_pages: z.number().int(),
})

export const getStatsResponse = z.object({
  people: z.object({ total: z.number().int(), new_this_week: z.number().int() }),
  /** People with a request in the last day, 7 days, 30 days. */
  active: z.object({ day: z.number().int(), week: z.number().int(), month: z.number().int() }),
  work_pages: z.object({ total: z.number().int(), new_this_week: z.number().int() }),
  /** The last 12 weeks, oldest first, the current week last. */
  weeks: z.array(statsWeek),
  /** Accounts with an email, most recently active first. */
  people_list: z.array(statsPerson),
})

export type StatsWeek = z.infer<typeof statsWeek>
export type StatsPerson = z.infer<typeof statsPerson>
export type GetStatsResponse = z.infer<typeof getStatsResponse>
