/*
GET /views/focus: one query behind the Focus lists (Today, Upcoming, Assigned,
Important, Overdue, No date, All open).

It is built from the queries the lists already read, not beside them: Today's
rows are Q1's (`openGroups` in my-day.ts), and every other list is Q5's stream
(Q3's dated rows over Q2's grouped ones, `plannedRows` and `tasksRows` in
lists.ts). What this file adds is the filter, pushed into the SQL so the
1000-row cap counts what the list shows rather than what it later hides.
The filters read the rung (`rungOf` in cards.ts) in SQL; Today's headings
read the same two arms (late, started) off the card, which carries both dates.

Every list shows open work only: the screens drop abandoned rows
(`withoutDropped`), so the query leaves them out.

`group=today` reproduces TodayPage's four headings (Carried over, Today,
Started, Added), rule for rule. Assigned's per-person groups are the client's
(`groupRows(..., 'person')` in client/views/grouping.ts): they sort names in
the viewer's locale and name a deleted account in the client's words.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { TaskCard } from '../../shared/tasks.js'
import type {
  FocusGroupRows,
  FocusQuery,
  FocusWhen,
  GetFocusResponse,
} from '../../shared/views.js'
import { takeCapped } from '../../shared/views.js'
import type { Executor } from '../database.js'
import { today } from '../time/index.js'

import { SCHEDULED, rungOf } from './cards.js'
import { Q2_ORDER, plannedRows, tasksRows } from './lists.js'
import { openGroups } from './my-day.js'

/** The conjunct each `when` adds, over `t` and the card source's `e`. */
function whenScope(when: FocusWhen, viewerId: string, todayLocal: string): SQL {
  const rung = rungOf(todayLocal)
  switch (when) {
    case 'any':
    case 'on_today':
      return sql``
    case 'overdue':
      return sql` AND ${rung} = 'overdue'`
    case 'undated':
      return sql` AND ${rung} = 'undated'`
    case 'upcoming':
      /* `upcomingRows` in client/shell/focus-lists.ts: dated, not pulled in,
         and not the viewer's own late, started or due-today work, which
         Today holds. IS NOT DISTINCT FROM, because a plain `=` on an
         unassigned row is null and NOT (null AND true) would drop a
         teammate's overdue task from both lists. */
      return sql` AND ${SCHEDULED} AND e.task_id IS NULL
        AND NOT (t.assignee_ids @> ARRAY[${viewerId}::uuid]
                 AND ${rung} IN ('overdue', 'started', 'today'))`
  }
}

/**
 * TodayPage's four headings over Q1's two groups, as the screen sorts them.
 * Overdue work (a deadline before today) is carried over, started or not;
 * started work (every Q1 row is pending) whose start has arrived is started;
 * the rest of Q1's today group is due today (or undated, or a later start
 * with no deadline), or added by hand when its deadline is later. Late and
 * started are `rungOf`'s first two arms, read off the card.
 */
function todayGroups(
  carried: readonly TaskCard[],
  todayRows: readonly TaskCard[],
  todayLocal: string,
): FocusGroupRows[] {
  const late = (task: TaskCard) => task.due_date !== null && task.due_date < todayLocal
  const begun = (task: TaskCard) =>
    !late(task) && task.start_date !== null && task.start_date <= todayLocal
  const carriedShown: TaskCard[] = []
  const dueToday: TaskCard[] = []
  const started: TaskCard[] = []
  const added: TaskCard[] = []
  for (const task of carried) {
    if (begun(task)) started.push(task)
    else carriedShown.push(task)
  }
  for (const task of todayRows) {
    if (begun(task)) started.push(task)
    else if (late(task)) carriedShown.push(task)
    else if (task.due_date === null || task.due_date <= todayLocal) dueToday.push(task)
    else added.push(task)
  }
  /* One order across both sources: due date, undated last. Stable. */
  started.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  return [
    { key: 'carried', rows: carriedShown },
    { key: 'today', rows: dueToday },
    { key: 'started', rows: started },
    { key: 'added', rows: added },
  ]
}

export async function focusView(
  executor: Executor,
  viewerId: string,
  tz: string,
  query: Omit<FocusQuery, 'tz'>,
): Promise<GetFocusResponse> {
  const todayLocal = today(tz)
  const important = query.important ? sql` AND t.important = true` : sql``
  const scope = sql` AND t.status = 'pending'${whenScope(query.when, viewerId, todayLocal)}${important}`

  let sections: TaskCard[][]
  if (query.when === 'on_today') {
    /* Q1 as My Day reads it; `important` narrows its cards here. */
    const open = await openGroups(executor, viewerId, todayLocal)
    const keep = (rows: TaskCard[]) =>
      query.important ? rows.filter((task) => task.important) : rows
    sections = [keep(open.carried), keep(open.today)]
  } else {
    sections = [
      await plannedRows(executor, viewerId, scope),
      await tasksRows(executor, viewerId, scope, Q2_ORDER),
    ]
  }
  const capped = takeCapped(sections)
  const kept = capped.sections

  let groups: FocusGroupRows[]
  switch (query.group) {
    case 'today':
      groups = todayGroups(kept[0] ?? [], kept[1] ?? [], todayLocal)
      break
    case 'none':
      groups = [{ key: 'all', rows: kept.flat() }]
      break
  }
  return {
    groups: groups.filter((group) => group.rows.length > 0),
    truncated: capped.truncated,
  }
}
