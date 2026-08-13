/*
9.5's Done page: day-grouped rows per Q6, each with "Mark as not done", and no
add affordance anywhere on this page.

That last clause is a criterion of its own (AC-096) and it is a rule about
absence, which is the kind an implementation breaks by being consistent
elsewhere: the floating add button of 9.1 is on every other page and the
quick-add is on three of them. The button is suppressed by the layout, which is
where "every page except Done" belongs; this file simply has no quick-add.

9.1's region table names Done's regions by the day each one groups, and adds
that where a region's name comes from data rather than from the section, a test
addresses it by the text the page rendered. The format of a date is the
design's and section 9 has never spelled one, so the region's name here is the
date exactly as the row carries it.

**The row is this file's own rather than `components/task-row.tsx`, and that is
the one thing here worth reading twice.** Every other page hands its rows to
that component, whose control for a completed row is the completion checkbox
9.1's names table calls "Mark as not done". 9.5 gives this page a named
affordance that does something a checkbox cannot: on the G-SERIES successor
branch it confirms first, about a row nobody can see. A checkbox that sometimes
opens a dialog would be that behaviour hidden inside the one control every
other page uses unconditionally, and AC-162 addresses this one as a button. So
the row is composed here from the same primitives his row is composed from, in
his class strings, and the affordance 9.5 names is a named control. The tension
between that criterion and 9.1's names table is real and is escalated in this
session's report rather than resolved by either side going red.

**A completed row opens its form**, which 9.4 gained at the P8R change control
on 2026-08-13: a row opens that task's form on every page that draws one and
whatever the task's status. That is how 9.3's history block and its completion
control are reached, and AC-178 and AC-179 reach them here.

Q6's pagination is 9.5's infinite scroll, and it arrives here rather than in
the page: `useDoneView` is an infinite query, the cursor is handed back byte
for byte (7.10), and `mergeCompletedDays` puts a day split across two pages
back into one region, because two regions cannot carry one name.
*/
import { useEffect, useState } from 'react'
import { Check, CircleCheck, Folder as FolderIcon, RotateCcw, Star } from 'lucide-react'

import { mergeCompletedDays, useDoneView, useTask } from '../api/queries.js'
import { useTransitionTask } from '../api/mutations.js'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog.js'
import { Button } from '../components/ui/button.js'
import { MARK_AS_NOT_DONE, STAR_OFF, STAR_ON } from '../components/ui/copy.js'
import { Item, ItemContent, ItemMedia, ItemTitle } from '../components/ui/item.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip.js'
import { cn } from '../components/ui/utils.js'
import { dueDisplay, folderDisplay } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import { MorePages, PageBody } from '../states/PageStates.js'
import { PageSection } from '../states/PageSection.js'
import { DONE_EMPTY } from './empty-states.js'
import { PageHeading } from './page-heading.js'
import { useRowBasis } from './task-rows.js'
import type { Folder } from '../../shared/folders.js'
import type { TaskCard } from '../../shared/tasks.js'

/**
 * 9.5's confirm before an un-complete that takes the G-SERIES successor
 * branch. Copy is normative; the parenthesis is the part the person cannot
 * see, because 5.1 deletes the successor with any edits already made to it.
 */
const UNCOMPLETE_SERIES_CONFIRM =
  'This removes the next scheduled occurrence (including any edits to it). Continue?'

/** His resting treatment for a row's action controls, transparent until hover. */
const REVEAL_ON_ROW_HOVER =
  'opacity-0 group-hover/task:opacity-100 group-focus-within/task:opacity-100 focus-visible:opacity-100'

function DoneRow({
  task,
  today,
  folders,
  onOpen,
  onToggleImportant,
  onMarkNotDone,
}: {
  readonly task: TaskCard
  readonly today: string
  readonly folders: readonly Folder[]
  readonly onOpen: () => void
  readonly onToggleImportant: () => void
  readonly onMarkNotDone: () => void
}): React.JSX.Element {
  const folder = folderDisplay(task.folder, folders)
  const due = dueDisplay(task, today)
  const starName = task.important ? STAR_ON : STAR_OFF

  return (
    <Item
      // 9.1's roles table: a task row is a list item or a row, and 9.4
      // enumerates what one holds. The list around it is this page's.
      role="listitem"
      tabIndex={0}
      aria-label={`Open task: ${task.title}`}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('button, [role=button], [role=checkbox], [role=menuitem], input')) return
        onOpen()
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      data-task-status="completed"
      className="group/task grid h-[var(--task-row-height)] w-full cursor-pointer grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center gap-0 overflow-hidden rounded-md border-0 bg-card p-0 transition-[background-color] hover:bg-[var(--color-graphite-100)] focus-within:bg-[var(--color-graphite-100)] focus-within:ring-2 focus-within:ring-ring/30"
    >
      <ItemMedia className="size-[var(--control-height)]">
        <span
          role="img"
          aria-label="Completed task"
          className="flex size-[var(--control-height)] items-center justify-center text-[var(--color-graphite-500)]"
        >
          <Check className="size-5" strokeWidth={2} aria-hidden="true" />
        </span>
      </ItemMedia>

      <ItemContent className="min-w-0 flex-row items-center gap-0 pr-2">
        <ItemTitle
          className="min-w-0 shrink truncate text-sm leading-5 font-normal text-[var(--color-graphite-600)]"
          title={task.title}
        >
          {task.title}
        </ItemTitle>
        {/* 9.5's own name for the un-complete affordance Q6 lists on every
            row, drawn where his abandoned row draws "Restore". */}
        <Button
          variant="ghost"
          className="h-[var(--control-height)] shrink-0 px-2 text-sm hover:!bg-transparent"
          onClick={onMarkNotDone}
        >
          <RotateCcw
            data-icon="inline-start"
            className="size-4"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {MARK_AS_NOT_DONE}
        </Button>
      </ItemContent>

      <div
        data-task-metadata
        className="flex min-w-0 shrink-0 items-center justify-end gap-3 whitespace-nowrap pr-2 pl-4 text-xs text-[var(--color-graphite-400)]"
      >
        <span className="inline-flex min-w-0 shrink-0 items-center gap-2">
          <FolderIcon
            className="size-4 shrink-0"
            style={{ color: folder.color }}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="truncate">{folder.name}</span>
        </span>
        {due === undefined ? null : (
          <span className="inline-flex shrink-0 items-center gap-1.5">{due.label}</span>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  'h-[var(--control-height)] w-[var(--control-height)] shrink-0 overflow-hidden border-0 p-0 transition-[opacity,color] hover:!bg-transparent',
                  task.important
                    ? 'text-[var(--color-graphite-800)] opacity-100'
                    : REVEAL_ON_ROW_HOVER,
                )}
                aria-label={starName}
                onClick={onToggleImportant}
              >
                <Star
                  className={cn('size-5', task.important && 'fill-current')}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Button>
            }
          />
          <TooltipContent>{starName}</TooltipContent>
        </Tooltip>
      </div>
    </Item>
  )
}

export function DonePage(): React.JSX.Element {
  const view = useDoneView()
  const actions = useRowActions()
  const transition = useTransitionTask()
  const basis = useRowBasis()
  const days = mergeCompletedDays(view.data?.pages)

  /*
  Which un-completes confirm, and why the row cannot answer it.

  9.5 puts the confirm on the G-SERIES successor branch alone, and 5.1 defines
  that branch as a pending sibling sharing this row's series_id. Nothing on
  the wire reports it: 7.0's TaskCard carries neither series_id nor the rule,
  so a Done row cannot tell a repeat's completed occurrence from an ordinary
  completed task, and a client that confirmed on every row would warn about a
  next occurrence that does not exist.

  So the row is read before the transition, and the branch is derived from two
  fields of TaskDetail rather than from the sibling itself. 8.5 moves the rule
  onto the successor it generates, and 5.1's own exhausted-series clause says
  the last row of a finished series keeps its rule. A completed row therefore
  has a successor exactly when it carries a series_id and no rule, which is
  the condition below.

  Recorded as a reading and escalated in `src/client/README.md`: the response
  the transition endpoints already answer carries deleted_successor_id, so the
  server knows this before it acts and the client is inferring it beforehand.
  */
  const [probe, setProbe] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const detail = useTask(probe)

  useEffect(() => {
    if (probe === null) return
    const row = detail.data
    if (row === undefined || row.id !== probe) return
    setProbe(null)
    if (row.series_id !== null && row.recurrence_rule === null) {
      setConfirming(probe)
      return
    }
    transition.mutate({ id: probe, event: 'uncomplete' })
    // Deliberately keyed on the probe and its answer alone. The mutation hook
    // is a new object on every render, so listing it would re-run this on
    // every render and fire the transition again; the guard above is what
    // makes it run once, by clearing the probe before it acts.
  }, [probe, detail.data, transition])

  return (
    <div className="space-y-7">
      <PageHeading icon={CircleCheck} title="Done" subtitle="Completion history" />
      <PageBody
        query={view}
        isEmpty={days.length === 0}
        emptyCopy={DONE_EMPTY}
        emptyIcon={CircleCheck}
      >
        <div className="space-y-7">
          {days.map((day) => (
            <PageSection key={day.date} name={day.date} heading={day.date} tone="day">
              <div role="list" className="space-y-0.5">
                {day.rows.map((task) => (
                  <DoneRow
                    key={task.id}
                    task={task}
                    today={basis.today}
                    folders={basis.folders}
                    onOpen={() => {
                      actions.onOpenTask(task)
                    }}
                    onToggleImportant={() => {
                      actions.onToggleImportant(task)
                    }}
                    onMarkNotDone={() => {
                      setProbe(task.id)
                    }}
                  />
                ))}
              </div>
            </PageSection>
          ))}
          {/* Outside every region, because it belongs to the list rather than
              to the day at the bottom of it: the next page usually opens a new
              day and sometimes extends the last one. */}
          <MorePages query={view} />
        </div>
      </PageBody>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{UNCOMPLETE_SERIES_CONFIRM}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = confirming
                setConfirming(null)
                if (id !== null) transition.mutate({ id, event: 'uncomplete' })
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
