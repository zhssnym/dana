/*
The operators' stats, at /app/stats. It's in no menu: the server answers 404
to everyone not on DANA_OPERATORS, and this page then shows the ordinary Not
found, so it looks to them like any address that does not exist.

The growth of people carries the screen; activity and work pages sit under
it, then one row per account: email, joined, last active, work pages. Never a
page's name or content. The Privacy page tells people operators see exactly
this, so the two change together.
*/
import { useState } from 'react'

import type { GetStatsResponse, StatsPerson } from '../../shared/stats.js'
import { ApiError } from '../api/http.js'
import { useStats } from '../api/stats.js'
import { Screen } from '../components/settings/screen.js'
import { InlineError, SkeletonList } from '../components/state-patterns.js'
import { cn } from '../components/ui/utils.js'
import { NotFoundPage } from './NotFoundPage.js'

const count = new Intl.NumberFormat()

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

/** The axis top: the next 1, 2 or 5 times a power of ten at or above the peak. */
function axisTop(peak: number): number {
  if (peak <= 4) return 4
  const power = 10 ** Math.floor(Math.log10(peak))
  return [1, 2, 5, 10].map((step) => step * power).find((top) => peak <= top) ?? peak
}

interface GrowthPoint {
  readonly week_start: string
  readonly added: number
  readonly total: number
}

/** Running totals per week, worked back from today's total. */
function growth(total: number, weeks: readonly { week_start: string, added: number }[]): GrowthPoint[] {
  let running = total
  const points: GrowthPoint[] = []
  for (const week of [...weeks].reverse()) {
    points.unshift({ ...week, total: running })
    running -= week.added
  }
  return points
}

/*
A running total over the last 12 weeks. The line is an SVG stretched to the
box (non-scaling stroke); everything with a shape or a letter is HTML over it,
so nothing distorts at any width. Pointing at a week reads it out above.
*/
function GrowthChart({ points, tall = false, label }: {
  readonly points: readonly GrowthPoint[]
  readonly tall?: boolean
  readonly label: string
}): React.JSX.Element {
  const [pointed, setPointed] = useState<number | null>(null)
  const top = axisTop(Math.max(...points.map((point) => point.total)))
  const x = (index: number): number => ((index + 0.5) / points.length) * 100
  const y = (value: number): number => 100 - (value / top) * 100
  const shown = pointed ?? points.length - 1
  const at = points[shown]
  const first = points[0]
  const last = points[points.length - 1]
  if (at === undefined || first === undefined || last === undefined) return <></>

  return (
    <figure className="flex flex-col gap-1" aria-label={label}>
      <figcaption className="flex justify-between gap-4 text-xs text-muted-foreground tabular-nums">
        <span>{count.format(top)}</span>
        <span>
          {pointed === null
            ? 'Last 12 weeks'
            : `Week of ${weekLabel(at.week_start)}: ${count.format(at.total)} in all, ${count.format(at.added)} new`}
        </span>
      </figcaption>
      <div
        className={cn('relative border-y border-border', tall ? 'h-44' : 'h-24')}
        onPointerLeave={() => setPointed(null)}
      >
        <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-border" />
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <polyline
            fill="none"
            className="stroke-primary"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            points={points.map((point, index) => `${String(x(index))},${String(y(point.total))}`).join(' ')}
          />
        </svg>
        <span
          aria-hidden="true"
          className="absolute size-2 -translate-1/2 rounded-full bg-primary ring-2 ring-background"
          style={{ left: `${String(x(shown))}%`, top: `${String(y(at.total))}%` }}
        />
        <div className="absolute inset-0 flex">
          {points.map((point, index) => (
            <span
              key={point.week_start}
              className="flex-1"
              onPointerEnter={() => setPointed(index)}
              onPointerDown={() => setPointed(index)}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{weekLabel(first.week_start)}</span>
        <span>{weekLabel(last.week_start)}</span>
      </div>
    </figure>
  )
}

/* How many of everyone: a count, and a bar that is that share of all people. */
function Share({ label, value, of }: {
  readonly label: string
  readonly value: number
  readonly of: number
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <dt className="text-foreground">{label}</dt>
        <dd className="text-muted-foreground tabular-nums">
          <span className="text-foreground">{count.format(value)}</span> of {count.format(of)}
        </dd>
      </div>
      <div aria-hidden="true" className="h-1.5 rounded-full bg-hover">
        {value > 0 ? (
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${String(Math.min(100, Math.max(2, (value / Math.max(1, of)) * 100)))}%` }}
          />
        ) : null}
      </div>
    </div>
  )
}

function People({ people }: { readonly people: readonly StatsPerson[] }): React.JSX.Element {
  return (
    <section aria-label="Everyone" className="flex flex-col gap-2">
      <h2 className="text-sm font-section text-foreground">Everyone</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
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
  const people = growth(stats.people.total,
    stats.weeks.map((week) => ({ week_start: week.week_start, added: week.new_people })))
  const pages = growth(stats.work_pages.total,
    stats.weeks.map((week) => ({ week_start: week.week_start, added: week.new_work_pages })))
  return (
    <div className="flex flex-col gap-12 px-2">
      <section aria-label="People" className="flex flex-col gap-4">
        <div>
          <p className="text-(length:--text-title-size) leading-(--text-title-line) font-title text-foreground tabular-nums">
            {count.format(stats.people.total)}
          </p>
          <p className="text-sm text-muted-foreground">
            people on Dana, {count.format(stats.people.new_this_week)} joined this week
          </p>
        </div>
        <GrowthChart points={people} tall label="People on Dana over the last 12 weeks" />
      </section>

      <div className="grid gap-x-12 gap-y-12 md:grid-cols-2">
        <section aria-label="Active" className="flex flex-col gap-4">
          <h2 className="text-sm font-section text-foreground">Active</h2>
          <dl className="flex flex-col gap-4">
            <Share label="Last 24 hours" value={stats.active.day} of={stats.people.total} />
            <Share label="Last 7 days" value={stats.active.week} of={stats.people.total} />
            <Share label="Last 30 days" value={stats.active.month} of={stats.people.total} />
          </dl>
        </section>
        <section aria-label="Work pages" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-section text-foreground">Work pages</h2>
            <p className="text-sm text-muted-foreground tabular-nums">
              <span className="text-foreground">{count.format(stats.work_pages.total)}</span>
              {' '}in all, {count.format(stats.work_pages.new_this_week)} made this week
            </p>
          </div>
          <GrowthChart points={pages} label="Work pages over the last 12 weeks" />
        </section>
      </div>

      <People people={stats.people_list} />

      <p className="text-xs text-muted-foreground">
        Active means signed in and used Dana in that window; people who signed out are not counted
        until they return, and show as not active in 30 days. Work pages leave out each person’s Desk,
        the sample workspace and anything in the trash. Weeks start on Monday, UTC.
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
