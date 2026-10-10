/*
 * Operator stats, in no menu. The server answers 404 to non-operators, which shows the ordinary Not found. The
 * Privacy page says what operators see, so the two change together.
 */
import { useState } from 'react'

import type { GetStatsResponse, StatsPerson, StatsSource } from '../../shared/stats.js'
import { ApiError } from '../api/http.js'
import { useFeedback, useSetFeedbackDone } from '../api/feedback.js'
import { useStats } from '../api/stats.js'
import { HEARD_ABOUT_LABELS } from '../components/feedback/HeardAboutDialog.js'
import type { HeardAbout } from '../../shared/feedback.js'
import { PostView } from '../components/thread/PostView.js'
import { Button } from '../components/ui/button.js'
import { Segmented } from '../components/ui/segmented.js'
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

/* The line is an SVG stretched to the box (non-scaling stroke); text is HTML over it, so nothing distorts. */
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

function Sources({ sources }: { readonly sources: readonly StatsSource[] }): React.JSX.Element {
  return (
    <section aria-label="Where people came from" className="flex flex-col gap-2">
      <h2 className="text-sm font-section text-foreground">Where people came from</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="w-full py-1.5 pr-4 font-normal">Source</th>
            <th scope="col" className="py-1.5 pr-4 text-right font-normal whitespace-nowrap">People</th>
            <th scope="col" className="py-1.5 text-right font-normal whitespace-nowrap">Active in 30 days</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((row) => (
            <tr key={row.source}>
              <th scope="row" className="max-w-0 truncate py-1.5 pr-4 text-left font-normal text-foreground">{row.source}</th>
              <td className="py-1.5 pr-4 text-right text-foreground tabular-nums">{count.format(row.people)}</td>
              <td className="py-1.5 text-right text-muted-foreground tabular-nums">{count.format(row.active_month)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

const heardLabel = (answer: string | null): string =>
  answer === null ? 'Not asked yet' : HEARD_ABOUT_LABELS[answer as HeardAbout] ?? answer

function HeardAboutTable({ rows }: { readonly rows: GetStatsResponse['heard_about'] }): React.JSX.Element {
  return (
    <section aria-label="How they heard about Dana" className="flex flex-col gap-2">
      <h2 className="text-sm font-section text-foreground">How they heard about Dana</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No answers yet.</p> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="w-full py-1.5 pr-4 font-normal">Their answer</th>
              <th scope="col" className="py-1.5 text-right font-normal whitespace-nowrap">People</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.answer}>
                <th scope="row" className="py-1.5 pr-4 text-left font-normal text-foreground">{heardLabel(row.answer)}</th>
                <td className="py-1.5 text-right text-foreground tabular-nums">{count.format(row.people)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
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
              <th scope="col" className="py-1.5 pr-4 font-normal whitespace-nowrap max-sm:hidden">Source</th>
              <th scope="col" className="py-1.5 pr-4 font-normal whitespace-nowrap max-md:hidden">Heard about Dana</th>
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
                <td className="py-1.5 pr-4 whitespace-nowrap text-muted-foreground max-sm:hidden">{person.source}</td>
                <td className="py-1.5 pr-4 whitespace-nowrap text-muted-foreground max-md:hidden">{heardLabel(person.heard_about)}</td>
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
            {count.format(stats.active.week)}
          </p>
          <p className="text-sm text-muted-foreground">
            active in the last 7 days, of {count.format(stats.people.total)} people on Dana.{' '}
            {count.format(stats.people.new_this_week)} joined this week.
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

      <div className="grid gap-x-12 gap-y-12 md:grid-cols-2">
        <Sources sources={stats.sources} />
        <HeardAboutTable rows={stats.heard_about} />
      </div>

      <People people={stats.people_list} />

      <p className="text-xs text-muted-foreground">
        Active means signed in and used Dana in that window; people who signed out are not counted
        until they return, and show as not active in 30 days. Work pages leave out each person’s Desk,
        the sample workspace and anything archived or in the trash. Weeks start on Monday, UTC. Source is the first tagged link (utm_source or ref), then an invite, then the site that linked to Dana, else direct; unknown means the person joined before Dana kept this.
      </p>
    </div>
  )
}

const KIND_WORD = { bug: 'Problem', idea: 'Idea', other: 'Other' } as const

function Feedback(): React.JSX.Element {
  const feedback = useFeedback()
  const setDone = useSetFeedbackDone()
  if (feedback.isPending) return <SkeletonList />
  if (feedback.isError) return <InlineError onRetry={() => { void feedback.refetch() }} />
  if (feedback.data.items.length === 0) return <p className="px-2 text-sm text-muted-foreground">No feedback yet.</p>
  return (
    <ul className="flex flex-col gap-6 px-2">
      {feedback.data.items.map((item) => (
        <li key={item.id} className={cn('flex flex-col gap-2 border-b border-border pb-6', item.done && 'opacity-60')}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-section text-foreground">{KIND_WORD[item.kind]}</span>
            <span>{item.display_name ?? item.email ?? 'No name'}{item.email === null ? '' : ` (${item.email})`}</span>
            <span className="tabular-nums">{new Date(item.created_at).toLocaleString()}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={setDone.isPending}
              onClick={() => setDone.mutate({ id: item.id, done: !item.done })}
            >
              {item.done ? 'Mark as open' : 'Mark as done'}
            </Button>
          </div>
          <PostView content={item.content} body={null} files={item.files} />
          <p className="text-xs break-all text-muted-foreground">
            {item.context.path} · {item.context.viewport} · {item.context.theme} · {item.context.user_agent}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function StatsPage(): React.JSX.Element {
  const stats = useStats()
  const [view, setView] = useState<'numbers' | 'feedback'>('numbers')
  if (stats.error instanceof ApiError && stats.error.status === 404) return <NotFoundPage />
  // No heading until the server answers, so a non-operator sees nothing before "not found".
  if (stats.isPending) return <SkeletonList />
  return (
    <Screen title="Stats" description="Accounts with an email, and how much each uses Dana. No page names or content.">
      <Segmented
        label="Show"
        value={view}
        options={[{ value: 'numbers', label: 'Numbers' }, { value: 'feedback', label: 'Feedback' }]}
        onValueChange={setView}
        className="mx-2 mb-8 self-start"
      />
      {view === 'feedback' ? <Feedback /> : (
        <>
          {stats.isError ? <InlineError onRetry={() => { void stats.refetch() }} /> : null}
          {stats.data === undefined ? null : <Stats stats={stats.data} />}
        </>
      )}
    </Screen>
  )
}
