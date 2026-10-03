/*
The operators' stats, at /app/stats. It's in no menu: the server answers 404
to everyone not on DANA_OPERATORS, and this page then shows the ordinary Not
found, so it looks to them like any address that does not exist.

Counts, then one row per account: email, joined, last active, work pages.
Never a page's name or content. The Privacy page tells people operators see
exactly this, so the two change together.
*/
import type { GetStatsResponse, StatsPerson, StatsWeek } from '../../shared/stats.js'
import { ApiError } from '../api/http.js'
import { useStats } from '../api/stats.js'
import { Screen } from '../components/settings/screen.js'
import { InlineError, SkeletonList } from '../components/state-patterns.js'
import { NotFoundPage } from './NotFoundPage.js'

const count = new Intl.NumberFormat()

function Figure({ label, value, note }: {
  readonly label: string
  readonly value: number
  readonly note?: string
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-(length:--text-h2-size) leading-(--text-h2-line) font-section text-foreground tabular-nums">
        {count.format(value)}
      </dd>
      {note === undefined ? null : <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  )
}

function weekLabel(start: string): string {
  return new Date(`${start}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

/* One number and a bar scaled to the column's largest week, so a column's
   weeks compare at a glance; the two columns are not on one scale. */
function Bar({ value, max, label }: {
  readonly value: number
  readonly max: number
  readonly label: string
}): React.JSX.Element {
  return (
    <td className="py-1.5 pr-4" title={label}>
      <div className="flex items-center gap-3">
        <span className="w-8 shrink-0 text-right tabular-nums text-foreground">{count.format(value)}</span>
        <span aria-hidden="true" className="h-1.5 min-w-0 flex-1">
          {value > 0 ? (
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${String(Math.max(4, (value / Math.max(1, max)) * 100))}%` }}
            />
          ) : null}
        </span>
      </div>
    </td>
  )
}

function Weeks({ weeks }: { readonly weeks: readonly StatsWeek[] }): React.JSX.Element {
  const maxPeople = Math.max(...weeks.map((week) => week.new_people))
  const maxPages = Math.max(...weeks.map((week) => week.new_work_pages))
  return (
    <section aria-label="Last 12 weeks" className="flex flex-col gap-2">
      <h2 className="text-sm font-section text-foreground">Last 12 weeks</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="w-24 py-1.5 pr-4 font-normal">Week of</th>
              <th scope="col" className="py-1.5 pr-4 font-normal">New people</th>
              <th scope="col" className="py-1.5 pr-4 font-normal">New work pages</th>
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((week) => (
              <tr key={week.week_start}>
                <th scope="row" className="py-1.5 pr-4 text-left font-normal text-muted-foreground tabular-nums">
                  {weekLabel(week.week_start)}
                </th>
                <Bar value={week.new_people} max={maxPeople}
                  label={`${String(week.new_people)} new people, week of ${weekLabel(week.week_start)}`} />
                <Bar value={week.new_work_pages} max={maxPages}
                  label={`${String(week.new_work_pages)} new work pages, week of ${weekLabel(week.week_start)}`} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function People({ people }: { readonly people: readonly StatsPerson[] }): React.JSX.Element {
  return (
    <section aria-label="People" className="flex flex-col gap-2">
      <h2 className="text-sm font-section text-foreground">People</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="w-full py-1.5 pr-4 font-normal">Email</th>
              <th scope="col" className="py-1.5 pr-4 font-normal whitespace-nowrap max-sm:hidden">Joined</th>
              <th scope="col" className="py-1.5 pr-4 font-normal whitespace-nowrap">Last active</th>
              <th scope="col" className="py-1.5 text-right font-normal whitespace-nowrap">Work pages</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person, index) => (
              <tr key={person.email ?? `no-email-${String(index)}`}>
                <th scope="row" title={person.email ?? undefined}
                  className="max-w-0 truncate py-1.5 pr-4 text-left font-normal text-foreground">
                  {person.email ?? 'No email'}
                </th>
                <td className="py-1.5 pr-4 whitespace-nowrap text-muted-foreground tabular-nums max-sm:hidden">
                  {dayLabel(person.joined_on)}
                </td>
                <td className="py-1.5 pr-4 whitespace-nowrap text-muted-foreground tabular-nums">
                  {person.last_active_on === null ? 'Not in 30 days' : dayLabel(person.last_active_on)}
                </td>
                <td className="py-1.5 text-right text-foreground tabular-nums">{count.format(person.work_pages)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Stats({ stats }: { readonly stats: GetStatsResponse }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-10 px-2">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
        <Figure label="People" value={stats.people.total}
          note={`${count.format(stats.people.new_this_week)} joined this week`} />
        <Figure label="Active, last 24 hours" value={stats.active.day} />
        <Figure label="Active, last 7 days" value={stats.active.week} />
        <Figure label="Active, last 30 days" value={stats.active.month} />
        <Figure label="Work pages" value={stats.work_pages.total}
          note={`${count.format(stats.work_pages.new_this_week)} made this week`} />
      </dl>
      <Weeks weeks={stats.weeks} />
      <People people={stats.people_list} />
      <p className="text-xs text-muted-foreground">
        Active means signed in and used Dana in that window; people who signed out are not counted
        until they return, and show as not active in 30 days. Work pages leave out each person’s Desk, the sample workspace and anything
        in the trash. Weeks start on Monday, UTC.
      </p>
    </div>
  )
}

export function StatsPage(): React.JSX.Element {
  const stats = useStats()
  if (stats.error instanceof ApiError && stats.error.status === 404) return <NotFoundPage />
  return (
    <Screen title="Stats" description="Every account on Dana, and how much each uses it. No page names or content.">
      {stats.isPending ? <SkeletonList /> : null}
      {stats.isError ? <InlineError onRetry={() => { void stats.refetch() }} /> : null}
      {stats.data === undefined ? null : <Stats stats={stats.data} />}
    </Screen>
  )
}
