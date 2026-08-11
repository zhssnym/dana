/*
The task row: the single most repeated element in Dana, and the one section 9
enumerates part by part.

9.4's row elements are the list this file implements: complete checkbox,
title, folder label, due badge (overdue styled when due_date is before today),
assignee chip when the assignee is not the viewer, star, pulled marker with
its un-pull control, and the overflow menu. Q3 adds the "unassigned" chip for
a null assignee in a shared folder, Q4 turns the star's tooltip outward, 9.5
adds the abandoned treatment, and section 6's state table adds the steps
progress and the repeat glyph.

**Nothing here fetches.** Every row takes its card and its callbacks as props,
which is `src/client/README.md`'s settled rule and this role's hard boundary.
The rule is not stylistic: 9.5's All page renders the Tasks page's own regions
inside itself, so a component that fetched could not be rendered twice on one
page.

Three things this file is careful about, each of which an implementation gets
wrong by being reasonable.

**The fade is on the element carrying the title, not on the row.** `opacity`
does not inherit, so a row-level fade leaves every descendant computing 1: the
page looks right and nothing about the title is actually faded. AC-097 reads
the computed value off the title and compares it against a pending row's
title on the same page, which is what the word "faded" means, and a row-level
fade passes the eye and fails that. Both the opacity and the colour are set,
from `styles/tokens.css`, so the pair holds whichever one is read.

**Every state that colour signals carries a non-colour cue**, per the brief's
accessibility floor and this role's named hazard. Abandoned is struck (the `s`
element, which computes a line-through with no stylesheet) and chipped;
overdue is labelled, not just reddened; completed is checked; the star's state
is in its own name.

**A control that cannot act is not rendered.** The overflow menu's entries are
the actions the caller actually supplied, so the menu never offers a person
something that does nothing. The two entries not offered yet, and what they
wait on, are recorded in `components/README.md`.
*/
import { useState } from 'react'

import { todayInBrowserZone } from '../../api/tz.js'
import { Button } from './Button.js'
import { Chip } from './Chip.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { ABANDON_CONFIRM, ABANDONED_CHIP, DELETE_TASK_CONFIRM, REMOVE_FROM_MY_DAY, RESTORE } from './copy.js'
import { OverflowMenu } from './OverflowMenu.js'
import type { MenuEntry } from './OverflowMenu.js'
import { StarButton } from './StarButton.js'
import type { StarTooltipMode } from './StarButton.js'
import type { TaskCard } from '../../../shared/tasks.js'

export interface TaskRowProps {
  readonly task: TaskCard
  /** The signed-in person, so the assignee chip can be conditional (9.4). */
  readonly viewerId: string | null
  /** Q3's chip is conditional on the folder holding more than one member. */
  readonly multiMemberFolders?: ReadonlySet<string>
  /** Q4's outward tooltip is the Important page's; every other page is inward. */
  readonly starTooltipMode?: StarTooltipMode
  readonly onToggleComplete?: (task: TaskCard) => void
  readonly onToggleImportant?: (task: TaskCard) => void
  readonly onRestore?: (task: TaskCard) => void
  readonly onRemoveFromMyDay?: (task: TaskCard) => void
  /** 9.4's overflow: abandon, behind the confirmation that section writes. */
  readonly onAbandon?: (task: TaskCard) => void
  /** 9.4's overflow: delete, behind 9.3's confirmation. */
  readonly onDelete?: (task: TaskCard) => void
  /** 9.5: "click on any row opens the task", and 9.4's overflow edit entry. */
  readonly onOpenTask?: (task: TaskCard) => void
  /** 9.4 shows the un-pull control on My Day only. */
  readonly showPullMarker?: boolean
}

/**
 * The title, in the three renderings its status gives it.
 *
 * One element with one text node in every case. Section 9 addresses a row by
 * the title it shows, so a title split across a wrapper and an inner span is
 * a title that matches twice or not at all depending on which is asked for.
 */
function TaskTitle({ task }: { readonly task: TaskCard }): React.JSX.Element {
  if (task.status === 'abandoned') {
    // 9.5: struck. The `s` element carries the line-through with no
    // stylesheet at all, so the strike survives a missing token file; the
    // fade beside it is the token this row was owed.
    return <s className="task-title task-title-abandoned">{task.title}</s>
  }
  if (task.status === 'completed') {
    return <span className="task-title task-title-completed">{task.title}</span>
  }
  return <span className="task-title">{task.title}</span>
}

interface PendingConfirm {
  readonly message: string
  readonly run: () => void
}

export function TaskRow({
  task,
  viewerId,
  multiMemberFolders,
  starTooltipMode = 'inward',
  onToggleComplete,
  onToggleImportant,
  onRestore,
  onRemoveFromMyDay,
  onAbandon,
  onDelete,
  onOpenTask,
  showPullMarker = false,
}: TaskRowProps): React.JSX.Element {
  const abandoned = task.status === 'abandoned'
  const otherAssignee =
    task.assignee !== null && task.assignee.id !== viewerId ? task.assignee : null
  const unassigned =
    task.assignee === null && multiMemberFolders?.has(task.folder.id) === true
  const today = todayInBrowserZone()
  // 9.4: the due badge is styled overdue when due_date is before today. Only
  // while the task is still pending: a finished task's date is history, and
  // an alert on it would be an alarm about something already dealt with.
  const overdue =
    task.status === 'pending' && task.due_date !== null && task.due_date < today
  /*
  9.4's parenthesis: the un-pull marker is "absent when the row also qualifies
  automatically". 7.8 says why it has to be. DELETE removes the viewer's entry
  and the task stays in My Day while it still qualifies, so a control offered
  on such a row promises a removal it cannot perform, and the person presses
  it and watches nothing happen.

  Q1's automatic disjunct is the whole condition: assigned to the viewer, with
  a due date, on or before today. Nothing on the wire reports it, because 7.0's
  TaskCard carries the row rather than the reason it is on this page, so the
  client evaluates it. That is one of the two date comparisons in this row, and
  both are safe for the same reason: today here comes from the same zone
  identifier the request that fetched this row carried, so the two agree by
  construction rather than by luck. The residual is a midnight crossed between
  the fetch and the render, which the next refetch corrects.

  Recorded as a reading rather than a rule, and escalated by the shell session:
  a field on the card saying why a row is here would let the client stop
  deriving this.
  */
  const qualifiesAutomatically =
    task.assignee?.id === viewerId &&
    viewerId !== null &&
    task.due_date !== null &&
    task.due_date <= today
  /*
  What the box shows between the click and the refetch.

  The row is controlled by the server's status, which is right: 5.1's
  transitions are guarded and the client holds no authority over them. But a
  controlled box that snaps back while the request is in flight tells the
  person their click did nothing, and it is indistinguishable from a click
  that missed. So the box shows what was asked for until the answer arrives,
  and 8.3's refetch is what replaces it: on success the row leaves the view,
  and on failure 9.1's toast says so and the next render is the server's
  again.
  */
  const [asked, setAsked] = useState<boolean | null>(null)
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null)
  const completed = asked ?? task.status === 'completed'

  /*
  9.4's overflow menu is "edit, abandon, delete". Two of the three need
  something this package has not landed: edit needs the task form and an edit
  arm on the overlay seam, and delete needs a DELETE /tasks/:id hook in the
  query layer. Both are requested in `components/README.md`, and until they
  arrive the entries are absent rather than inert, because a menu item that
  does nothing is worse than one that is not there.
  */
  const entries: MenuEntry[] = []
  if (onOpenTask !== undefined) {
    entries.push({ label: 'Edit', onSelect: () => onOpenTask(task) })
  }
  if (onAbandon !== undefined && task.status === 'pending') {
    entries.push({
      label: 'Abandon',
      onSelect: () => {
        setConfirm({ message: ABANDON_CONFIRM, run: () => onAbandon(task) })
      },
    })
  }
  if (onDelete !== undefined) {
    entries.push({
      label: 'Delete',
      onSelect: () => {
        setConfirm({ message: DELETE_TASK_CONFIRM, run: () => onDelete(task) })
      },
    })
  }

  return (
    <li className="task-row">
      <input
        type="checkbox"
        aria-label="Complete"
        checked={completed}
        onChange={(event) => {
          setAsked(event.target.checked)
          onToggleComplete?.(task)
        }}
      />
      {/* 9.5: "click on any row opens the task". Recorded as owed in
          `components/README.md` while the edit arm of the overlay seam did not
          exist; it does now, so the title is the row's opening control. A
          button rather than a handler on the row, so the same click is a tab
          stop and an Enter press. The title element itself is untouched, which
          is what keeps it one text node for AC-097's computed-style read. */}
      {onOpenTask === undefined ? (
        <TaskTitle task={task} />
      ) : (
        <button
          type="button"
          className="button-base button-quiet"
          onClick={() => onOpenTask(task)}
        >
          <TaskTitle task={task} />
        </button>
      )}
      <span className="meta">{task.folder.name}</span>
      {task.due_date === null ? null : (
        <Chip tone={overdue ? 'alert' : 'default'}>
          {/* The non-colour cue the accessibility floor requires beside the
              colour: the badge says the word rather than only turning red. */}
          {overdue ? 'Overdue ' : ''}
          {task.due_date}
          {task.due_time === null ? '' : ` ${task.due_time.slice(0, 5)}`}
        </Chip>
      )}
      {task.steps_total === 0 ? null : (
        <span className="meta" title={`${task.steps_done} of ${task.steps_total} steps done`}>
          {task.steps_done}/{task.steps_total}
        </span>
      )}
      {task.is_recurring ? (
        <span className="meta">
          <span aria-hidden="true">↻</span>
          <span className="sr-only">Repeats</span>
        </span>
      ) : null}
      {otherAssignee === null ? null : (
        <Chip>{otherAssignee.display_name ?? 'Someone'}</Chip>
      )}
      {unassigned ? <Chip>Unassigned</Chip> : null}
      {task.pending_invite_email === null ? null : (
        // 9.8: the chip a row shows while an assignment invite is outstanding.
        <Chip>{`Invite pending: ${task.pending_invite_email}`}</Chip>
      )}
      <StarButton task={task} mode={starTooltipMode} onToggle={onToggleImportant} />
      {abandoned ? (
        <>
          <Chip>{ABANDONED_CHIP}</Chip>
          <Button
            tone="quiet"
            onClick={() => {
              onRestore?.(task)
            }}
          >
            {RESTORE}
          </Button>
        </>
      ) : null}
      {showPullMarker && task.pulled && !qualifiesAutomatically ? (
        <Button
          tone="quiet"
          onClick={() => {
            onRemoveFromMyDay?.(task)
          }}
        >
          {REMOVE_FROM_MY_DAY}
        </Button>
      ) : null}
      <OverflowMenu entries={entries} />
      {confirm === null ? null : (
        <ConfirmDialog
          message={confirm.message}
          onContinue={() => {
            const run = confirm.run
            setConfirm(null)
            run()
          }}
          onCancel={() => {
            setConfirm(null)
          }}
        />
      )}
    </li>
  )
}

export interface TaskListProps {
  readonly tasks: readonly TaskCard[]
  readonly viewerId: string | null
  readonly multiMemberFolders?: ReadonlySet<string>
  readonly starTooltipMode?: StarTooltipMode
  readonly onToggleComplete?: (task: TaskCard) => void
  readonly onToggleImportant?: (task: TaskCard) => void
  readonly onRestore?: (task: TaskCard) => void
  readonly onRemoveFromMyDay?: (task: TaskCard) => void
  readonly onAbandon?: (task: TaskCard) => void
  readonly onDelete?: (task: TaskCard) => void
  readonly onOpenTask?: (task: TaskCard) => void
  readonly showPullMarker?: boolean
}

/**
 * Rows in the order they arrived. Section 6's preamble is explicit that every
 * view returns rows already ordered and clients never re-sort, so this maps
 * and does nothing else; a sort here would be a second ordering nobody
 * specified.
 *
 * `role="list"` is spelled out because the stylesheet removes the list
 * marker, and a list without markers loses its role in WebKit's accessibility
 * tree. The acceptance suite addresses a row by the grouping role a list of
 * rows carries, so that role is a contract rather than a default to inherit.
 */
export function TaskList(props: TaskListProps): React.JSX.Element {
  return (
    <ul role="list" className="flex flex-col">
      {props.tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          viewerId={props.viewerId}
          multiMemberFolders={props.multiMemberFolders}
          starTooltipMode={props.starTooltipMode}
          onToggleComplete={props.onToggleComplete}
          onToggleImportant={props.onToggleImportant}
          onRestore={props.onRestore}
          onRemoveFromMyDay={props.onRemoveFromMyDay}
          onAbandon={props.onAbandon}
          onDelete={props.onDelete}
          onOpenTask={props.onOpenTask}
          showPullMarker={props.showPullMarker}
        />
      ))}
    </ul>
  )
}
