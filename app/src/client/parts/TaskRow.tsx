/*
PROVISIONAL. The least that lets the pages of 9.4 to 9.8 render.

A task row is a component, and components are the Component and Design System
engineer's (11.4, and this role's persona). What this file is for is the four
sessions that come after this one: a page cannot be assembled against a
component library that does not exist yet, and a page assembled against
nothing cannot be measured at all. So this is structure, roles and accessible
names, with no styling, no tokens, and no judgment about appearance.

What is settled here and worth keeping when this is replaced:

- A row is an `li` inside a `ul`. The acceptance suite addresses a row by the
  accessible grouping role a list of rows carries, admitting list or grid and
  nothing else, so this is a contract rather than a preference.
- The star's accessible name is its own state, "Important" when filled and
  "Mark as important" when not (9.5, closed at the P8 change control). It is a
  `button` with `aria-pressed`, deliberately not a `switch`: 9.4's
  important-only filter is the switch on that page, and a row full of switches
  named "Important" would collide with it.
- The un-pull control reads "Remove from My Day" (9.4).

What is not done here and is owed, recorded in README.md as well:

- 9.5's faded-and-struck rendering of an abandoned row is half done. The
  strike is the `s` element, which computes a line-through with no stylesheet
  at all; the fading is a token and belongs to the file that owns tokens.
- 9.4's un-pull marker is "absent when the row also qualifies automatically".
  That clause needs to know whether the row would be in My Day without the
  entry, which is a server evaluation of today given tz (8.1) and is not on
  the wire. Escalated; the control is shown whenever the row is pulled.
- The overflow menu ("More actions", 9.1's control table) opens the task form
  and the abandon and delete confirms, all of which are the Complex
  Interaction engineer's.
*/
import { useState } from 'react'

import type { TaskCard } from '../../shared/tasks.js'

export interface TaskRowProps {
  readonly task: TaskCard
  /** The signed-in person, so the assignee chip can be conditional (9.4). */
  readonly viewerId: string | null
  /** Q3's chip is conditional on the folder holding more than one member. */
  readonly multiMemberFolders?: ReadonlySet<string>
  readonly onToggleComplete?: (task: TaskCard) => void
  readonly onToggleImportant?: (task: TaskCard) => void
  readonly onRestore?: (task: TaskCard) => void
  readonly onRemoveFromMyDay?: (task: TaskCard) => void
  /** 9.4 shows the un-pull control on My Day only. */
  readonly showPullMarker?: boolean
}

export function TaskRow({
  task,
  viewerId,
  multiMemberFolders,
  onToggleComplete,
  onToggleImportant,
  onRestore,
  onRemoveFromMyDay,
  showPullMarker = false,
}: TaskRowProps): React.JSX.Element {
  const abandoned = task.status === 'abandoned'
  const otherAssignee =
    task.assignee !== null && task.assignee.id !== viewerId ? task.assignee : null
  const unassigned =
    task.assignee === null && multiMemberFolders?.has(task.folder.id) === true
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
  const completed = asked ?? task.status === 'completed'
  return (
    <li>
      <input
        type="checkbox"
        aria-label="Complete"
        checked={completed}
        onChange={(event) => {
          setAsked(event.target.checked)
          onToggleComplete?.(task)
        }}
      />
      <span>{abandoned ? <s>{task.title}</s> : task.title}</span>
      <span>{task.folder.name}</span>
      {task.due_date === null ? null : <span>{task.due_date}</span>}
      {task.due_time === null ? null : <span>{task.due_time}</span>}
      {otherAssignee === null ? null : (
        <span>{otherAssignee.display_name ?? 'Someone'}</span>
      )}
      {unassigned ? <span>Unassigned</span> : null}
      <button
        type="button"
        aria-pressed={task.important}
        aria-label={task.important ? 'Important' : 'Mark as important'}
        title={task.important ? 'Important' : 'Mark as important'}
        onClick={() => onToggleImportant?.(task)}
      >
        {task.important ? '★' : '☆'}
      </button>
      {abandoned ? (
        <>
          <span>Abandoned</span>
          <button type="button" onClick={() => onRestore?.(task)}>
            Restore
          </button>
        </>
      ) : null}
      {showPullMarker && task.pulled ? (
        <button type="button" onClick={() => onRemoveFromMyDay?.(task)}>
          Remove from My Day
        </button>
      ) : null}
    </li>
  )
}

interface TaskListProps {
  readonly tasks: readonly TaskCard[]
  readonly viewerId: string | null
  readonly multiMemberFolders?: ReadonlySet<string>
  readonly onToggleComplete?: (task: TaskCard) => void
  readonly onToggleImportant?: (task: TaskCard) => void
  readonly onRestore?: (task: TaskCard) => void
  readonly onRemoveFromMyDay?: (task: TaskCard) => void
  readonly showPullMarker?: boolean
}

/**
 * Rows in the order they arrived. Section 6's preamble is explicit that every
 * view returns rows already ordered and clients never re-sort, so this maps
 * and does nothing else; a sort here would be a second ordering nobody
 * specified.
 */
export function TaskList(props: TaskListProps): React.JSX.Element {
  return (
    <ul>
      {props.tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          viewerId={props.viewerId}
          multiMemberFolders={props.multiMemberFolders}
          onToggleComplete={props.onToggleComplete}
          onToggleImportant={props.onToggleImportant}
          onRestore={props.onRestore}
          onRemoveFromMyDay={props.onRemoveFromMyDay}
          showPullMarker={props.showPullMarker}
        />
      ))}
    </ul>
  )
}
