/*
9.5's Planned page.

The list and calendar modes are one page, not two: 9.1's route table says so
outright and gives the pair one path, and the choice is persisted per user
client-side. `localStorage` is that persistence, and it is the only thing this
client stores on the device; 10.6 forbids an offline data mirror and this is a
preference rather than data.

**The calendar itself is not this session's.** Q3C's grid, the FullCalendar 7
wiring of 11.4, the ghost rows and the cell order all belong to the Complex
Interaction engineer. What is here is the mode toggle 9.5 requires, the list
mode, and a named place for the grid to land, so the toggle is a real control
rather than one that appears when its target does.
*/
import { useState } from 'react'

import { useMe, useMultiMemberFolderIds, usePlannedView } from '../api/queries.js'
import { todayInBrowserZone } from '../api/tz.js'
import { QuickAddRow } from '../parts/QuickAddRow.js'
import { TaskList } from '../parts/TaskRow.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageBody } from '../states/PageStates.js'
import { PLANNED_EMPTY } from './empty-states.js'

const MODE_KEY = 'dana.planned.mode'

type Mode = 'list' | 'calendar'

function storedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'calendar' ? 'calendar' : 'list'
  } catch {
    // Storage can be unavailable (private modes, blocked cookies). A
    // preference that cannot be saved is still a preference for this session.
    return 'list'
  }
}

export function PlannedPage(): React.JSX.Element {
  const view = usePlannedView()
  const me = useMe()
  const actions = useRowActions()
  const multiMember = useMultiMemberFolderIds()
  const [mode, setMode] = useState<Mode>(storedMode)

  function choose(next: Mode): void {
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // See storedMode: unavailable storage costs the persistence, not the mode.
    }
  }

  return (
    <div>
      <h1>Planned</h1>
      <button type="button" aria-pressed={mode === 'list'} onClick={() => choose('list')}>
        List
      </button>
      <button
        type="button"
        aria-pressed={mode === 'calendar'}
        onClick={() => choose('calendar')}
      >
        Calendar
      </button>

      {mode === 'calendar' ? (
        // Q3C's grid arrives with the Complex Interaction engineer's session.
        // Nothing is asserted about this placeholder; it is here so the toggle
        // above is not a control that leads nowhere.
        <div data-planned-calendar-slot="" />
      ) : (
        <>
          <PageBody
            query={view}
            isEmpty={(view.data?.rows.length ?? 0) === 0}
            emptyCopy={PLANNED_EMPTY}
          >
            <TaskList
              tasks={view.data?.rows ?? []}
              viewerId={me.data?.user.id ?? null}
              multiMemberFolders={multiMember}
              {...actions}
            />
          </PageBody>
          {/* 9.1 puts the quick-add row at the bottom of the Planned list, and
              9.3's table gives that entry point due date today. */}
          <QuickAddRow defaults={{ due_date: todayInBrowserZone() }} />
        </>
      )}
    </div>
  )
}
