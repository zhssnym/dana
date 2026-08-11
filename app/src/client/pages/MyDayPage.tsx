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
    <div>
      {/* 9.2 and 9.8: before anything else on the page the callback lands on. */}
      <PendingInviteList invites={invites.data ?? []} />
      <h1>My Day</h1>
      <p>{todayInBrowserZone()}</p>
      <label>
        <input
          type="checkbox"
          role="switch"
          checked={importantOnly}
          onChange={(event) => setImportantOnly(event.target.checked)}
        />
        Important only
      </label>

      <PageBody
        query={view}
        // Emptiness is the fetched groups rather than the filtered ones: the
        // filter is a view over rows that exist, and Q1's empty copy is about
        // a day with nothing on it.
        isEmpty={(view.data?.carried.length ?? 0) + (view.data?.today.length ?? 0) === 0}
        emptyCopy={MY_DAY_EMPTY}
        // Section 6's cap counts across a response's arrays rather than per
        // array (ruled 2026-08-07), which is why one flag serves three
        // sections and the notice sits above all of them.
        truncated={view.data?.truncated ?? false}
      >
        <PageSection name="Carried over" heading="Carried over">
          <TaskList tasks={carried} viewerId={viewerId} showPullMarker {...actions} />
        </PageSection>
        <PageSection name="Today" heading="Today">
          <TaskList tasks={today} viewerId={viewerId} showPullMarker {...actions} />
        </PageSection>
      </PageBody>

      {/* Q1R: the section is hidden entirely while empty, so it is absent
          rather than rendered with a zero. AC-158 reads that absence. */}
      {recap.length === 0 ? null : (
        <CollapsibleSection name={`Done today (${recap.length})`} defaultOpen={false}>
          <TaskList tasks={recap} viewerId={viewerId} {...actions} />
        </CollapsibleSection>
      )}
    </div>
  )
}
