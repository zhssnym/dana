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
cascade to warn about.

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

Until the second change control this control was held and discarded, which is
the worst kind of defect this suite can miss: a field offered, silently
dropped, and nothing anywhere telling the person. AC-169 and AC-170 exist for
it and assert the stored row rather than the form.
*/
import { useId, useState } from 'react'

import { useCreateInvite } from '../../api/mutations.js'
import { useFolder, useFolders, useMe } from '../../api/queries.js'
import type { Folder } from '../../../shared/folders.js'
import type {
  PatchTaskBody,
  PostTasksBody,
  ReminderInput,
  TaskDetail,
} from '../../../shared/tasks.js'
import { RECURRENCE_WEEKDAYS } from '../../../shared/recurrence.js'
import type { RecurrenceWeekday } from '../../../shared/recurrence.js'
import { Button, ConfirmDialog, DELETE_TASK_CONFIRM, OverflowMenu } from '../ui/index.js'
import {
  CLEAR_DATE_WARNING,
  DATE_DEPENDENT_HELPER,
  INVITE_BY_EMAIL,
  MORE_OPTIONS,
  SAVE,
  TITLE_REQUIRED,
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
  const [inviting, setInviting] = useState(false)

  const me = useMe()
  const folders = useFolders()
  const folderDetail = useFolder(values.folderId)

  const editing = task !== null
  const dated = values.dueDate !== ''
  const helperId = `${ids}-date-helper`
  const describedBy = dated ? undefined : helperId

  const viewerId = me.data?.user.id ?? null
  const members = folderDetail.data?.members ?? []

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

  return (
    <div>
      {errors.map((message) => (
        <p key={message} role="alert">
          {message}
        </p>
      ))}

      <p>
        <label htmlFor={`${ids}-title`}>Title</label>
        <input
          id={`${ids}-title`}
          type="text"
          value={values.title}
          onChange={(event) => set('title', event.target.value)}
        />
      </p>

      <p>
        <label htmlFor={`${ids}-due-date`}>Due date</label>
        <input
          id={`${ids}-due-date`}
          type="date"
          value={values.dueDate}
          onChange={(event) => onDueDateChange(event.target.value)}
        />
      </p>

      <p>
        <input
          id={`${ids}-important`}
          type="checkbox"
          checked={values.important}
          onChange={(event) => set('important', event.target.checked)}
        />
        <label htmlFor={`${ids}-important`}>Important</label>
      </p>

      {/* A raw button rather than the library's, for `aria-expanded`: 9.3
          calls this an expander, and what open and closed mean is that state
          rather than a glyph. */}
      <button
        type="button"
        className="button-base button-default"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {MORE_OPTIONS}
      </button>

      {expanded ? (
        <div>
          <p>
            <label htmlFor={`${ids}-notes`}>Notes</label>
            <textarea
              id={`${ids}-notes`}
              value={values.notes}
              onChange={(event) => set('notes', event.target.value)}
            />
          </p>

          <p>
            <label htmlFor={`${ids}-folder`}>Folder</label>
            <select
              id={`${ids}-folder`}
              value={values.folderId}
              onChange={(event) => onFolderChange(event.target.value)}
            >
              {(folders.data ?? []).map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </p>

          {assigneeVisible ? (
            <p>
              <label htmlFor={`${ids}-assignee`}>Assignee</label>
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
              >
                {members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.display_name ?? 'Someone'}
                  </option>
                ))}
                {/* 9.3: the dropdown carries the invite option, which opens
                    the sharing flow with this folder attached. */}
                <option value="__invite">{INVITE_BY_EMAIL}</option>
              </select>
            </p>
          ) : null}

          {moveNotice === null ? null : <p role="status">{moveNotice}</p>}

          <p>
            <label htmlFor={`${ids}-due-time`}>Due time</label>
            <input
              id={`${ids}-due-time`}
              type="time"
              disabled={!dated}
              aria-describedby={describedBy}
              value={values.dueTime}
              onChange={(event) => set('dueTime', event.target.value)}
            />
          </p>

          <p>
            <label htmlFor={`${ids}-reminder`}>Reminder</label>
            {values.dueTime === '' ? (
              <input
                id={`${ids}-reminder`}
                type="time"
                disabled={!dated}
                aria-describedby={describedBy}
                value={values.reminderTime}
                onChange={(event) => set('reminderTime', event.target.value)}
              />
            ) : (
              <select
                id={`${ids}-reminder`}
                disabled={!dated}
                aria-describedby={describedBy}
                value={values.reminderOffset === null ? '' : String(values.reminderOffset)}
                onChange={(event) =>
                  set(
                    'reminderOffset',
                    event.target.value === '' ? null : Number(event.target.value),
                  )
                }
              >
                <option value="">No reminder</option>
                {OFFSETS.map((minutes) => (
                  <option key={minutes} value={String(minutes)}>
                    {offsetLabel(minutes)}
                  </option>
                ))}
              </select>
            )}
          </p>

          <p>
            <label htmlFor={`${ids}-repeat`}>Repeat</label>
            <select
              id={`${ids}-repeat`}
              disabled={!dated}
              aria-describedby={describedBy}
              value={values.repeat.preset}
              onChange={(event) =>
                set('repeat', {
                  ...values.repeat,
                  preset: event.target.value as RepeatState['preset'],
                })
              }
            >
              {PRESET_ORDER.map((preset) => (
                <option key={preset} value={preset}>
                  {PRESET_LABELS[preset]}
                </option>
              ))}
            </select>
          </p>

          {/* The parts a preset asks for, and only the parts it asks for. A
              free-form rule box is what 4.11 forbids; these are the presets'
              own operands. */}
          {dated && (values.repeat.preset === 'weekly' || values.repeat.preset === 'everyNWeeks') ? (
            <fieldset>
              <legend>Repeat days</legend>
              {RECURRENCE_WEEKDAYS.map((day) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={values.repeat.days.includes(day)}
                    onChange={(event) => {
                      const next: RecurrenceWeekday[] = event.target.checked
                        ? [...values.repeat.days, day]
                        : values.repeat.days.filter((chosen) => chosen !== day)
                      set('repeat', { ...values.repeat, days: next })
                    }}
                  />
                  {WEEKDAY_LABELS[day]}
                </label>
              ))}
            </fieldset>
          ) : null}

          {dated &&
          (values.repeat.preset === 'everyNDays' || values.repeat.preset === 'everyNWeeks') ? (
            <p>
              <label htmlFor={`${ids}-interval`}>Repeat every</label>
              <input
                id={`${ids}-interval`}
                type="number"
                min={1}
                max={99}
                value={values.repeat.interval}
                onChange={(event) =>
                  set('repeat', { ...values.repeat, interval: Number(event.target.value) })
                }
              />
            </p>
          ) : null}

          {dated && values.repeat.preset === 'monthly' ? (
            <p>
              <label htmlFor={`${ids}-month-day`}>Repeat on day</label>
              <input
                id={`${ids}-month-day`}
                type="number"
                min={1}
                max={28}
                value={values.repeat.monthDay}
                onChange={(event) =>
                  set('repeat', { ...values.repeat, monthDay: Number(event.target.value) })
                }
              />
            </p>
          ) : null}

          {dated && values.repeat.preset !== 'none' ? (
            <p>
              <label htmlFor={`${ids}-until`}>Ends on</label>
              <input
                id={`${ids}-until`}
                type="date"
                value={values.repeat.until}
                onChange={(event) =>
                  set('repeat', { ...values.repeat, until: event.target.value })
                }
              />
            </p>
          ) : null}

          {/* One helper for the three, referenced by each. 9.3 gives all three
              the same string, and three copies of one sentence is three things
              on the page saying it. */}
          {dated ? null : <p id={helperId}>{DATE_DEPENDENT_HELPER}</p>}

          <StepsEditor
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
                // 4.6 orders by (position, id) and 7.7 takes a position, so a
                // move is one PATCH rather than a rewrite of the list.
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

          {inviting ? <InviteByEmail folderId={values.folderId} /> : null}
        </div>
      ) : null}

      <Button tone="primary" onClick={save} disabled={saving}>
        {SAVE}
      </Button>

      {/* 9.3: delete lives in the form's overflow menu, behind its confirm.
          Creation has nothing to delete, so the menu carries no entry and
          `OverflowMenu` renders nothing rather than a trigger onto nothing. */}
      <OverflowMenu
        entries={
          editing
            ? [{ label: 'Delete', onSelect: () => setConfirmDelete(true) }]
            : []
        }
      />

      {clearing ? (
        <ConfirmDialog
          message={CLEAR_DATE_WARNING}
          onContinue={runClearDate}
          onCancel={() => setClearing(false)}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          message={DELETE_TASK_CONFIRM}
          onContinue={() => {
            setConfirmDelete(false)
            onDelete()
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
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
function InviteByEmail({ folderId }: { readonly folderId: string }): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const invite = useCreateInvite()
  const ids = useId()
  return (
    <p>
      <label htmlFor={`${ids}-invite`}>Invite email</label>
      <input
        id={`${ids}-invite`}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Button
        disabled={invite.isPending}
        onClick={() => {
          const address = email.trim()
          if (address === '') return
          // 7.5 takes the folder so 8.7 grants membership on acceptance, which
          // is what "with this folder attached" means. task_id is not sent: a
          // create has no task yet, and an assignment invite against a task
          // the person has not saved would name a row that does not exist.
          invite.mutate(
            { email: address, folder_id: folderId },
            { onSuccess: () => setSent(address) },
          )
        }}
      >
        Send invite
      </Button>
      {/* 9.8's chip, which the form shows while an assignment invite is out. */}
      {sent === null ? null : <span>{`Invite pending: ${sent}`}</span>}
    </p>
  )
}
