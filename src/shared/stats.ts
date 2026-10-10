import { z } from 'zod'

/*
The operators' stats (GET /stats): counts across every account, and one row
per account with its email, where it came from, the day it joined, the day it was last active and
how many work pages it has. No page's name or content crosses the wire. The
Privacy page says operators see exactly this; change both together.
*/
export const statsWeek = z.object({
  /** Monday of the week, YYYY-MM-DD, UTC. */
  week_start: z.string(),
  new_people: z.number().int(),
  new_work_pages: z.number().int(),
})

/** How a person first came: a link tag, `invite`, a referrer host, `direct`, or `unknown` (joined before tracking). */
export const statsSource = z.object({
  source: z.string(),
  people: z.number().int(),
  active_month: z.number().int(),
})

export const statsPerson = z.object({
  email: z.string().nullable(),
  source: z.string(),
  /** Their own answer to "How did you hear about Dana?"; null when not answered yet. */
  heard_about: z.string().nullable(),
  /** YYYY-MM-DD, UTC. */
  joined_on: z.string(),
  /** YYYY-MM-DD, UTC; null when no live session (signed out, or idle 30 days). */
  last_active_on: z.string().nullable(),
  work_pages: z.number().int(),
  /** Every live page (any kind) and task this person made. */
  pages_total: z.number().int(),
  tasks_total: z.number().int(),
})

export const statsUsage = z.object({
  /** Last 30 days, by kind of action: how often, and by how many people. */
  actions: z.array(z.object({ what: z.string(), times: z.number().int(), people: z.number().int() })),
  /** People who did anything, per UTC day, last 30 days, oldest first. */
  days: z.array(z.object({ day: z.string(), people: z.number().int() })),
  /** Actions in the last 30 days by local hour (0 to 23) and weekday (Monday first). */
  hours: z.array(z.number().int()),
  weekdays: z.array(z.number().int()),
  /** The last 8 signup weeks: how many joined, came back after day one, and acted in the last 7 days. */
  cohorts: z.array(z.object({
    week_start: z.string(),
    joined: z.number().int(),
    came_back: z.number().int(),
    active_week: z.number().int(),
  })),
})

export const getStatsResponse = z.object({
  people: z.object({ total: z.number().int(), new_this_week: z.number().int() }),
  /** People with a request in the last day, 7 days, 30 days. */
  active: z.object({ day: z.number().int(), week: z.number().int(), month: z.number().int() }),
  work_pages: z.object({ total: z.number().int(), new_this_week: z.number().int() }),
  /** Every live page and task made by counted people, sample and Desk left out. */
  totals: z.object({ pages: z.number().int(), tasks: z.number().int() }),
  /** The last 12 weeks, oldest first, the current week last. */
  weeks: z.array(statsWeek),
  /** Most people first. */
  sources: z.array(statsSource),
  usage: statsUsage,
  /** Answers to "How did you hear about Dana?", most first. */
  heard_about: z.array(z.object({ answer: z.string(), people: z.number().int() })),
  /** Accounts with an email, most recently active first. */
  people_list: z.array(statsPerson),
})

export type StatsWeek = z.infer<typeof statsWeek>
export type StatsSource = z.infer<typeof statsSource>
export type StatsPerson = z.infer<typeof statsPerson>
export type GetStatsResponse = z.infer<typeof getStatsResponse>
