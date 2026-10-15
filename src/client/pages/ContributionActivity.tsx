import { useState } from 'react'
import { Link } from 'react-router'

import { useContributionActivity } from '../api/profile-docs.js'

const HEADING = 'text-sm font-section text-foreground'

export function ContributionActivity({ folderId, userId }: {
  readonly folderId: string
  readonly userId: string
}): React.JSX.Element {
  const activity = useContributionActivity(folderId, userId)
  const [selected, setSelected] = useState<string | null>(null)
  const days = activity.data?.days ?? []
  const day = days.find((entry) => entry.date === selected)
  const first = days[0]
  const leading = first === undefined ? 0 : (new Date(`${first.date}T00:00:00Z`).getUTCDay() + 6) % 7
  const dateText = (date: string): string => new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
  return <section aria-label="Contribution activity" className="space-y-[var(--space-inline)]">
    <h3 className={HEADING}>Contribution activity</h3>
    {activity.isPending ? <p className="text-sm text-muted-foreground">Loading recorded activity…</p> : null}
    {activity.isError ? <p role="alert" className="text-sm text-destructive">Could not load activity.</p> : null}
    {activity.data ? <>
      <div className="max-w-full overflow-x-auto pb-1">
        <div className="grid w-max grid-flow-col grid-rows-7 gap-1" role="group" aria-label="Last 90 days of recorded activity">
          {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} aria-hidden="true"
            className="size-[var(--contribution-cell-size)]"/>)}
          {days.map((entry) => {
            const color = entry.count === 0 ? 'bg-muted' : entry.count === 1
              ? 'bg-[var(--contribution-low)]' : entry.count < 4
                ? 'bg-[var(--contribution-medium)]' : 'bg-[var(--contribution-high)]'
            const label = `${dateText(entry.date)}: ${entry.count} recorded ${entry.count === 1 ? 'action' : 'actions'}`
            return <button key={entry.date} type="button" title={label} aria-label={label}
              aria-pressed={selected === entry.date}
              onFocus={() => setSelected(entry.date)}
              onMouseEnter={() => setSelected(entry.date)}
              onClick={() => setSelected(entry.date)}
              className={`size-[var(--contribution-cell-size)] rounded-xs ${color} outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring`}/>
          })}
        </div>
      </div>
      {day ? <div className="text-xs text-muted-foreground" aria-live="polite">
        <p className="font-section text-foreground">{dateText(day.date)} · {day.count} recorded {day.count === 1 ? 'action' : 'actions'}</p>
        {day.categories.length ? <p>{day.categories.map((item) => `${item.name} ${item.count}`).join(' · ')}</p> : null}
        {day.references.length ? <ul className="mt-1 space-y-1">
          {day.references.map((reference) => <li key={`${reference.kind}:${reference.id}`}>
            <Link className="text-foreground underline underline-offset-2" to={reference.kind === 'task'
              ? `/app/tasks/${reference.id}` : `/app/folders/${reference.id}`}>
              {reference.name}
            </Link>
          </li>)}
        </ul> : null}
      </div> : days.every((entry) => entry.count === 0)
        ? <p className="text-xs text-muted-foreground">No recorded activity is available for these 90 days.</p>
        : <p className="text-xs text-muted-foreground">Select a day for details.</p>}
      <p className="text-xs text-muted-foreground">
        Dates use UTC. Only recorded actions on content you can still view appear.
      </p>
    </> : null}
  </section>
}
