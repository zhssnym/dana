/*
9.4. Header with the date, the important-only toggle, the Carried and Today
groups, and the recap at the bottom.

The three region names are 9.1's table, exactly as the headings read, the
count included: "Carried over", "Today", and "Done today (N)".

The important-only toggle is a client-side filter over rows already fetched,
which is Q1's own sentence: "it changes no query". AC-167 measures that from
the wire, so a toggle that refetched would fail it while looking correct.
*/
import { useMemo, useState } from 'react'
import { CalendarCheck2 } from 'lucide-react'

import type { TaskCard } from '../../shared/tasks.js'
import { useMe, useMyDayView, usePendingInvites } from '../api/queries.js'
import { todayInBrowserZone } from '../api/tz.js'
import { TaskList } from '../components/ui/index.js'
import { useRowActions } from '../parts/useRowActions.js'
import { CollapsibleSection, PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { MY_DAY_EMPTY } from './empty-states.js'
import { PendingInviteList } from './PendingInvites.js'

function onlyImportant(rows: readonly TaskCard[], on: boolean): readonly TaskCard[] {
  return on ? rows.filter((row) => row.important) : rows
}

export function MyDayPage(): React.JSX.Element {
  const view = useMyDayView()
  const me = useMe()
  /*
  The second read this page declares, and the reason it is this page's.

  9.2 lands first-run on My Day and adds "pending invites, when any exist,
  surface first as 9.8 describes", so Q12 is a fact about the page the
  callback opens rather than about the chrome. The list renders above
  everything else here and renders nothing at all while Q12 is empty, which is
  what 9.8 conditions the whole surface on.
  */
  const invites = usePendingInvites()
  const actions = useRowActions()
  const [importantOnly, setImportantOnly] = useState(false)
  const viewerId = me.data?.user.id ?? null

  const carried = useMemo(
    () => onlyImportant(view.data?.carried ?? [], importantOnly),
    [view.data, importantOnly],
  )
  const today = useMemo(
    () => onlyImportant(view.data?.today ?? [], importantOnly),
    [view.data, importantOnly],
  )
  const recap = view.data?.recap ?? []

  return (
    <div className="space-y-6">
      {/* 9.2 and 9.8: before anything else on the page the callback lands on. */}
      <PendingInviteList invites={invites.data ?? []} />
      <header className="page-header">
        <div>
          <h1 className="page-title">My Day</h1>
          <p className="meta">{todayInBrowserZone()}</p>
        </div>
        {/*
        9.4's important-only filter, still the native checkbox with
        `role="switch"` it has always been. The design draws a switch and the
        vocabulary carries `switch-track` and `switch-thumb` for one, but those
        want a two-element control whose state is an explicit `aria-checked`,
        which a native checkbox cannot give them: its checked state is implicit
        and a stylesheet cannot read it. Restyling this into a button would
        change the element behind a role AC-167 drives, which this package does
        not do, so the box takes the design's checkbox treatment and the switch
        treatment is recorded for the next Component session.
        */}
        <label className="flex items-center gap-2 text-label">
          <input
            type="checkbox"
            className="checkbox"
            role="switch"
            checked={importantOnly}
            onChange={(event) => setImportantOnly(event.target.checked)}
          />
          Important only
        </label>
      </header>

      <PageBody
        query={view}
        // Emptiness is the fetched groups rather than the filtered ones: the
        // filter is a view over rows that exist, and Q1's empty copy is about
        // a day with nothing on it.
        isEmpty={(view.data?.carried.length ?? 0) + (view.data?.today.length ?? 0) === 0}
        emptyCopy={MY_DAY_EMPTY}
        emptyIcon={CalendarCheck2}
        // Section 6's cap counts across a response's arrays rather than per
        // array (ruled 2026-08-07), which is why one flag serves three
        // sections and the notice sits above all of them.
        truncated={view.data?.truncated ?? false}
      >
        <div className="space-y-6">
          <PageSection name="Carried over" heading="Carried over">
            <div className="list-card">
              <TaskList tasks={carried} viewerId={viewerId} showPullMarker {...actions} />
            </div>
          </PageSection>
          <PageSection name="Today" heading="Today">
            <div className="list-card">
              <TaskList tasks={today} viewerId={viewerId} showPullMarker {...actions} />
            </div>
          </PageSection>
        </div>
      </PageBody>

      {/* Q1R: the section is hidden entirely while empty, so it is absent
          rather than rendered with a zero. AC-158 reads that absence. */}
      {recap.length === 0 ? null : (
        <CollapsibleSection name={`Done today (${recap.length})`} defaultOpen={false}>
          <div className="list-card">
            <TaskList tasks={recap} viewerId={viewerId} {...actions} />
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}
