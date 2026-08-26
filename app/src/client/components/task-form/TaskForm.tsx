/*
9.3's task surface, which is one artifact for creation and for editing and is
a state machine rather than a set of fields.

**There is no task form, which is the sentence this file spent S15 becoming
true.** 9.3's v2 opening is "There is no task form. A task is its row, its
card, and its page", and "every edit commits as it is made, there is no Save
control and no draft state". S11 built the header strip of chips above a
surviving v1 form; S15 retired the fields under it, the "More options"
expander that held seven of them, and the Save control, which is what items 15
and 19 of RFC 0005's change control asked for and what unblocks release 2.0.0.
The criteria that addressed the v1 apparatus were reworked first, red, under
persona 11, which is the sequencing that makes this auditable.

What is left is the composition 9.3 describes: the title editable in place,
the header strip of five chips each opening its picker in place, then Steps
and Notes as blocks, then the history read, then a footer toolbar carrying
the completion control, the star and "More actions".

Four decisions this file is built around.

**Every edit goes through one commit.** `chipChange` sets state and, on an
existing task, writes; nothing else on this surface writes. That is what
makes "commits as it is made" checkable rather than a claim about seven
separate handlers, and it is why the surface can never hold a value it has
not sent. A text field commits when it is left, because a person typing has
no other moment that means "done"; a picker commits when it is answered,
because answering is the whole act.

**The moment of enablement is the render, not the response.** 9.3's two
date-dependent rows, reminder and repeat, are enabled by the due date having
a value, so the date lives in React state and the chips read `dueDate !== ''`
directly. Enabling on the commit's response would leave the strip inoperable
for a round trip after the person answered the date beside it, which is the
same fast-typing race the v1 section called out with the blur and the save.

**The clear-date warning is a gate, not a notice.** 8.4's cascade runs after
the warning, so a declined warning has cleared nothing, the date included.
Nothing is written when the date is emptied: the change opens the dialog, the
state still holds the date, and only "Continue" applies the four-field
cascade. A dialog that cleared first and explained second satisfies AC-092's
own sentence and fails the case beneath it.

**Validation here is convenience and the server's rules are the real ones**
(7.11), so nothing below refuses anything the server would accept. What it
adds is the copy 9.3 writes for the refusals a person meets most, and the
reason it needs to exist at all is that a convenience nobody measures is a
convenience the person meets as a silent failure. 9.3's v2 title row makes it
explicit for the one that matters: "empty commits are refused with 'Give it a
title'".

**The reminder is committed like every other field**, and where it goes is
the contract's rather than a preference: frozen 7.6 gives the create body a
`reminder` arm, frozen 7.6's PATCH carries no reminder key at all, so an
existing task's reminder is written through 7.9's PUT and removed through its
DELETE. Which of the three a commit performs is `TaskFormOverlay`'s, because
it is the file holding the mutations.

---

**What is owed here and is not drawn, recorded rather than left to be found.**

1. **Attachments.** 9.3's v2 card holds "Steps, Notes, and Attachments as
   blocks". Attachments are 4.16's files, whose surface belongs to the package
   that lands them; a block drawn empty here would be a control that leads
   nowhere, which this role exists to prevent.
2. **Comments.** 9.3 puts them after the blocks, under 9.6's conversation
   rules, and they are that package's for the same reason.
3. **The folder picker's "New folder…" entry**, which 9.3's v2 folder row
   names. It opens the New-folder dialog of 9.1, which is the chrome's and not
   this directory's, so it is escalated rather than reached across for.
4. **"More actions" carries Delete alone.** 9.3's v2 list is History, Copy
   link, Duplicate, Move to folder, Make this a folder, Abandon or Restore,
   Delete. Delete is the one this file already owned; the rest reach 7.13's
   Trash, 4.17's page blocks and the row actions that live elsewhere, and each
   is that owner's.
5. **The side panel and the tab.** 9.3 makes where a task opens a client-side
   preference, "a row offers the choice and remembers it", and this surface is
   the dialog shape only. /app/tasks/:id is 9.1's route table and the shell's.

**Two deviations from the designer's prototype survive the rework**, and both
are numbered sections saying otherwise, which is the exception RFC 0002's own
rule carries:

1. **The fields keep 9.3's names.** His title input is labelled "Task name";
   here it is "Title", because 9.1's addressing paragraph makes the name the
   thing a criterion may address and a synonym is a different field wearing a
   word.
2. **A date-dependent control stays on the surface, disabled, with the
   helper.** His `DependencyValue` replaces the control with a line of text,
   which is *hidden* where 9.3 says *disabled*, and the v1 table opened by
   defining the difference.
*/
import { useId, useState } from 'react'
import {
  AlignLeft,
  ListChecks,
  MoreHorizontal,
  Star,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { TaskChips } from '../task-card/chips.js'
import { useCreateInvite } from '../../api/mutations.js'
import { useConnections, useFolder, useFolders, useMe } from '../../api/queries.js'
import { presenterToday } from '../../parts/presenters.js'
import type { Folder } from '../../../shared/folders.js'
import type {
  PatchTaskBody,
  PostTasksBody,
  ReminderInput,
  TaskDetail,
} from '../../../shared/tasks.js'
import {
  TASK_NOTES_LIMIT,
  TASK_TITLE_LIMIT,
} from '../../../shared/tasks.js'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog.js'
import { Badge } from '../ui/badge.js'
import { Button } from '../ui/button.js'
import { Checkbox } from '../ui/checkbox.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js'
import { Input } from '../ui/input.js'
import { SheetFooter, SheetHeader } from '../ui/sheet.js'
import { cn } from '../ui/utils.js'
import {
  COMPLETE_TASK,
  MARK_AS_NOT_DONE,
  MORE_ACTIONS,
  STAR_OFF,
  STAR_ON,
} from '../ui/copy.js'
import {
  CLEAR_DATE_WARNING,
  CLOSE,
  DELETE_TASK,
  FIELD_NOTES,
  FIELD_STEPS,
  FIELD_TITLE,
  TITLE_REQUIRED,
  UNCOMPLETE_SERIES_CONFIRM,
  moveWouldUnassign,
  tooLong,
} from './copy.js'
import {
  fromRuleString,
  NO_REPEAT,
  toRuleString,
} from './presets.js'
import type { RepeatState } from './presets.js'
import { STEP_CAP, StepsEditor } from './StepsEditor.js'
import type { EditorStep } from './StepsEditor.js'
import { TaskHistory } from './TaskHistory.js'
import type { PeopleIndex } from './TaskHistory.js'

/**
 * The designer's property row: a glyph, the field's name, and the control.
 *
 * The name is a real `label` bound to the control by id, which is 9.1's
 * addressing sentence applied to a form: the name announces and the name
 * addresses, and a label is exactly that binding.
 */
function PropertyRow({
  icon: Icon,
  label,
  htmlFor,
  children,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly htmlFor: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="grid min-h-[var(--task-form-property-row-height)] grid-cols-[20px_104px_minmax(0,1fr)] items-start gap-2 rounded-md px-1">
      <Icon
        className="mt-2.5 size-4 text-[var(--color-graphite-500)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <label
        htmlFor={htmlFor}
        className="pt-2 text-[13px] leading-5 font-medium text-[var(--color-graphite-600)]"
      >
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** What the form holds, which is not what any one endpoint takes. */
export interface FormValues {
  title: string
  notes: string
  important: boolean
  folderId: string
  assigneeId: string | null
  dueDate: string
  dueTime: string
  /** The time-of-day arm of 9.3's reminder control, HH:MM or empty. */
  reminderTime: string
  /** The offset arm, in minutes, or null for no reminder. */
  reminderOffset: number | null
  repeat: RepeatState
  steps: EditorStep[]
}

export interface TaskFormProps {
  readonly initial: FormValues
  readonly task: TaskDetail | null
  readonly onDelete: () => void
  /**
   * 9.3's completion control, in edit mode: "the same transition 9.4's row
   * checkbox and 9.5's 'Mark as not done' make". The transition is the
   * overlay's, which holds the mutations; the confirmation is this file's,
   * because 9.5 makes it a property of the branch rather than of the endpoint.
   */
  readonly onToggleComplete: (event: 'complete' | 'uncomplete') => void
  readonly onClose: () => void
  /**
   * 9.3's v2 rule: "every edit commits as it is made, there is no Save
   * control and no draft state".
   *
   * **One callback for both paths, and that is what makes the rule true of a
   * task nobody has created yet.** 9.1's capture rule creates a task where it
   * is captured, but frozen 7.6 requires a title of 1 to 300 characters, so
   * there is no row to make until the person has called the task something.
   * The surface therefore holds the entry defaults until the first commit
   * that carries a valid title, and that commit is the create; every commit
   * after it is a patch. Which one this is, the caller reads off which body
   * is non-null.
   *
   * The reminder is a third value because the contract puts it on two
   * endpoints, 7.6's create arm and 7.9's PUT and DELETE, and this component
   * does not know which of them it is on.
   */
  readonly onCommit: (
    create: PostTasksBody | null,
    patch: PatchTaskBody | null,
    reminder: ReminderInput | null,
  ) => void
  readonly onAppendStep: (title: string) => void
  readonly onToggleStep: (step: EditorStep) => void
  readonly onDeleteStep: (step: EditorStep) => void
  readonly onMoveStep: (step: EditorStep, position: number) => void
}

/** The value 9.3's entry-point table calls "empty" for a date field. */
function orEmpty(value: string | null | undefined): string {
  return value ?? ''
}

export function initialForCreate(
  defaults: { due_date?: string | null; important?: boolean; folder_id?: string },
  folders: readonly Folder[],
  viewerId: string | null,
): FormValues {
  // 9.3's folder column reads "Inbox" for five of its six rows, and Inbox is
  // 4.3's default folder rather than a folder that happens to be called one.
  const fallback = folders.find((folder) => folder.is_default)?.id ?? folders[0]?.id ?? ''
  return {
    title: '',
    notes: '',
    important: defaults.important ?? false,
    folderId: defaults.folder_id ?? fallback,
    // 9.3's behavior rules: assignee defaults to the viewer.
    assigneeId: viewerId,
    dueDate: orEmpty(defaults.due_date),
    dueTime: '',
    reminderTime: '',
    reminderOffset: null,
    repeat: NO_REPEAT,
    steps: [],
  }
}

export function initialForEdit(task: TaskDetail): FormValues {
  return {
    title: task.title,
    notes: task.notes ?? '',
    important: task.important,
    folderId: task.folder.id,
    assigneeId: task.assignee?.id ?? null,
    dueDate: orEmpty(task.due_date),
    // 4.11 stores minute precision and Postgres renders HH:MM:SS; a time
    // input takes HH:MM, and the seconds are always zero by the column.
    dueTime: task.due_time === null ? '' : task.due_time.slice(0, 5),
    reminderTime:
      task.reminder?.time_of_day === null || task.reminder === null
        ? ''
        : task.reminder.time_of_day.slice(0, 5),
    reminderOffset: task.reminder?.offset_minutes ?? null,
    repeat: fromRuleString(task.recurrence_rule),
    steps: task.steps.map((step) => ({ id: step.id, title: step.title, done: step.done })),
  }
}

export function TaskForm({
  initial,
  task,
  onDelete,
  onToggleComplete,
  onClose,
  onCommit,
  onAppendStep,
  onToggleStep,
  onDeleteStep,
  onMoveStep,
}: TaskFormProps): React.JSX.Element {
  const ids = useId()
  const [values, setValues] = useState<FormValues>(initial)
  const [errors, setErrors] = useState<readonly string[]>([])
  const [clearing, setClearing] = useState(false)
  /* Whether the clear now being confirmed was asked for by a chip, which is
     what decides when its cascade is written: the strip commits as it is
     answered and the field below it commits at the Save it always did. */
  const [clearCommits, setClearCommits] = useState(false)
  const [confirmUncomplete, setConfirmUncomplete] = useState(false)
  const [inviting, setInviting] = useState(false)
  /*
  Whether the person chose 9.3's v2 "Unassigned" from the chip menu, which is
  the one case an assignee of null must survive the reconciliation below.

  A separate flag rather than a third state of `assigneeId`, because null
  already means two things on this form: nobody was chosen, and the chosen
  person is not a member of the folder now selected. The v1 dropdown offered
  no way out at all, so both collapsed onto the viewer and neither was wrong;
  the v2 menu adds a third meaning and this is what tells it from the other
  two.
  */
  const [unassigned, setUnassigned] = useState(false)

  const me = useMe()
  const folders = useFolders()
  const folderDetail = useFolder(values.folderId)
  const connections = useConnections()

  const editing = task !== null

  const viewerId = me.data?.user.id ?? null
  const members = folderDetail.data?.members ?? []

  /*
  The task's own folder, which is where the history block's two people are
  looked up, and never the folder the form is currently pointing at: a person
  who opens the form and changes the folder has not changed who created the
  row. When the two agree, which is every render until they are changed, this
  is the same query key as the line above and costs no second request.
  */
  const historyFolder = useFolder(editing ? task.folder.id : values.folderId)

  /*
  Every person this client can put a name to, for the history block of 9.3.
  Frozen 7.2 gives `created_by` and `completed_by` as bare ids, so the names
  come from the three readable surfaces that carry one: the viewer, the task's
  folder members, and the roster. An id none of them holds is 4.1's "Deleted
  user", which is right by construction rather than by a flag, because 8.10
  step 4 removes a deleted account's memberships and 7.3 excludes it from the
  roster.
  */
  const people: PeopleIndex = new Map<string, string | null>([
    ...(me.data === undefined
      ? []
      : ([[me.data.user.id, me.data.user.display_name]] as [string, string | null][])),
    ...(historyFolder.data?.members ?? []).map(
      (member): [string, string | null] => [member.user.id, member.user.display_name],
    ),
    ...(connections.data ?? []).map(
      (connection): [string, string | null] => [
        connection.user.id,
        connection.user.display_name,
      ],
    ),
  ])

  /*
  The steps the editor draws, and the one part of this form whose truth is the
  server's rather than the field's.

  A create holds its steps in memory because 7.6 posts them in one body. An
  edit writes each change through 7.7, which answers the affected TaskDetail,
  so the rows come from that read: a local copy would be a second list that
  drifts from the one the append just changed, and 4.6's positions are the
  server's to assign in any case.
  */
  const steps: readonly EditorStep[] = editing
    ? task.steps.map((step) => ({ id: step.id, title: step.title, done: step.done }))
    : values.steps
  // 9.3's assignee row: visible when the target folder has 2 or more members,
  // hidden otherwise, and "hidden" is this table's word for absent. The count
  // is the folder's own, so a folder whose membership changed under the form
  // answers the next time the list is read rather than never.
  const assigneeVisible = folderDetail.data !== undefined && members.length > 1

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]): void {
    setValues((was) => ({ ...was, [key]: value }))
  }

  /**
   * 8.4's cascade, applied only after the warning it describes.
   *
   * All four fields in one update, because the cascade is one transaction
   * server-side and a form that cleared them in sequence would render a state
   * the database refuses: 4.5's CHECK forbids a rule beside a null date.
   */
  function runClearDate(): void {
    const cleared: FormValues = {
      ...values,
      dueDate: '',
      dueTime: '',
      reminderTime: '',
      reminderOffset: null,
      repeat: NO_REPEAT,
    }
    if (clearCommits) chipChange(cleared)
    else setValues(cleared)
    setClearing(false)
    setClearCommits(false)
  }

  function onDueDateChange(next: string, commit = false): void {
    if (next !== '') {
      const withDate = { ...values, dueDate: next }
      if (commit) chipChange(withDate)
      else setValues(withDate)
      return
    }
    // 8.4: "The client shows a warning first when a rule or reminder exists."
    const cascades =
      values.repeat.preset !== 'none' ||
      values.reminderTime !== '' ||
      values.reminderOffset !== null ||
      values.dueTime !== ''
    if (!cascades) {
      const cleared = { ...values, dueDate: '' }
      if (commit) chipChange(cleared)
      else setValues(cleared)
      return
    }
    // Nothing is written here, which is the whole of the "gate, not notice"
    // rule: the state still holds the date, so React restores the input to it
    // and a declined warning has cleared nothing.
    setClearCommits(commit)
    setClearing(true)
  }

  function onFolderChange(next: string, commit = false): void {
    const moved = { ...values, folderId: next }
    if (commit) chipChange(moved)
    else setValues(moved)
    setInviting(false)
  }

  /*
  The assignee, reconciled against the folder now selected.

  9.3's behavior rule is that folder selection re-filters the dropdown, and
  its edit-mode difference is that a move which would strand the assignee says
  so. Both are the same fact read twice, so both are derived here rather than
  stored: an effect would answer one render after the person has looked, and a
  second copy in state is a second thing that can disagree with the folder.

  The dropdown offers the folder's members and 9.3's invite entry and nothing
  else, which AC-094 asserts by counting. So "unassigned" is not offered here,
  a narrowing of INV-5's permitted null recorded in this directory's README:
  the field falls back to the viewer where they are a member, which is also
  9.3's own default.
  */
  const assigneeInFolder =
    values.assigneeId !== null &&
    members.some((member) => member.user.id === values.assigneeId)
  const viewerIsMember = members.some((member) => member.user.id === viewerId)
  const selectedAssignee = unassigned
    ? null
    : assigneeInFolder
      ? values.assigneeId
      : ((viewerIsMember ? viewerId : members[0]?.user.id) ?? null)

  const moveNotice =
    editing &&
    task.assignee !== null &&
    folderDetail.data !== undefined &&
    members.length > 0 &&
    !members.some((member) => member.user.id === task.assignee?.id)
      ? moveWouldUnassign(task.assignee.display_name ?? 'them', folderDetail.data.name)
      : null

  /*
  9.5's un-complete confirm, on the branch that takes the successor.

  The pair is 7.0's own: 8.5 moves the rule onto the successor, so a completed
  occurrence reads `recurrence_rule` null with `series_id` set, and that is the
  row whose un-complete deletes the next occurrence. Read off the TaskDetail the
  form already holds rather than probed for, which is the one advantage this
  surface has over 9.5's Done row, whose page carries cards and has to ask.
  */
  const uncompleteTakesSuccessor =
    editing && task.series_id !== null && task.recurrence_rule === null

  const completed = editing && task.status === 'completed'

  function toggleComplete(): void {
    if (!editing) return
    if (!completed) {
      onToggleComplete('complete')
      return
    }
    if (uncompleteTakesSuccessor) {
      setConfirmUncomplete(true)
      return
    }
    onToggleComplete('uncomplete')
  }

  function validate(source: FormValues = values): string[] {
    const found: string[] = []
    if (source.title.trim() === '') found.push(TITLE_REQUIRED)
    else if (source.title.length > TASK_TITLE_LIMIT)
      found.push(tooLong(TASK_TITLE_LIMIT))
    if (source.notes.length > TASK_NOTES_LIMIT)
      found.push(tooLong(TASK_NOTES_LIMIT))
    return found
  }

  /*
  The three bodies one write carries, computed from an explicit values object
  rather than from the state this render closed over.

  The argument is what makes 9.3's v2 chips possible: a chip answers and the
  write goes out in the same turn, before React has re-rendered with the new
  state, so the values it writes have to be handed in. `save` passes the state
  it is looking at and nothing changes for it.
  */
  function bodiesFor(
    source: FormValues,
    unassignedNow: boolean,
  ): {
    create: PostTasksBody | null
    patch: PatchTaskBody | null
    reminder: ReminderInput | null
  } {
    const rule = toRuleString(source.repeat)
    const sourceDated = source.dueDate !== ''
    const dueDate = sourceDated ? source.dueDate : null
    const dueTime = sourceDated && source.dueTime !== '' ? source.dueTime : null

    // The same reconciliation the render does, over the values handed in.
    const inFolder =
      source.assigneeId !== null &&
      members.some((member) => member.user.id === source.assigneeId)
    const assignee = unassignedNow
      ? null
      : inFolder
        ? source.assigneeId
        : ((viewerIsMember ? viewerId : members[0]?.user.id) ?? null)

    /*
    What the form is asking for the reminder to become, in 4.8's shape.

    The mode follows the due time and never the arm the person last touched,
    which is 9.3's own rule ("reminder control switches mode with due time")
    and is what frozen 7.9 answers 422 on getting wrong. So a task that gained
    a time sends the offset arm and one that lost it sends the time-of-day
    arm, whatever the other arm still holds from before the switch. The v2
    strip only ever writes the second, because its due picker offers no time
    of day and a v2 task therefore never has one; a task carrying a due time
    from v1 keeps the v1 mode and is answered by the field below the strip.

    Null means the form is carrying no reminder, which is a removal on the
    edit path and simply an absent key on the create path. A date is required
    for either arm to mean anything (INV-6), and the control is disabled
    without one, so the guard here is the same rule stated where the value is
    built rather than trusted from the control's state.
    */
    const reminder: ReminderInput | null =
      dueDate === null
        ? null
        : dueTime !== null
          ? source.reminderOffset === null
            ? null
            : { offset_minutes: source.reminderOffset, time_of_day: null }
          : source.reminderTime === ''
            ? null
            : { offset_minutes: null, time_of_day: source.reminderTime }

    if (editing) {
      const patch: PatchTaskBody = {
        title: source.title.trim(),
        notes: source.notes === '' ? null : source.notes,
        important: source.important,
        folder_id: source.folderId,
        due_date: dueDate,
        due_time: dueTime,
        recurrence_rule: dueDate === null ? null : rule,
      }
      // INV-5: a null assignee is 7.6's 409 in a single-member folder, and the
      // field is not on the form there at all, so the key is left out rather
      // than sent as a value the server would have to repair.
      return {
        create: null,
        patch: assigneeVisible ? { ...patch, assignee_id: assignee } : patch,
        reminder,
      }
    }

    const create: PostTasksBody = {
      title: source.title.trim(),
      folder_id: source.folderId,
      notes: source.notes === '' ? null : source.notes,
      important: source.important,
      due_date: dueDate,
      due_time: dueTime,
      recurrence_rule: dueDate === null ? null : rule,
      steps: source.steps.map((step) => step.title),
      // Frozen 7.6's own arm. Absent rather than null when the form carries
      // none, because a create that names no reminder is not a create that
      // clears one.
      ...(reminder === null ? {} : { reminder }),
    }
    return {
      create: assigneeVisible ? { ...create, assignee_id: assignee } : create,
      patch: null,
      reminder,
    }
  }

  /*
  9.3's v2 rule applied: "Every edit commits as it is made."

  Every control on this surface goes through here, so there is one answer to
  what an edit does and the surface cannot hold a value it has not written.
  On an existing task it writes; on a creation there is no row to write to, so
  the values gather in state and ride the create body.

  **A commit the server would refuse is not sent, and the refusal is shown.**
  9.3's v2 title row is "1 to 300; empty commits are refused with 'Give it a
  title'", and its validation paragraph carries the over-limit string beside
  it. `validate` is where both live, and it is given the values being
  committed rather than the ones this render closed over, for the same reason
  `bodiesFor` takes them: an edit commits in the turn it is made, before React
  has re-rendered.
  */
  function chipChange(next: FormValues, nextUnassigned: boolean = unassigned): void {
    setValues(next)
    setUnassigned(nextUnassigned)
    const found = validate(next)
    setErrors(found)
    if (found.length > 0) return
    const { create, patch, reminder } = bodiesFor(next, nextUnassigned)
    onCommit(create, patch, reminder)
  }

  /*
  The commit a text field makes when it is left.

  A chip commits the moment it is answered, because answering a picker is one
  act. A text field has no such moment while a person is still typing, so what
  stands in for it is leaving the field, which is how an edit made in place
  has always ended. Committing on every keystroke would be the same rule read
  literally and would put a write on the wire for every character.
  */
  function commitText(): void {
    chipChange(values)
  }

  const today = presenterToday()

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <SheetHeader className="shrink-0 gap-0 px-6 pt-5 pb-2">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              {/* The name announces and the name addresses (9.1). The label is
                  for a screen reader and a test; his design puts the field's
                  own placeholder where a sighted person reads it.

                  9.3's v2 title row is "1 to 300; empty commits are refused
                  with 'Give it a title'", so leaving the field is what
                  finishes the edit and what the refusal answers. */}
              <label htmlFor={`${ids}-title`} className="sr-only">
                {FIELD_TITLE}
              </label>
              <Input
                data-task-form-title
                id={`${ids}-title`}
                type="text"
                autoFocus
                value={values.title}
                placeholder={FIELD_TITLE}
                onChange={(event) => {
                  set('title', event.target.value)
                }}
                onBlur={commitText}
                className="h-auto min-h-[var(--control-height)] border-0 bg-transparent px-1 py-1 shadow-none placeholder:text-[var(--color-graphite-400)] focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0"
              />
            </div>

            {/* The surface's own dismiss. 9.3's v2 card gives its footer the
                completion control, the star and "More actions" and no close,
                so the close belongs to the chrome; escape closes too, which is
                what every dialog in this client already does. */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={CLOSE}
              onClick={onClose}
              className="size-[var(--control-height)] shrink-0 rounded-md text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]"
            >
              <X className="!size-5" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </div>

          {errors.map((message) => (
            <p key={message} role="alert" className="mt-1 px-1 text-xs text-destructive">
              {message}
            </p>
          ))}
        </SheetHeader>

        {/* 9.3's v2 header strip: the five chips, each opening its picker in
            place. It is the whole of the five fields now, the v1 column
            beneath it having gone with the "More options" expander and the
            Save control at S15. */}
        <div className="shrink-0 px-6">
          <TaskChips
            dueDate={values.dueDate}
            onDueDateChange={(next) => {
              onDueDateChange(next, true)
            }}
            folderId={values.folderId}
            folders={folders.data ?? []}
            onFolderChange={(next) => {
              onFolderChange(next, true)
            }}
            assigneeVisible={assigneeVisible}
            assigneeId={selectedAssignee}
            members={members}
            onAssigneeChange={(next) => {
              chipChange({ ...values, assigneeId: next }, next === null)
            }}
            onInvite={() => {
              setInviting(true)
            }}
            dueTime={values.dueTime}
            onDueTimeClear={() => {
              chipChange({ ...values, dueTime: '', reminderOffset: null })
            }}
            reminderTime={values.reminderTime}
            onReminderTimeChange={(next) => {
              chipChange({ ...values, reminderTime: next })
            }}
            repeat={values.repeat}
            onRepeatChange={(preset) => {
              chipChange({ ...values, repeat: { ...values.repeat, preset } })
            }}
            onRepeatDaysChange={(days) => {
              chipChange({ ...values, repeat: { ...values.repeat, days } })
            }}
            onRepeatIntervalChange={(interval) => {
              chipChange({ ...values, repeat: { ...values.repeat, interval } })
            }}
            onRepeatMonthDayChange={(monthDay) => {
              chipChange({ ...values, repeat: { ...values.repeat, monthDay } })
            }}
            onRepeatUntilChange={(until) => {
              chipChange({ ...values, repeat: { ...values.repeat, until } })
            }}
            today={today}
          />
        </div>

        {/* 9.3's v2 blocks, in that section's order: "then Steps, Notes, and
            Attachments as blocks". Attachments are 4.16's files and are owed
            by the package that lands them, which this file records rather
            than draws empty. Nothing is behind an expander: the v2 card has
            none, and the two blocks are what a person came to write in. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-1">
          <div className="mt-1 space-y-1 pb-4">
            <PropertyRow icon={ListChecks} label={FIELD_STEPS} htmlFor={`${ids}-step`}>
              <StepsEditor
                inputId={`${ids}-step`}
                steps={steps}
                onAppend={(title) => {
                  if (steps.length >= STEP_CAP) return
                  if (editing) {
                    onAppendStep(title)
                    return
                  }
                  setValues((was) => ({
                    ...was,
                    steps: [...was.steps, { id: null, title, done: false }],
                  }))
                }}
                onToggle={(index) => {
                  const step = steps[index]
                  if (step === undefined) return
                  if (editing) {
                    onToggleStep(step)
                    return
                  }
                  setValues((was) => ({
                    ...was,
                    steps: was.steps.map((row, at) =>
                      at === index ? { ...row, done: !row.done } : row,
                    ),
                  }))
                }}
                onDelete={(index) => {
                  const step = steps[index]
                  if (step === undefined) return
                  if (editing) {
                    onDeleteStep(step)
                    return
                  }
                  setValues((was) => ({
                    ...was,
                    steps: was.steps.filter((_, at) => at !== index),
                  }))
                }}
                onMove={(index, to) => {
                  if (to < 0 || to >= steps.length) return
                  const step = steps[index]
                  if (step === undefined) return
                  if (editing) {
                    // 4.6 orders by (position, id) and 7.7 takes a position,
                    // so a move is one PATCH rather than a rewrite.
                    onMoveStep(step, to + 1)
                    return
                  }
                  setValues((was) => {
                    const next = [...was.steps]
                    const [moved] = next.splice(index, 1)
                    if (moved !== undefined) next.splice(to, 0, moved)
                    return { ...was, steps: next }
                  })
                }}
              />
            </PropertyRow>

            <PropertyRow icon={AlignLeft} label={FIELD_NOTES} htmlFor={`${ids}-notes`}>
              {/* Compact at rest, growing with its content: an empty
                  three-line block above a single-line row read as a hole in
                  the column, and the design's own notes row opens at one
                  line. It commits when it is left, for the reason the title
                  does. */}
              <textarea
                id={`${ids}-notes`}
                rows={1}
                value={values.notes}
                placeholder="Add notes"
                onChange={(event) => {
                  set('notes', event.target.value)
                }}
                onBlur={commitText}
                className="max-h-56 min-h-[var(--task-form-property-row-height)] w-full resize-y rounded-md border-0 bg-transparent px-2 py-2 text-sm [field-sizing:content] outline-none placeholder:text-muted-foreground hover:bg-[var(--color-graphite-50)] focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </PropertyRow>

            {moveNotice === null ? null : (
              <p role="status" className="px-2 text-xs text-[var(--color-graphite-600)]">
                {moveNotice}
              </p>
            )}

            {inviting ? (
              <InviteByEmail
                folderId={values.folderId}
                folderName={folderDetail.data?.name ?? ''}
                id={`${ids}-invite`}
              />
            ) : null}
          </div>
        </div>

        {/* 9.3's read-only history read. Outside the scrolling region and
            above the footer, which is his placement: it is about the task
            rather than a field of it. */}
        {editing ? (
          <TaskHistory
            createdAt={task.created_at}
            createdBy={task.created_by}
            completedAt={task.completed_at}
            completedBy={task.completed_by}
            people={people}
          />
        ) : null}

        {/* 9.3's v2 footer toolbar: "the completion control, the star, and
            'More actions'". No Save and no Close: every edit has already
            committed by the time a person looks at this row, which is the
            whole of what the v2 opening changes about this surface. */}
        <SheetFooter className="mt-0 shrink-0 flex-row items-center gap-2 bg-card px-6 py-4">
          {/* Absent on an abandoned task, which 5.1 refuses to complete at
              all: a control that cannot act is the "control that leads
              nowhere" this role exists to prevent. Its two names are 9.1's
              names table, which makes it and 9.4's row checkbox one control
              pointed at one object from two places. */}
          {editing && task.status !== 'abandoned' ? (
            <Checkbox
              checked={completed}
              onCheckedChange={toggleComplete}
              aria-label={completed ? MARK_AS_NOT_DONE : COMPLETE_TASK}
              className="size-[var(--checkbox-size)] shrink-0 data-checked:border-[var(--color-graphite-700)] data-checked:bg-[var(--color-graphite-700)]"
            />
          ) : null}

          {/* 9.3's star, as 9.1's switch. The input carries the state and the
              name; the label carries his glyph, so one control is both, and
              9.1's names table gives it a name per state. */}
          <label
            htmlFor={`${ids}-important`}
            title={values.important ? STAR_ON : STAR_OFF}
            className={cn(
              'relative inline-flex size-[var(--control-height)] shrink-0 items-center justify-center rounded-md text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]',
              values.important && 'text-[var(--color-graphite-900)]',
            )}
          >
            <input
              id={`${ids}-important`}
              type="checkbox"
              role="switch"
              checked={values.important}
              onChange={(event) => {
                chipChange({ ...values, important: event.target.checked })
              }}
              className="absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
            />
            <Star
              className={cn('size-5', values.important && 'fill-current')}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="sr-only">{values.important ? STAR_ON : STAR_OFF}</span>
          </label>

          <div className="flex-1" />

          {/* 9.3's overflow menu. Creation has nothing to delete, so the menu
              is absent rather than a trigger onto nothing. Its name is 9.1's
              and is shared with a task row's menu deliberately, the two being
              the same control pointed at different objects. */}
          {editing ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={MORE_ACTIONS}
                    className="size-[var(--control-height)] shrink-0 rounded-md text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]"
                  />
                }
              >
                <MoreHorizontal className="!size-5" strokeWidth={1.75} aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={onDelete}
                  className="min-h-[var(--control-height)] text-sm"
                >
                  <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {DELETE_TASK}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </SheetFooter>
      </div>

      {/* The two confirmations left on this surface, each 9.1's two controls
          and each section 9's own sentence delivered as one text run. 9.3's
          delete confirm is not among them: v2 deletes to Trash "with the undo
          bar, and no confirmation: two ways back is why the question left". */}
      <FormConfirm
        open={clearing}
        message={CLEAR_DATE_WARNING}
        onOpenChange={setClearing}
        onContinue={runClearDate}
      />
      <FormConfirm
        open={confirmUncomplete}
        message={UNCOMPLETE_SERIES_CONFIRM}
        onOpenChange={setConfirmUncomplete}
        onContinue={() => {
          setConfirmUncomplete(false)
          onToggleComplete('uncomplete')
        }}
      />
    </>
  )
}

/**
 * A confirmation as 9.1 fixes one: the section's sentence, then "Continue" and
 * "Cancel", uniformly, because the destructive verb is already in the message
 * the person is reading.
 *
 * The sentence is the dialog's title and nothing else, which is what keeps it
 * one text run: RFC 0002 measured the designer's split of a confirm across a
 * title and a description and found that a block boundary is where a reader
 * stops hearing one sentence, so section 9's copy is never delivered in two
 * pieces here.
 */
function FormConfirm({
  open,
  message,
  destructive = false,
  onOpenChange,
  onContinue,
}: {
  readonly open: boolean
  readonly message: string
  readonly destructive?: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onContinue: () => void
}): React.JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm leading-5 font-normal">
            {message}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction destructive={destructive} onClick={onContinue}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * 9.3's "Invite by email", which opens the sharing flow with this folder
 * attached and, on send, shows the pending chip.
 *
 * The panel of 9.6 is a page's, so what the form offers is the one field that
 * flow needs from here. 7.5 answers 409 for an address already connected and
 * 9.1 requires that message verbatim, which the query client already raises;
 * nothing here catches its own error.
 */
function InviteByEmail({
  folderId,
  folderName,
  id,
}: {
  readonly folderId: string
  readonly folderName: string
  readonly id: string
}): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const invite = useCreateInvite()

  function send(): void {
    const address = email.trim()
    if (address === '') return
    // 7.5 takes the folder so 8.7 grants membership on acceptance, which is
    // what "with this folder attached" means. task_id is not sent: a create
    // has no task yet, and an assignment invite against a task the person has
    // not saved would name a row that does not exist.
    invite.mutate({ email: address, folder_id: folderId }, { onSuccess: () => { setSent(address) } })
  }

  return (
    <>
      <PropertyRow icon={UserPlus} label="Invite" htmlFor={id}>
        <div>
          <div className="flex items-center gap-1">
            <Input
              id={id}
              type="email"
              value={email}
              placeholder="name@example.com"
              onChange={(event) => {
                setEmail(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                send()
              }}
              className="h-[var(--task-form-property-row-height)] border-0 bg-[var(--color-graphite-50)] px-2 text-sm shadow-none"
            />
            <Button
              type="button"
              variant="ghost"
              disabled={invite.isPending}
              onClick={send}
              className="h-[var(--task-form-property-row-height)] px-2.5 text-xs hover:bg-[var(--color-graphite-100)]"
            >
              Send
            </Button>
          </div>
          <p className="px-2 pt-1 text-[11px] text-muted-foreground">
            Share {folderName} and assign this task.
          </p>
        </div>
      </PropertyRow>

      {/* 9.8's chip, which the form shows while an assignment invite is out. */}
      {sent === null ? null : (
        <div className="ml-[140px] flex min-h-8 items-center px-2">
          <Badge
            variant="outline"
            className="max-w-full border-[var(--color-info-200)] bg-[var(--color-info-100)] text-[var(--color-info-700)]"
          >
            <span className="truncate">{`Invite pending: ${sent}`}</span>
          </Badge>
        </div>
      )}
    </>
  )
}
