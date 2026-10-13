/*
 * Operator stats, in no menu. The server answers 404 to non-operators, which shows the ordinary Not found. The
 * Privacy page says what operators see, so the two change together.
 */
import { useState } from 'react'

import type { GetStatsResponse, StatsPerson, StatsSource } from '../../shared/stats.js'
import { ApiError } from '../api/http.js'
import { useStats } from '../api/stats.js'
import { HEARD_ABOUT_LABELS } from '../components/feedback/HeardAboutDialog.js'
import type { HeardAbout } from '../../shared/feedback.js'
import { FeedbackBoard } from '../components/feedback/FeedbackBoard.js'
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

type SortKey = 'email' | 'source' | 'heard' | 'joined' | 'active' | 'pages' | 'tasks'

interface Column {
  readonly key: SortKey
  readonly label: string
  readonly value: (person: StatsPerson) => string | number
  readonly show: (person: StatsPerson) => React.ReactNode
  readonly numeric?: boolean
  readonly hide?: string
  /** Long text wraps instead of widening the table. */
  readonly wrap?: boolean
}

const COLUMNS: readonly Column[] = [
  { key: 'source', label: 'Source', value: (p) => p.source, show: (p) => p.source, hide: 'max-sm:hidden' },
  { key: 'heard', label: 'Heard about Dana', value: (p) => heardLabel(p.heard_about), show: (p) => heardLabel(p.heard_about), hide: 'max-lg:hidden', wrap: true },
  { key: 'joined', label: 'Joined', value: (p) => p.joined_on, show: (p) => dayLabel(p.joined_on), hide: 'max-sm:hidden' },
  { key: 'active', label: 'Last active', value: (p) => p.last_active_on ?? '', show: (p) => (p.last_active_on === null ? 'Not in 30 days' : dayLabel(p.last_active_on)) },
  { key: 'pages', label: 'Pages', value: (p) => p.pages_total, show: (p) => count.format(p.pages_total), numeric: true },
  { key: 'tasks', label: 'Tasks', value: (p) => p.tasks_total, show: (p) => count.format(p.tasks_total), numeric: true },
]

const EMAIL: Column = { key: 'email', label: 'Email', value: (p) => p.email ?? '', show: (p) => p.email ?? 'No email' }

function People({ people }: { readonly people: readonly StatsPerson[] }): React.JSX.Element {
  // Null keeps the server order: most recently active first.
  const [sort, setSort] = useState<{ key: SortKey, up: boolean } | null>(null)
  const column = [EMAIL, ...COLUMNS].find((found) => found.key === sort?.key)
  const rows = column === undefined || sort === null ? people : [...people].sort((a, b) => {
    const x = column.value(a)
    const y = column.value(b)
    const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    return sort.up ? order : -order
  })

  function header(col: Column, className: string): React.JSX.Element {
    const active = sort?.key === col.key
    return (
      <th scope="col" key={col.key} className={className}
        aria-sort={active ? (sort.up ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className={cn('inline-flex items-center gap-1 rounded-sm font-normal whitespace-nowrap hover:text-foreground',
            active && 'text-foreground')}
          // Numbers sort highest first on the first click; text sorts A to Z.
          onClick={() => setSort(active ? { key: col.key, up: !sort.up } : { key: col.key, up: col.numeric !== true })}
        >
          {col.label}
          <span aria-hidden="true" className={cn(!active && 'invisible')}>{sort?.up === true ? '↑' : '↓'}</span>
        </button>
      </th>
    )
  }

  return (
    <section aria-label="Everyone" className="flex flex-col gap-2">
      <h2 className="text-sm font-section text-foreground">Everyone</h2>
      <p className="text-xs text-muted-foreground">Click a column name to sort. Click again to reverse.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {header(EMAIL, 'w-full min-w-32 py-1.5 pr-3')}
              {COLUMNS.map((col) => header(col, cn('py-1.5 pr-3', col.numeric === true && 'text-right', col.hide)))}
            </tr>
          </thead>
          <tbody>
            {rows.map((person, index) => (
              <tr key={person.email ?? `no-email-${String(index)}`}>
                <th scope="row" title={person.email ?? undefined}
                  className="max-w-0 min-w-32 truncate py-1.5 pr-3 text-left font-normal text-foreground">
                  {EMAIL.show(person)}
                </th>
                {COLUMNS.map((col) => (
                  <td key={col.key} className={cn('py-1.5 pr-3', col.wrap === true ? 'max-w-40' : 'whitespace-nowrap',
                    col.numeric === true ? 'text-right text-foreground tabular-nums' : 'text-muted-foreground', col.hide)}>
                    {col.show(person)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const ACTION_WORD: Record<string, string> = {
  task_created: 'Made a task',
  task_completed: 'Completed a task',
  page_created: 'Made a page',
  edit: 'Changed a task or page',
  comment: 'Wrote a comment',
  message: 'Sent a private message',
  upload: 'Uploaded a file',
  invite: 'Invited someone',
}

/** Plain bars; each bar's number shows on hover and to screen readers. */
function Bars({ values, labels, label, tall = false }: {
  readonly values: readonly number[]
  readonly labels: readonly string[]
  readonly label: string
  readonly tall?: boolean
}): React.JSX.Element {
  const top = Math.max(1, ...values)
  return (
    <figure className="flex flex-col gap-1" aria-label={label}>
      <div className={cn('flex items-end gap-0.5 border-b border-border', tall ? 'h-32' : 'h-20')}>
        {values.map((value, index) => (
          <div key={labels[index]} className="flex h-full flex-1 items-end" title={`${labels[index] ?? ''}: ${count.format(value)}`}>
            <div className="w-full rounded-t-sm bg-primary" style={{ height: `${String((value / top) * 100)}%` }} />
            <span className="sr-only">{labels[index]}: {value}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </figure>
  )
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const percent = (part: number, whole: number): string => (whole === 0 ? '–' : `${String(Math.round((part / whole) * 100))}%`)

function Usage({ stats }: { readonly stats: GetStatsResponse }): React.JSX.Element {
  const usage = stats.usage
  return (
    <>
      <section aria-label="What people do" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-section text-foreground">What people do, last 30 days</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="text-foreground">{count.format(stats.totals.pages)}</span> pages and{' '}
            <span className="text-foreground">{count.format(stats.totals.tasks)}</span> tasks in all
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="w-full py-1.5 pr-4 font-normal">Action</th>
              <th scope="col" className="py-1.5 pr-4 text-right font-normal whitespace-nowrap">Times</th>
              <th scope="col" className="py-1.5 text-right font-normal whitespace-nowrap">People</th>
            </tr>
          </thead>
          <tbody>
            {usage.actions.map((row) => (
              <tr key={row.what}>
                <th scope="row" className="py-1.5 pr-4 text-left font-normal text-foreground">{ACTION_WORD[row.what] ?? row.what}</th>
                <td className="py-1.5 pr-4 text-right text-foreground tabular-nums">{count.format(row.times)}</td>
                <td className="py-1.5 text-right text-muted-foreground tabular-nums">{count.format(row.people)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-label="People who did something each day" className="flex flex-col gap-2">
        <h2 className="text-sm font-section text-foreground">People who did something each day</h2>
        <Bars tall label="People who did something each day, last 30 days"
          values={usage.days.map((day) => day.people)} labels={usage.days.map((day) => dayLabel(day.day))} />
      </section>

      <div className="grid gap-x-12 gap-y-12 md:grid-cols-2">
        <section aria-label="Time of day" className="flex flex-col gap-2">
          <h2 className="text-sm font-section text-foreground">Time of day</h2>
          <Bars label="Actions by hour, in each person's own time zone"
            values={usage.hours} labels={usage.hours.map((_, hour) => `${String(hour).padStart(2, '0')}:00`)} />
        </section>
        <section aria-label="Day of the week" className="flex flex-col gap-2">
          <h2 className="text-sm font-section text-foreground">Day of the week</h2>
          <Bars label="Actions by day of the week" values={usage.weekdays} labels={WEEKDAYS} />
        </section>
      </div>

      <section aria-label="Do new people come back" className="flex flex-col gap-2">
        <h2 className="text-sm font-section text-foreground">Do new people come back?</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="w-full py-1.5 pr-4 font-normal">Joined in the week of</th>
                <th scope="col" className="py-1.5 pr-4 text-right font-normal whitespace-nowrap">Joined</th>
                <th scope="col" className="py-1.5 pr-4 text-right font-normal whitespace-nowrap">Came back after day one</th>
                <th scope="col" className="py-1.5 text-right font-normal whitespace-nowrap">Used it in the last 7 days</th>
              </tr>
            </thead>
            <tbody>
              {[...usage.cohorts].reverse().map((row) => (
                <tr key={row.week_start}>
                  <th scope="row" className="py-1.5 pr-4 text-left font-normal whitespace-nowrap text-foreground">{weekLabel(row.week_start)}</th>
                  <td className="py-1.5 pr-4 text-right text-foreground tabular-nums">{count.format(row.joined)}</td>
                  <td className="py-1.5 pr-4 text-right text-foreground tabular-nums">{percent(row.came_back, row.joined)}</td>
                  <td className="py-1.5 text-right text-foreground tabular-nums">{percent(row.active_week, row.joined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
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

      <Usage stats={stats} />

      <div className="grid gap-x-12 gap-y-12 md:grid-cols-2">
        <Sources sources={stats.sources} />
        <HeardAboutTable rows={stats.heard_about} />
      </div>

      <People people={stats.people_list} />

      <p className="text-xs text-muted-foreground">
        Active means signed in and used Dana in that window; people who signed out are not counted
        until they return, and show as not active in 30 days. Work pages leave out each person’s Desk
        and anything archived or in the trash. Weeks start on Monday, UTC. Actions are tasks and pages made, changed or completed, comments, private messages, uploads and invites. Pages and Tasks count everything a person made that is not in the trash. Source is the first tagged link (utm_source or ref), then an invite, then the site that linked to Dana, else direct; unknown means the person joined before Dana kept this.
      </p>
    </div>
  )
}

export function StatsPage(): React.JSX.Element {
  const stats = useStats()
  const [view, setView] = useState<'numbers' | 'feedback'>('numbers')
  if (stats.error instanceof ApiError && stats.error.status === 404) return <NotFoundPage />
  // No heading until the server answers, so a non-operator sees nothing before "not found".
  if (stats.isPending) return <SkeletonList />
  return (
    // Full width, wider than the page column: the shell's scroll region is a container, so 100cqw is its width.
    <div className="relative left-1/2 w-[calc(100cqw-2rem)] -translate-x-1/2 md:w-[calc(100cqw-5rem)]">
    <Screen title="Stats" description="Accounts with an email, and how each uses Dana. Counts only: no page names or content.">
      <Segmented
        label="Show"
        value={view}
        options={[{ value: 'numbers', label: 'Numbers' }, { value: 'feedback', label: 'Feedback' }]}
        onValueChange={setView}
        className="mx-2 mb-8 self-start"
      />
      {view === 'feedback' ? <FeedbackBoard /> : (
        <>
          {stats.isError ? <InlineError onRetry={() => { void stats.refetch() }} /> : null}
          {stats.data === undefined ? null : <Stats stats={stats.data} />}
        </>
      )}
    </Screen>
    </div>
  )
}
