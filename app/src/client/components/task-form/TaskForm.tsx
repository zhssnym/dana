/*
9.3's task form, which is one artifact for creation and for editing and is a
state machine rather than a set of fields.

The dependency table is the spine of this file and it is implemented cell by
cell, because AC-092 to AC-094 read it that way. Three of its words carry
weight and the table defines two of them at the top: **disabled** means
visible but inoperable with helper text, **hidden** means absent. A greyed-out
assignee field in a single-member folder is the wrong state and not a softer
version of the right one.

Four decisions this file is built around.

**The moment of enablement is the render, not the blur and not the save.** 9.3
fixes it at the instant due date receives a value, in the same render, so the
date lives in React state and the three dependents read `dueDate !== ''`
directly. Anything derived on submit or on focus loss renders a form whose
repeat control is inoperable with a date sitting in the field beside it, which
is the fast-typing race the specification calls out and this role exists to
prevent.

**The clear-date warning is a gate, not a notice.** 8.4's cascade runs after
the warning, so a declined warning has cleared nothing, the date included.
That is why the date input is controlled and why clearing it does not write
state: the change opens the dialog, React restores the input to what the form
still holds, and only "Continue" applies the four-field cascade. A dialog that
cleared first and explained second satisfies AC-092's own sentence and fails
the case beneath it. The warning is shown when a rule or reminder exists,
which is 8.4's own condition, and clearing a date with neither is not a
cascade to warn about. Every way of emptying the field runs through one
function, so his "Clear" preset is gated exactly as typing over the field is.

**The three dependents share one helper.** 9.3 gives all three the same string
in its "On disable, helper" column, and three copies of one sentence is three
things on the page saying the same thing; one element with three
`aria-describedby` references says it once and announces it on each control,
which is what the column asks for.

**Validation here is convenience and the server's rules are the real ones**
(7.11), so nothing below refuses anything the server would accept. What it
adds is the copy 9.3 writes for the three refusals a person meets most, and
the reason it needs to exist at all is that a convenience nobody measures is a
convenience the person meets as a silent failure.

**The reminder is saved like every other field of this form**, which the
second P8 change control ruled a client obligation with no frozen text moving,
on the ground that the contract already carried everything needed. It reads
off the two arms of 9.3's control the way 4.8 stores it, exactly one of the
two columns non-null, and `save` hands it to the caller as a third value
rather than folding it into either body. That split is the contract's and not
a preference: frozen 7.6 gives the create body a `reminder` arm, and frozen
7.6's PATCH carries no reminder key at all, so an existing task's reminder is
written through 7.9's PUT and removed through its DELETE. Which of the three
a save performs is `TaskFormOverlay`'s, because it is the file holding the
mutations.

---

**What P8R session R7 changed, and the four places the port declines to follow
the prototype.** The composition below is the designer's `task-form.tsx`: his
right-hand sheet, his header with the title on one line beside the star and the
overflow menu, his icon-and-label property rows, his hover-revealed step
controls, his invite row, his history block and his footer. RFC 0002 makes that
file the source rather than a reference, so a difference is a defect in the port
"unless a numbered section says otherwise". These four are numbered sections
saying otherwise, and they are listed here so nobody has to diff two files to
find them.

1. **The ten fields keep their own names**, 9.3's first column, which that
   section made normative at the RFC 0002 change control. His title input is
   labelled "Task name" and his important control is a button called "Mark
   important"; here they are "Title" and "Important".
2. **A date-dependent control stays on the page, disabled, with the helper.**
   His `DependencyValue` replaces the control with a line of text, which is
   9.3's *hidden* where the table says *disabled*, and the table opens by
   defining the difference.
3. **The ten fields are native controls.** 9.3 fixes what a field is called and
   what it holds, and section 9 chooses no widgets; what decides it here is that
   a due date must hold 4.11's value rather than a rendering of it, a reminder
   must be emptiable, and both are read as such by AC-092, AC-093, AC-169 and
   AC-170. A trigger button showing "Today" holds nothing a person or a test can
   read back. So the controls are `input` and `select` wearing his row.
4. **The expander opens closed, in edit mode too.** His form auto-expands when
   it opens on a task. 9.3 puts seven fields behind one expander and says
   nothing about a state it opens in; what settles it is that the expander is
   the only way a person collapses those seven, and a form that opens expanded
   turns every criterion's "click More options" into a collapse.

The date presets, the resize handle, the hover treatments and the history block
are his and arrive unchanged.
*/
import { useId, useState } from 'react'
import {
  AlignLeft,
  Bell,
  CalendarDays,
  ChevronDown,
  Clock3,
  Folder as FolderIcon,
  ListChecks,
  MoreHorizontal,
  Repeat2,
  Star,
  Trash2,
  UserPlus,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
import { RECURRENCE_WEEKDAYS } from '../../../shared/recurrence.js'
import type { RecurrenceWeekday } from '../../../shared/recurrence.js'
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
  DELETE_TASK_CONFIRM,
  MARK_AS_NOT_DONE,
  MORE_ACTIONS,
} from '../ui/copy.js'
import {
  CLEAR_DATE_WARNING,
  CLOSE,
  DATE_CLEAR,
  DATE_DEPENDENT_HELPER,
  DATE_TODAY,
  DATE_TOMORROW,
  DELETE_TASK,
  FIELD_ASSIGNEE,
  FIELD_DUE_DATE,
  FIELD_DUE_TIME,
  FIELD_FOLDER,
  FIELD_IMPORTANT,
  FIELD_NOTES,
  FIELD_REMINDER,
  FIELD_REPEAT,
  FIELD_STEPS,
  FIELD_TITLE,
  INVITE_BY_EMAIL,
  MORE_OPTIONS,
  SAVE,
  TITLE_REQUIRED,
  UNCOMPLETE_SERIES_CONFIRM,
  moveWouldUnassign,
  tooLong,
} from './copy.js'
import {
  fromRuleString,
  NO_REPEAT,
  PRESET_LABELS,
  PRESET_ORDER,
  toRuleString,
  WEEKDAY_LABELS,
} from './presets.js'
import type { RepeatState } from './presets.js'
import { STEP_CAP, StepsEditor } from './StepsEditor.js'
import type { EditorStep } from './StepsEditor.js'
import { TaskHistory } from './TaskHistory.js'
import type { PeopleIndex } from './TaskHistory.js'

/** 10.3's rows, which the over-limit copy reports by number. */
const TITLE_LIMIT = 300
const NOTES_LIMIT = 10000

/** 9.3: with a due time the reminder is an offset picker, without it a
 * time-of-day picker. The offsets are this control's; 4.8 bounds them and
 * 8.6 computes from them. */
const OFFSETS = [0, 5, 10, 15, 30, 60, 120, 1440] as const

function offsetLabel(minutes: number): string {
  if (minutes === 0) return 'At the due time'
  if (minutes < 60) return `${String(minutes)} minutes before`
  if (minutes === 60) return '1 hour before'
  if (minutes < 1440) return `${String(minutes / 60)} hours before`
  return '1 day before'
}

/**
 * The day after a 4.11 civil date, which is what his "Tomorrow" preset offers.
 *
 * Arithmetic on a date string rather than a reading of a clock: the only clock
 * this client reads is `api/tz.ts`, reached here through `presenterToday()`,
 * and this shifts that answer by one day at noon UTC so no zone offset can
 * carry it across a boundary. It is not a display shape and has no business in
 * `parts/presenters.ts`, which formats what a row shows and re-derives no
 * ordering; nothing here is rendered.
 */
function dayAfter(civilDate: string): string {
  const noon = new Date(`${civilDate}T12:00:00Z`)
  if (Number.isNaN(noon.getTime())) return civilDate
  noon.setUTCDate(noon.getUTCDate() + 1)
  return noon.toISOString().slice(0, 10)
}

/** The class every field control wears so his rows read as one column. */
const FIELD_CONTROL =
  'h-[var(--task-form-property-row-height)] w-full min-w-0 rounded-md border-0 bg-transparent px-2 text-sm text-foreground outline-none hover:bg-[var(--color-graphite-50)] focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:text-[var(--color-graphite-400)] disabled:hover:bg-transparent [&::-webkit-calendar-picker-indicator]:opacity-55 [&:hover::-webkit-calendar-picker-indicator]:opacity-100'

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
  /**
   * The three values one save carries: the create body, the patch body, and
   * what the reminder should become. The third is separate because the
   * contract puts it on two endpoints, 7.6's create arm and 7.9's PUT and
   * DELETE, and this component does not know which of them it is on.
   */
  readonly onSave: (
    create: PostTasksBody | null,
    patch: PatchTaskBody | null,
    reminder: ReminderInput | null,
  ) => void
  readonly onDelete: () => void
  /**
   * 9.3's completion control, in edit mode: "the same transition 9.4's row
   * checkbox and 9.5's 'Mark as not done' make". The transition is the
   * overlay's, which holds the mutations; the confirmation is this file's,
   * because 9.5 makes it a property of the branch rather than of the endpoint.
   */
  readonly onToggleComplete: (event: 'complete' | 'uncomplete') => void
  readonly onClose: () => void
  readonly onAppendStep: (title: string) => void
  readonly onToggleStep: (step: EditorStep) => void
  readonly onDeleteStep: (step: EditorStep) => void
  readonly onMoveStep: (step: EditorStep, position: number) => void
  readonly saving: boolean
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
  onSave,
  onDelete,
  onToggleComplete,
  onClose,
  onAppendStep,
  onToggleStep,
  onDeleteStep,
  onMoveStep,
  saving,
}: TaskFormProps): React.JSX.Element {
  const ids = useId()
  const [values, setValues] = useState<FormValues>(initial)
  const [expanded, setExpanded] = useState(false)
  const [errors, setErrors] = useState<readonly string[]>([])
  const [clearing, setClearing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmUncomplete, setConfirmUncomplete] = useState(false)
  const [inviting, setInviting] = useState(false)

  const me = useMe()
  const folders = useFolders()
  const folderDetail = useFolder(values.folderId)
  const connections = useConnections()

  const editing = task !== null
  const dated = values.dueDate !== ''
  const helperId = `${ids}-date-helper`
  const describedBy = dated ? undefined : helperId

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
    setValues((was) => ({
      ...was,
      dueDate: '',
      dueTime: '',
      reminderTime: '',
      reminderOffset: null,
      repeat: NO_REPEAT,
    }))
    setClearing(false)
  }

  function onDueDateChange(next: string): void {
    if (next !== '') {
      set('dueDate', next)
      return
    }
    // 8.4: "The client shows a warning first when a rule or reminder exists."
    const cascades =
      values.repeat.preset !== 'none' ||
      values.reminderTime !== '' ||
      values.reminderOffset !== null ||
      values.dueTime !== ''
    if (!cascades) {
      set('dueDate', '')
      return
    }
    // Nothing is written here, which is the whole of the "gate, not notice"
    // rule: the state still holds the date, so React restores the input to it
    // and a declined warning has cleared nothing.
    setClearing(true)
  }

  function onFolderChange(next: string): void {
    setValues((was) => ({ ...was, folderId: next }))
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
  const selectedAssignee = assigneeInFolder
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

  function validate(): string[] {
    const found: string[] = []
    if (values.title.trim() === '') found.push(TITLE_REQUIRED)
    else if (values.title.length > TITLE_LIMIT) found.push(tooLong(TITLE_LIMIT))
    if (values.notes.length > NOTES_LIMIT) found.push(tooLong(NOTES_LIMIT))
    return found
  }

  function save(): void {
    const found = validate()
    setErrors(found)
    if (found.length > 0) return

    const rule = toRuleString(values.repeat)
    const dueDate = dated ? values.dueDate : null
    const dueTime = dated && values.dueTime !== '' ? values.dueTime : null

    /*
    What the form is asking for the reminder to become, in 4.8's shape.

    The mode follows the due time and never the arm the person last touched,
    which is 9.3's own rule ("reminder control switches mode with due time")
    and is what frozen 7.9 answers 422 on getting wrong. So a task that gained
    a time sends the offset arm and one that lost it sends the time-of-day
    arm, whatever the other arm still holds from before the switch.

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
          ? values.reminderOffset === null
            ? null
            : { offset_minutes: values.reminderOffset, time_of_day: null }
          : values.reminderTime === ''
            ? null
            : { offset_minutes: null, time_of_day: values.reminderTime }

    if (editing) {
      const patch: PatchTaskBody = {
        title: values.title.trim(),
        notes: values.notes === '' ? null : values.notes,
        important: values.important,
        folder_id: values.folderId,
        due_date: dueDate,
        due_time: dueTime,
        recurrence_rule: dueDate === null ? null : rule,
      }
      // INV-5: a null assignee is 7.6's 409 in a single-member folder, and the
      // field is not on the form there at all, so the key is left out rather
      // than sent as a value the server would have to repair.
      const body = assigneeVisible ? { ...patch, assignee_id: selectedAssignee } : patch
      onSave(null, body, reminder)
      return
    }

    const create: PostTasksBody = {
      title: values.title.trim(),
      folder_id: values.folderId,
      notes: values.notes === '' ? null : values.notes,
      important: values.important,
      due_date: dueDate,
      due_time: dueTime,
      recurrence_rule: dueDate === null ? null : rule,
      steps: values.steps.map((step) => step.title),
      // Frozen 7.6's own arm. Absent rather than null when the form carries
      // none, because a create that names no reminder is not a create that
      // clears one.
      ...(reminder === null ? {} : { reminder }),
    }
    onSave(assigneeVisible ? { ...create, assignee_id: selectedAssignee } : create, null, reminder)
  }

  const today = presenterToday()

  return (
    <>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <SheetHeader className="shrink-0 gap-0 px-6 pt-5 pb-2">
          <div className="flex items-start gap-1">
            {/* 9.3's completion control, in edit mode. Absent on an abandoned
                task, which 5.1 refuses to complete at all: a control that
                cannot act is the "control that leads nowhere" this role exists
                to prevent. Its two names are 9.1's names table, which makes it
                and 9.4's row checkbox one control pointed at one object from
                two places. */}
            {editing && task.status !== 'abandoned' ? (
              <Checkbox
                checked={completed}
                onCheckedChange={toggleComplete}
                aria-label={completed ? MARK_AS_NOT_DONE : COMPLETE_TASK}
                className="mt-1.5 size-[var(--checkbox-size)] shrink-0 data-checked:border-[var(--color-graphite-700)] data-checked:bg-[var(--color-graphite-700)]"
              />
            ) : null}

            <div className="min-w-0 flex-1">
              {/* The name announces and the name addresses (9.1). The label is
                  for a screen reader and a test; his design puts the field's
                  own placeholder where a sighted person reads it. */}
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
                className="h-auto min-h-[var(--control-height)] border-0 bg-transparent px-1 py-1 shadow-none placeholder:text-[var(--color-graphite-400)] focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0"
              />
            </div>

            {/* 9.3's inline toggle for important, as his star and as 9.1's
                switch. The input carries the state and the name; the label
                carries his glyph, so one control is both. */}
            <label
              htmlFor={`${ids}-important`}
              title={FIELD_IMPORTANT}
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
                  set('important', event.target.checked)
                }}
                className="absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
              />
              <Star
                className={cn('size-5', values.important && 'fill-current')}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="sr-only">{FIELD_IMPORTANT}</span>
            </label>

            {/* 9.3: delete lives in the form's overflow menu, behind its
                confirm. Creation has nothing to delete, so the menu is absent
                rather than a trigger onto nothing. Its name is 9.1's and is
                shared with a task row's menu deliberately, the two being the
                same control pointed at different objects. */}
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
                    onClick={() => {
                      setConfirmDelete(true)
                    }}
                    className="min-h-[var(--control-height)] text-sm"
                  >
                    <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    {DELETE_TASK}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          {errors.map((message) => (
            <p key={message} role="alert" className="mt-1 px-1 text-xs text-destructive">
              {message}
            </p>
          ))}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-1">
          <PropertyRow icon={CalendarDays} label={FIELD_DUE_DATE} htmlFor={`${ids}-due-date`}>
            <div className="flex items-center gap-1">
              <input
                id={`${ids}-due-date`}
                type="date"
                value={values.dueDate}
                onChange={(event) => {
                  onDueDateChange(event.target.value)
                }}
                className={FIELD_CONTROL}
              />
              {/* His three presets. "Clear" is offered only with a date set,
                  which is his rule, and it runs the same 8.4 gate that typing
                  the field empty runs. */}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onDueDateChange(today)
                }}
                className="h-9 shrink-0 px-2.5 text-xs hover:bg-[var(--color-graphite-100)]"
              >
                {DATE_TODAY}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onDueDateChange(dayAfter(today))
                }}
                className="h-9 shrink-0 px-2.5 text-xs hover:bg-[var(--color-graphite-100)]"
              >
                {DATE_TOMORROW}
              </Button>
              {dated ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onDueDateChange('')
                  }}
                  className="h-9 shrink-0 px-2.5 text-xs text-muted-foreground hover:bg-[var(--color-graphite-100)] hover:text-foreground"
                >
                  {DATE_CLEAR}
                </Button>
              ) : null}
            </div>
          </PropertyRow>

          {/* A raw button rather than the library's, for `aria-expanded`: 9.3
              calls this an expander, and what open and closed mean is that
              state rather than a glyph. */}
          <button
            data-task-form-tier="disclosure"
            type="button"
            aria-expanded={expanded}
            onClick={() => {
              setExpanded(!expanded)
            }}
            className="mt-1 flex h-[var(--task-form-property-row-height)] w-full items-center justify-between rounded-md px-1 text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-800)]"
          >
            <span>{MORE_OPTIONS}</span>
            <ChevronDown
              className={cn('size-4 transition-transform', expanded && 'rotate-180')}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>

          {expanded ? (
            <div className="mt-1 space-y-1 pb-4">
              {/* 9.3's own order for the seven behind the expander: notes,
                  folder, assignee, due time, reminder, repeat, steps. His
                  prototype puts notes last; the section fixes what the form
                  holds and in what order, so the order is the section's. */}
              <PropertyRow icon={AlignLeft} label={FIELD_NOTES} htmlFor={`${ids}-notes`}>
                {/* Compact at rest like every sibling row, growing with its
                    content: an empty three-line block above six single-line
                    rows read as a hole in the column, and the design's own
                    notes row opens at one line. */}
                <textarea
                  id={`${ids}-notes`}
                  rows={1}
                  value={values.notes}
                  placeholder="Add notes"
                  onChange={(event) => {
                    set('notes', event.target.value)
                  }}
                  className="max-h-56 min-h-[var(--task-form-property-row-height)] w-full resize-y rounded-md border-0 bg-transparent px-2 py-2 text-sm [field-sizing:content] outline-none placeholder:text-muted-foreground hover:bg-[var(--color-graphite-50)] focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </PropertyRow>

              <PropertyRow icon={FolderIcon} label={FIELD_FOLDER} htmlFor={`${ids}-folder`}>
                <select
                  id={`${ids}-folder`}
                  value={values.folderId}
                  onChange={(event) => {
                    onFolderChange(event.target.value)
                  }}
                  className={FIELD_CONTROL}
                >
                  {(folders.data ?? []).map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </PropertyRow>

              {assigneeVisible ? (
                <>
                  <PropertyRow
                    icon={UserRound}
                    label={FIELD_ASSIGNEE}
                    htmlFor={`${ids}-assignee`}
                  >
                    <select
                      id={`${ids}-assignee`}
                      value={inviting ? '__invite' : (selectedAssignee ?? '')}
                      onChange={(event) => {
                        if (event.target.value === '__invite') {
                          setInviting(true)
                          return
                        }
                        setInviting(false)
                        set('assigneeId', event.target.value)
                      }}
                      className={FIELD_CONTROL}
                    >
                      {members.map((member) => (
                        <option key={member.user.id} value={member.user.id}>
                          {member.user.display_name ?? 'Someone'}
                        </option>
                      ))}
                      {/* 9.3: the dropdown carries the invite option, which
                          opens the sharing flow with this folder attached. */}
                      <option value="__invite">{INVITE_BY_EMAIL}</option>
                    </select>
                  </PropertyRow>

                  {inviting ? (
                    <InviteByEmail
                      folderId={values.folderId}
                      folderName={folderDetail.data?.name ?? ''}
                      id={`${ids}-invite`}
                    />
                  ) : null}
                </>
              ) : null}

              {moveNotice === null ? null : (
                <p role="status" className="px-2 pt-1 text-xs text-muted-foreground">
                  {moveNotice}
                </p>
              )}

              <PropertyRow icon={Clock3} label={FIELD_DUE_TIME} htmlFor={`${ids}-due-time`}>
                <input
                  id={`${ids}-due-time`}
                  type="time"
                  disabled={!dated}
                  aria-describedby={describedBy}
                  value={values.dueTime}
                  onChange={(event) => {
                    set('dueTime', event.target.value)
                  }}
                  className={FIELD_CONTROL}
                />
              </PropertyRow>

              <PropertyRow icon={Bell} label={FIELD_REMINDER} htmlFor={`${ids}-reminder`}>
                {values.dueTime === '' ? (
                  <input
                    id={`${ids}-reminder`}
                    type="time"
                    disabled={!dated}
                    aria-describedby={describedBy}
                    value={values.reminderTime}
                    onChange={(event) => {
                      set('reminderTime', event.target.value)
                    }}
                    className={FIELD_CONTROL}
                  />
                ) : (
                  <select
                    id={`${ids}-reminder`}
                    disabled={!dated}
                    aria-describedby={describedBy}
                    value={values.reminderOffset === null ? '' : String(values.reminderOffset)}
                    onChange={(event) => {
                      set(
                        'reminderOffset',
                        event.target.value === '' ? null : Number(event.target.value),
                      )
                    }}
                    className={FIELD_CONTROL}
                  >
                    <option value="">No reminder</option>
                    {OFFSETS.map((minutes) => (
                      <option key={minutes} value={String(minutes)}>
                        {offsetLabel(minutes)}
                      </option>
                    ))}
                  </select>
                )}
              </PropertyRow>

              <PropertyRow icon={Repeat2} label={FIELD_REPEAT} htmlFor={`${ids}-repeat`}>
                <select
                  id={`${ids}-repeat`}
                  disabled={!dated}
                  aria-describedby={describedBy}
                  value={values.repeat.preset}
                  onChange={(event) => {
                    set('repeat', {
                      ...values.repeat,
                      preset: event.target.value as RepeatState['preset'],
                    })
                  }}
                  className={FIELD_CONTROL}
                >
                  {PRESET_ORDER.map((preset) => (
                    <option key={preset} value={preset}>
                      {PRESET_LABELS[preset]}
                    </option>
                  ))}
                </select>
              </PropertyRow>

              {/* The parts a preset asks for, and only the parts it asks for. A
                  free-form rule box is what 4.11 forbids; these are the presets'
                  own operands, drawn in his indented operand block. */}
              {dated && values.repeat.preset !== 'none' ? (
                <div className="ml-[140px] space-y-2 px-2 pb-2">
                  {values.repeat.preset === 'weekly' ||
                  values.repeat.preset === 'everyNWeeks' ? (
                    <fieldset className="border-0 p-0">
                      <legend className="mb-1 text-[11px] font-medium text-muted-foreground">
                        Repeat on
                      </legend>
                      <div className="flex items-center gap-1">
                        {RECURRENCE_WEEKDAYS.map((day) => {
                          const selected = values.repeat.days.includes(day)
                          return (
                            <label
                              key={day}
                              className={cn(
                                'relative inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-[11px] hover:bg-[var(--color-graphite-100)]',
                                selected &&
                                  'bg-[var(--color-graphite-900)] text-white hover:bg-[var(--color-graphite-800)]',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(event) => {
                                  const next: RecurrenceWeekday[] = event.target.checked
                                    ? [...values.repeat.days, day]
                                    : values.repeat.days.filter((chosen) => chosen !== day)
                                  set('repeat', { ...values.repeat, days: next })
                                }}
                                className="absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
                              />
                              <span aria-hidden="true">{day.slice(0, 1)}</span>
                              <span className="sr-only">{WEEKDAY_LABELS[day]}</span>
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>
                  ) : null}

                  {values.repeat.preset === 'everyNDays' ||
                  values.repeat.preset === 'everyNWeeks' ? (
                    <div className="flex h-[var(--task-form-property-row-height)] items-center gap-2">
                      <label
                        htmlFor={`${ids}-interval`}
                        className="text-xs text-muted-foreground"
                      >
                        Repeat every
                      </label>
                      <Input
                        id={`${ids}-interval`}
                        type="number"
                        min={1}
                        max={99}
                        value={values.repeat.interval}
                        onChange={(event) => {
                          set('repeat', {
                            ...values.repeat,
                            interval: Number(event.target.value),
                          })
                        }}
                        className="h-8 w-16 border-border bg-card px-2 text-center text-sm shadow-none"
                      />
                      <span className="text-sm text-foreground">
                        {values.repeat.preset === 'everyNDays' ? 'days' : 'weeks'}
                      </span>
                    </div>
                  ) : null}

                  {values.repeat.preset === 'monthly' ? (
                    <div className="flex h-[var(--task-form-property-row-height)] items-center gap-2">
                      <label
                        htmlFor={`${ids}-month-day`}
                        className="text-xs text-muted-foreground"
                      >
                        Repeat on day
                      </label>
                      <Input
                        id={`${ids}-month-day`}
                        type="number"
                        min={1}
                        max={28}
                        value={values.repeat.monthDay}
                        onChange={(event) => {
                          set('repeat', {
                            ...values.repeat,
                            monthDay: Number(event.target.value),
                          })
                        }}
                        className="h-8 w-16 border-border bg-card px-2 text-center text-sm shadow-none"
                      />
                    </div>
                  ) : null}

                  <div className="flex h-[var(--task-form-property-row-height)] items-center gap-2">
                    <label htmlFor={`${ids}-until`} className="text-xs text-muted-foreground">
                      Ends on
                    </label>
                    <Input
                      id={`${ids}-until`}
                      type="date"
                      value={values.repeat.until}
                      onChange={(event) => {
                        set('repeat', { ...values.repeat, until: event.target.value })
                      }}
                      className="h-8 w-40 border-border bg-card px-2 text-sm shadow-none"
                    />
                  </div>
                </div>
              ) : null}

              {/* One helper for the three, referenced by each. 9.3 gives all
                  three the same string, and three copies of one sentence is
                  three things on the page saying it. */}
              {dated ? null : (
                <p id={helperId} className="ml-[140px] px-2 text-xs text-[var(--color-graphite-500)]">
                  {DATE_DEPENDENT_HELPER}
                </p>
              )}

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
            </div>
          ) : null}
        </div>

        {/* 9.3's read-only history block, edit mode only. Outside the scrolling
            region and above the footer, which is his placement: it is about the
            task rather than a field of it. */}
        {editing ? (
          <TaskHistory
            createdAt={task.created_at}
            createdBy={task.created_by}
            completedAt={task.completed_at}
            completedBy={task.completed_by}
            people={people}
          />
        ) : null}

        <SheetFooter className="mt-0 shrink-0 flex-row justify-end gap-2 bg-card px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="h-[var(--control-height)] px-4 text-sm hover:bg-[var(--color-graphite-100)]"
          >
            {CLOSE}
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="h-[var(--control-height)] bg-[var(--color-graphite-900)] px-4 text-sm text-white hover:bg-[var(--color-graphite-800)]"
          >
            {SAVE}
          </Button>
        </SheetFooter>
      </form>

      {/* The three confirmations, each 9.1's two controls and each section 9's
          own sentence delivered as one text run. They sit outside the form so
          a press inside them cannot submit it. */}
      <FormConfirm
        open={clearing}
        message={CLEAR_DATE_WARNING}
        onOpenChange={setClearing}
        onContinue={runClearDate}
      />
      <FormConfirm
        open={confirmDelete}
        message={DELETE_TASK_CONFIRM}
        destructive
        onOpenChange={setConfirmDelete}
        onContinue={() => {
          setConfirmDelete(false)
          onDelete()
        }}
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
