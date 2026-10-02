/*
The task page's body: everything a task is, in one quiet column (M4: one
task page, no peek).

Four fixed properties are always shown, in this order: Status, Assignee, Date
(its start, reminder and repeat live inside the Date picker) and Labels. A
collaborative page adds Discussion after Labels; Desk never does because it has
no team conversation. Then "Blocked by" / "Blocks" lines appear once a
relation exists (the editor's `/Blocked by` makes one). Then the task's own
document, whose checklist items are its subtasks and which holds only what the
person wrote, and the task's quiet history, where every act on the task is
recorded. Every edit commits as it is made, so there is no Save.

Files go in the task's document, which takes file and image blocks.
*/

import { Face } from "./person-face.js"
import { Check, Plus, type LucideIcon } from "../lib/icons.js"
import { TaskDependencies, isRelatableTask } from "./task-dependencies.js"
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router"

import {
  PROPERTY_LABEL,
  PROPERTY_ROW,
  PROPERTY_VALUE_OFFSET,
  PickerSegments,
  PropertyPicker,
  ReminderPanel,
  RepeatPanel,
} from "./task-pickers.js"
import { SchedulePanel } from "./task-schedule-picker.js"
import { TaskHistory } from "./thread/TaskHistory.js"
import { usePeopleLibrary } from "../lib/people-library.js"
import { useAllPages, useMe, useTask } from "../api/queries.js"
import { useUpdateTask } from "../api/mutations.js"
import { useDiscussTask } from "../api/consultation.js"
import { mayDraw } from "../lib/folder-authority.js"
import { paths } from "../routes.js"
import { presenterToday } from "../parts/presenters.js"
import {
  CHIP_ASSIGNEE,
  CHIP_REMINDER,
  CHIP_REPEAT,
  UNASSIGNED,
} from "./task-card-copy.js"
import { TaskAssigneeInvite } from "./task-assignee-invite.js"
import { TaskLabels } from "./task-labels.js"
import { INVITE_BY_EMAIL } from "./task-copy.js"
import {
  isoDay,
  parseDueLabel,
  reminderChipValue,
  repeatSummary,
  type ConceptTask,
} from "../tasks/task-model.js"
import { useTimeFormat } from "../lib/time-format.js"
import { formatDate, formatDay, formatDayInline } from "../lib/dates.js"
import { cn } from "./ui/utils.js"
import { StateMark, STATE_WORD, type TaskState } from "./thread/timeline/state.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.js"

const TaskComposer = lazy(() => import("./page/canvas/TaskComposer.js"))

/* The row's field name for the due date: the panel's word, not the chip's. */
const DATE_LABEL = "Date"

/* The control that fills an empty block: it says the action, not the
   absence, and sits where the first item will appear. */
export function EmptyAction({
  label,
  onSelect,
  hint,
  icon: Icon = Plus,
  fill = true,
  expanded,
}: {
  label: string
  onSelect?: () => void
  hint?: string
  icon?: LucideIcon
  fill?: boolean
  expanded?: boolean
}) {
  return (
    <button
      type="button"
      title={hint}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.()
      }}
      className={cn(
        "-ml-0.5 flex h-[var(--control-height)] items-center gap-2 rounded-sm px-0.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground",
        fill ? "w-full" : "shrink-0",
      )}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {label}
    </button>
  )
}

/* Mount on open with a short entrance; closing is immediate. */
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-out">
      {children}
    </div>
  )
}

/* ------------------------------------------------------------- properties */

/* The Schedule in one line (#215): "Starts Mon", "21 Sep – 30 Sep", or the
   due date alone, which a same-day pair also is. A range names both ends as
   dates: "21 Sep – Wed" left the reader working out which Wednesday. */
function dateWords(task: ConceptTask): string {
  const today = presenterToday()
  const dueDay = task.due ? parseDueLabel(task.due.label) : null
  const dueIso = dueDay === null ? null : isoDay(dueDay)
  const ranged = task.start !== undefined && dueIso !== null && dueIso !== task.start
  const due = task.due?.label
  let words: string
  if (ranged && dueIso !== null && due !== undefined && task.start !== undefined) {
    /* The due label may carry a time after its day ("Sun 7:00 PM"). */
    const dayPart = formatDay(dueIso, today)
    const time = due.startsWith(dayPart) ? due.slice(dayPart.length) : ""
    words = `${formatDate(task.start, today)} – ${formatDate(dueIso, today)}${time}`
  } else if (due !== undefined) {
    words = due
  } else if (task.start !== undefined) {
    words = `Starts ${formatDayInline(task.start, today)}`
  } else {
    words = "Empty"
  }
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/* A menu-shaped property row (folder, assignee): same anatomy as the
   picker rows in `task-pickers.tsx`, so the block reads as one list. */
function MenuRow({
  label,
  value,
  empty = false,
  open,
  onOpenChange,
  children,
}: {
  label: string
  value: ReactNode
  empty?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <DropdownMenu
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className={PROPERTY_ROW}
          >
            <span className={PROPERTY_LABEL}>{label}</span>
            <span
              className={cn(
                "flex min-w-0 items-center gap-1.5 truncate",
                empty ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {value}
            </span>
          </button>
        }
      />
      <DropdownMenuContent align="start" alignOffset={PROPERTY_VALUE_OFFSET} className="w-auto min-w-56">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ----------------------------------------------------------------- status */

/*
Status, the first property: To do, Done, Dropped (M4; the stored value for
Dropped stays `abandoned`). Done is the completion verb, so a series still
generates its next occurrence exactly once. Dropped to Done is two verbs in
order (restore, then complete); the second waits for the first to land.
*/
export function stateOf(task: ConceptTask): TaskState {
  return task.abandoned ? "dropped" : task.done ? "done" : "open"
}

export function useStateMoves(
  task: ConceptTask,
  patch: (id: string, fields: Partial<ConceptTask>) => void,
): (next: TaskState) => void {
  const [completeAfterRestore, setCompleteAfterRestore] = useState(false)
  useEffect(() => {
    if (!completeAfterRestore || task.abandoned) return
    setCompleteAfterRestore(false)
    patch(task.id, { done: true })
  }, [completeAfterRestore, task.abandoned, task.id, patch])

  return (next) => {
    const current = stateOf(task)
    if (next === current) return
    if (next === "dropped") {
      patch(task.id, { abandoned: true })
      return
    }
    if (next === "done") {
      if (task.abandoned) {
        setCompleteAfterRestore(true)
        patch(task.id, { abandoned: false })
      } else patch(task.id, { done: true })
      return
    }
    if (task.abandoned) patch(task.id, { abandoned: false })
    else if (task.done) patch(task.id, { done: false })
  }
}

/* What this viewer may do to the task, from the folder's facts (the server
   stays the authority). mayDraw cannot project an assignment, so an
   assignee's own reach is added here (folder-actions.ts's
   whenAssignedToActor). */
function useTaskMay(taskId: string, folderId: string | null) {
  /* Every page, tabs and pages under them included: a task on a Work or Doc
     tab is not in the Library list. The Desk mark is the project root's. */
  const pages = useAllPages()
  const me = useMe()
  const detail = useTask(taskId).data
  const row = pages.data?.find((folder) => folder.id === folderId)
  const root = row === undefined ? undefined : pages.data?.find((folder) => folder.id === row.project_id)
  const viewerId = me.data?.user.id ?? null
  const mine = viewerId !== null &&
    (detail?.assignees?.some((person) => person.id === viewerId)
      ?? detail?.assignee?.id === viewerId)
  const facts =
    row === undefined
      ? null
      : { access: row.my_access, isOwner: row.is_owner, isDefault: (root ?? row).is_default }
  return {
    complete:
      facts !== null &&
      (mayDraw(facts, "task.status.complete") || (mine && (facts.access === "can_contribute" || facts.access === "assigned_work"))),
    abandon: facts !== null && (mayDraw(facts, "task.status.abandon") || (mine && facts.access === "can_contribute")),
    /* The body: writing it is `task.edit`; ticking its checklist is
       `step.toggle`, which Assigned work has on its own task. Unknown facts
       (still loading) leave it writable; the server stays the authority. */
    body:
      facts === null || mayDraw(facts, "task.edit") || (mine && facts.access === "can_contribute")
        ? ("edit" as const)
        : mine && facts.access === "assigned_work"
          ? ("tick" as const)
          : ("read" as const),
    /* Discussion belongs to collaborative projects. On Desk the whole
       property disappears, including legacy links and the empty state. */
    showDiscussion: facts !== null && !facts.isDefault,
    discuss: facts !== null && !facts.isDefault && mayDraw(facts, "discussion.create"),
    manageFolderLabels: facts !== null && mayDraw(facts, 'label.vocabulary.manage'),
    /* A contributor may classify their own Task; only the server's locked
       assignment read can decide which one is theirs. */
    applyFolderLabels: facts !== null && (mayDraw(facts, 'label.apply') || facts.access === 'can_contribute'),
    labelScopeName: row?.kind === 'work' ? 'Work' as const : 'Page' as const,
    labels: [...(detail?.labels.personal ?? []), ...(detail?.labels.folder ?? [])],
    threadId: detail?.linked_discussions[0]?.id ?? null,
  }
}

/* Status, picked in place: every state this viewer's access reaches. Done
   and reopening a done task need task.status.complete; Dropped and
   reopening a dropped one need task.status.abandon. */
function StatusRow({
  task,
  may,
  onMove,
}: {
  task: ConceptTask
  may: { complete: boolean; abandon: boolean }
  onMove: (next: TaskState) => void
}) {
  const current = stateOf(task)
  const reach: Record<TaskState, boolean> = {
    open: current === "done" ? may.complete : current === "dropped" ? may.abandon : true,
    done: may.complete && (current !== "dropped" || may.abandon),
    dropped: may.abandon,
  }
  const value = (
    <>
      <StateMark state={current} className="size-3.5" />
      <span className="truncate">{STATE_WORD[current]}</span>
    </>
  )
  const choices = (["open", "done", "dropped"] as const).filter((state) => state !== current && reach[state])
  if (choices.length === 0) {
    return (
      <div className={cn(PROPERTY_ROW, "hover:bg-transparent")}>
        <span className={PROPERTY_LABEL}>Status</span>
        <span className="flex min-w-0 items-center gap-1.5 truncate text-foreground">{value}</span>
      </div>
    )
  }
  return (
    <MenuRow label="Status" value={value}>
      {(["open", "done", "dropped"] as const).map((state) => (
        <DropdownMenuItem key={state} disabled={state !== current && !reach[state]} onClick={() => onMove(state)}>
          <StateMark state={state} className="size-3.5" />
          {STATE_WORD[state]}
        </DropdownMenuItem>
      ))}
    </MenuRow>
  )
}

/* The Date picker holds the whole schedule: the date (and its start), then,
   once there is a due date, its reminder and repeat. */
function DatePanel({ task, patch }: { task: ConceptTask; patch: (id: string, fields: Partial<ConceptTask>) => void }) {
  const [view, setView] = useState<"date" | "reminder" | "repeat">("date")
  const shown = task.due ? view : "date"
  return (
    <div className="flex flex-col gap-1">
      {task.due ? (
        <PickerSegments
          name="Schedule"
          options={[
            { key: "date", label: DATE_LABEL },
            { key: "reminder", label: CHIP_REMINDER },
            { key: "repeat", label: CHIP_REPEAT },
          ]}
          active={shown}
          onPick={(key) => setView(key as typeof view)}
        />
      ) : null}
      {shown === "reminder" ? (
        <ReminderPanel task={task} patch={patch} />
      ) : shown === "repeat" ? (
        <RepeatPanel task={task} patch={patch} />
      ) : (
        <SchedulePanel task={task} patch={patch} />
      )}
    </div>
  )
}

/* The date row's value: the schedule, then a repeat or reminder when set. */
function scheduleWords(task: ConceptTask, timeFormat: ReturnType<typeof useTimeFormat>): string {
  const parts = [dateWords(task)]
  if (task.recurrence) parts.push(repeatSummary(task))
  if (task.reminder) parts.push(reminderChipValue(task, timeFormat))
  return parts.join(" · ")
}

/* Discussion: a link to the task's one thread, or, with none yet, the act
   that makes it (`POST /tasks/:id/discussion`) and goes there. */
function DiscussionRow({
  taskId,
  folderId,
  threadId,
  mayStart,
}: {
  taskId: string
  folderId: string | null
  threadId: string | null
  mayStart: boolean
}) {
  const discuss = useDiscussTask()
  const navigate = useNavigate()
  const threadAt = (id: string): string => `${paths.folder(folderId ?? "")}?discussion=${id}`
  const label = <span className={PROPERTY_LABEL}>Discussion</span>
  if (folderId !== null && threadId !== null) {
    return (
      <Link to={threadAt(threadId)} className={PROPERTY_ROW}>
        {label}
        <span className="truncate text-foreground">Open</span>
      </Link>
    )
  }
  if (folderId !== null && mayStart) {
    return (
      <button
        type="button"
        className={PROPERTY_ROW}
        disabled={discuss.isPending}
        onClick={() => {
          /* Step 7: the thread opens on the project's Discussion tab, which
             Discuss adds when the project has none. */
          discuss.mutate(taskId, {
            onSuccess: ({ discussion, tabId }) => {
              void navigate(tabId === null ? threadAt(discussion.id) : `${paths.folder(tabId)}?discussion=${discussion.id}`)
            },
          })
        }}
      >
        {label}
        <span className="truncate text-muted-foreground">Start a discussion</span>
      </button>
    )
  }
  return (
    <div className={cn(PROPERTY_ROW, "hover:bg-transparent")}>
      {label}
      <span className="truncate text-muted-foreground">None</span>
    </div>
  )
}

/* ------------------------------------------------------------------- card */

export function TaskCard({
  task,
  patch,
}: {
  task: ConceptTask
  patch: (id: string, fields: Partial<ConceptTask>) => void
  /* The wiring hands every card handler over; any this panel does not draw
     are accepted and unused. */
  [unused: string]: unknown
}) {
  const timeFormat = useTimeFormat()
  const folderId = task.folder?.id ?? null
  const roster = usePeopleLibrary(folderId)
  const assignment = useUpdateTask()
  /* "Invite by email" opens its address field inside the Assignee menu, so
     the field goes wherever the menu goes: Escape, a click outside, a pick. */
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const assignees = task.assignees ?? (task.assignee ? [task.assignee] : [])
  const [inviting, setInviting] = useState(false)
  /* `/Blocked by`: the block under the writing opens already asking. */
  const [depOpening, setDepOpening] = useState(false)
  const move = useStateMoves(task, patch)
  const may = useTaskMay(task.id, folderId)

  return (
    <div className="flex flex-col gap-6">
      {/* The task properties; Discussion is collaborative-only. */}
      <div className="-mx-2 flex flex-col">
        <StatusRow task={task} may={may} onMove={move} />

        <MenuRow
          label={CHIP_ASSIGNEE}
          empty={assignees.length === 0}
          open={assigneeOpen}
          onOpenChange={(open) => {
            setAssigneeOpen(open)
            if (!open) setInviting(false)
          }}
          value={
            assignees.length > 0 ? (
              <>
                <Face person={assignees[0]!} className="size-4 data-[size=sm]:size-4" />
                <span className="truncate">{assignees.map((person) => person.name).join(', ')}</span>
              </>
            ) : (
              "Empty"
            )
          }
        >
          {roster.map((person) => (
            <DropdownMenuItem key={person.id ?? person.name} closeOnClick={false}
              onClick={() => {
                if (!person.id) return
                const selected = assignees.some((assigned) => assigned.id === person.id)
                assignment.mutate({ id: task.id, body: selected
                  ? { assignee_remove_id: person.id }
                  : { assignee_add_id: person.id } })
              }}>
              <Face person={person} className="size-4 data-[size=sm]:size-4" />
              {person.name}
              {assignees.some((assigned) => assigned.id === person.id) ? <Check className="ml-auto size-4" /> : null}
            </DropdownMenuItem>
          ))}
          {folderId === null ? null : inviting ? (
            <TaskAssigneeInvite
              folderId={folderId}
              folderName={task.folder?.name ?? ""}
              onDone={() => setAssigneeOpen(false)}
            />
          ) : (
            <DropdownMenuItem closeOnClick={false} onClick={() => setInviting(true)}>
              {INVITE_BY_EMAIL}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {/* `null`, issue #169: the patch that says "clear the assignee". */}
          <DropdownMenuItem onClick={() => patch(task.id, { assignees: [], assignee: null })}>{UNASSIGNED}</DropdownMenuItem>
        </MenuRow>

        <PropertyPicker
          label={DATE_LABEL}
          value={scheduleWords(task, timeFormat)}
          empty={!task.due && task.start === undefined}
          {...(task.due?.overdue ? { tone: "danger" as const } : {})}
        >
          <DatePanel task={task} patch={patch} />
        </PropertyPicker>

        <TaskLabels taskId={task.id} folderId={folderId} sharedName={may.labelScopeName} worn={may.labels}
          canManageFolder={may.manageFolderLabels} canApplyFolder={may.applyFolderLabels} />

        {may.showDiscussion ? (
          <DiscussionRow taskId={task.id} folderId={folderId} threadId={may.threadId} mayStart={may.discuss} />
        ) : null}

        {/* "Blocked by" and "Blocks", drawn only once a relation exists (or
            `/Blocked by` is asking). They are the task's facts, never its
            body; their making is in History. */}
        <TaskDependencies
          taskId={task.id}
          folderId={task.folder?.id}
          opening={depOpening}
          onIdle={() => setDepOpening(false)}
        />
      </div>

      {/* #221: the task's own document, in the folder canvas's writer; its
          checklist items are its subtasks. It holds only what the person
          wrote. The plain-text notes stand in while the writer loads. */}
      <div
        aria-label="Notes"
        role="region"
        className='flex flex-col gap-2 [&_.dana-canvas-tail]:min-h-8! [&_.bn-editor:not(.ProseMirror-focused)_[data-is-only-empty-block]]:[--dana-hint:"Add_notes"]'
      >
        <Suspense
          fallback={task.notes ? <p className="whitespace-pre-wrap px-1 text-sm text-foreground">{task.notes}</p> : null}
        >
          <TaskComposer
            taskId={task.id}
            folderId={folderId}
            notes={task.notes ?? null}
            access={may.body}
            {...(isRelatableTask(task.id) ? { onBlockedBy: () => setDepOpening(true) } : {})}
          />
        </Suspense>
      </div>

      <TaskHistory key={task.id} taskId={task.id} folderId={folderId} />
    </div>
  )
}