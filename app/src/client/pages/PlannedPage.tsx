/*
9.5's Planned page.

The designer's `src/screens/planned-screen.tsx`, ported at P8R session R6: his
header, his mode switch and his list. **His calendar is not ported here and is
deliberately left alone.** Q3C's grid, its roles, its "+N more" control and the
ghost rows are the Complex Interaction engineer's and arrive at R9, so this
page keeps the named place R5's predecessor left for it and swaps the mount
when that session lands.

The list and calendar modes are one page, not two: 9.1's route table says so
outright and gives the pair one path, and the choice is persisted per user
client-side. `localStorage` is that persistence, and it is the only thing this
client stores on the device; 10.6 forbids an offline data mirror and this is a
preference rather than data.

**The quick-add's label is 9.1's and not his.** His Planned list draws the
control reading "Add scheduled task", which is a second name for the one
affordance 9.1's control table calls "Add a task" collapsed and expanded alike,
and AC-166 addresses both states by that name exactly. So the label is the
component's default and this page passes none.
*/
import { useState } from 'react'
import { CalendarDays, List } from 'lucide-react'

import { useCreateTask } from '../api/mutations.js'
import { useMultiMemberFolderIds, usePlannedView } from '../api/queries.js'
import { PlannedCalendar } from '../components/calendar/index.js'
import { QuickAdd } from '../components/quick-add.js'
import { Button } from '../components/ui/button.js'
import { cn } from '../components/ui/utils.js'
import { useRowActions } from '../parts/useRowActions.js'
import { openTaskForm } from '../shell/overlays.js'
import { PageBody } from '../states/PageStates.js'
import { PLANNED_EMPTY } from './empty-states.js'
import { PageHeading } from './page-heading.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'

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

/**
 * 9.5's two modes, drawn as his segmented pair: the one you are in takes the
 * raised treatment and the other the quiet one, so the current mode is legible
 * without reading either label. `aria-pressed` is what actually carries it and
 * is untouched, which is why the tone is a second cue and never the only one.
 */
function ModeSwitch({
  mode,
  onChange,
}: {
  readonly mode: Mode
  readonly onChange: (mode: Mode) => void
}): React.JSX.Element {
  const base =
    'h-[var(--control-height)] gap-1.5 rounded-md px-3 text-[13px] font-medium text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)]'
  const active =
    'bg-white text-[var(--color-graphite-900)] ring-1 ring-[var(--color-graphite-200)] hover:bg-white'
  return (
    <div
      className="flex h-11 shrink-0 items-center rounded-lg border border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)] p-0.5"
      role="group"
      aria-label="Planned view"
    >
      <Button
        variant="ghost"
        className={cn(base, mode === 'list' && active)}
        aria-pressed={mode === 'list'}
        onClick={() => onChange('list')}
      >
        <List className="size-4" strokeWidth={1.75} aria-hidden="true" />
        List
      </Button>
      <Button
        variant="ghost"
        className={cn(base, mode === 'calendar' && active)}
        aria-pressed={mode === 'calendar'}
        onClick={() => onChange('calendar')}
      >
        <CalendarDays className="size-4" strokeWidth={1.75} aria-hidden="true" />
        Calendar
      </Button>
    </div>
  )
}

export function PlannedPage(): React.JSX.Element {
  const view = usePlannedView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  const create = useCreateTask()
  const multiMemberFolderIds = useMultiMemberFolderIds()
  const [mode, setMode] = useState<Mode>(storedMode)

  function choose(next: Mode): void {
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // See storedMode: unavailable storage costs the persistence, not the mode.
    }
  }

  // 9.3's entry point for this page: the list's quick-add and its floating
  // button both open dated today, because the page a person is standing on is
  // about that date.
  const dated = { due_date: basis.today }

  return (
    <div className="space-y-7">
      <PageHeading
        icon={CalendarDays}
        title="Planned"
        subtitle="Tasks with a due date"
        actions={<ModeSwitch mode={mode} onChange={choose} />}
      />

      {mode === 'calendar' ? (
        // The named place the shell session left for Q3C's grid, filled by the
        // Complex Interaction session. Everything about the calendar, its
        // range request included, is inside that component; this page decides
        // only which of the two modes 9.5 gives it is showing.
        <PlannedCalendar />
      ) : (
        <div>
          <PageBody
            query={view}
            isEmpty={(view.data?.rows.length ?? 0) === 0}
            emptyCopy={PLANNED_EMPTY}
            emptyIcon={CalendarDays}
            truncated={view.data?.truncated ?? false}
          >
            <TaskRows
              tasks={view.data?.rows ?? []}
              context={{ ...basis, multiMemberFolderIds }}
              actions={actions}
              onAsk={confirm.ask}
            />
          </PageBody>
          {/* 9.1 puts the quick-add at the bottom of the Planned list, and
              9.3's table gives that entry point due date today. */}
          <QuickAdd
            folderName="Inbox"
            onAdd={(title) => {
              create.mutate({ title, ...dated })
            }}
            onOpenFullForm={() => {
              openTaskForm(dated)
            }}
          />
        </div>
      )}

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
