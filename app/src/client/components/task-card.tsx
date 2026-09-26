/*
The task page's body: everything a task is, in one quiet column (M4: one
task page, no peek).

Four fixed properties, always shown, in this order: Status, Assignee, Date
(its start, reminder and repeat live inside the Date picker) and Discussion.
Then the task's own document, with its subtasks and "Blocked by" drawn
under the writing (made by the editor's `/Subtask` and `/Blocked by`), and
the task's quiet history. Every edit commits as it is made, so there is no
Save.

Files go in the task's document, which takes file and image blocks.
*/

import { Face } from "./person-face.js"
import { InlineInput } from "./ui/inline-field.js"
import { GripVertical, ListPlus, MoreHorizontal, Plus, X, type LucideIcon } from "../lib/icons.js"
import { TaskDependencies, isRelatableTask } from "./task-dependencies.js"
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.js"
import {
  DuePanel,
  PROPERTY_LABEL,
  PROPERTY_ROW,
  PROPERTY_VALUE_OFFSET,
  PickerSegments,
  PropertyPicker,
  ReminderPanel,
  RepeatPanel,
} from "./task-pickers.js"
import { TaskHistory } from "./thread/TaskHistory.js"
import { usePeopleLibrary } from "../lib/people-library.js"
import { useFolders, useMe, useTask } from "../api/queries.js"
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
import { INVITE_BY_EMAIL, STEP_CAP_NOTICE } from "./task-copy.js"
/* 10.3's cap for the field. Restated rather than imported because
   `shared/tasks.ts` spends it inline in a zod `max`. */
const STEP_CAP = 50
import {
  isoDay,
  parseDueLabel,
  reminderChipValue,
  repeatSummary,
  type ConceptStep,
  type ConceptTask,
} from "../tasks/task-model.js"
import { useTimeFormat } from "../lib/time-format.js"
import { formatDate, formatDay, formatDayInline } from "../lib/dates.js"
import { useSortableList } from "../lib/use-sortable-list.js"
import { cn } from "./ui/utils.js"
import { Checkbox } from "./ui/checkbox.js"
import { StateMark, STATE_WORD, type TaskState } from "./thread/timeline/state.js"

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

/* ------------------------------------------------------------------ steps */

/* A step's name: a label until you click it, then a field. */
function StepTitle({
  step,
  onRename,
}: {
  step: ConceptStep
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(step.title)

  const metrics = cn(
    "min-w-0 flex-1 text-left text-sm",
    step.done ? "text-muted-foreground line-through" : "text-foreground",
  )

  if (editing) {
    return (
      <InlineInput
        autoFocus
        value={draft}
        aria-label="Subtask name"
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onRename(draft.trim() || step.title)
          setEditing(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
          }
          if (event.key === "Enter") {
            onRename(draft.trim() || step.title)
            setEditing(false)
          }
          if (event.key === "Escape") {
            setDraft(step.title)
            setEditing(false)
          }
        }}
        className={cn(metrics, "-mx-1 rounded-sm bg-background px-1 outline-none")}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        setDraft(step.title)
        setEditing(true)
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(metrics, "-mx-1 cursor-text truncate rounded-sm px-1")}
    >
      {step.title}
    </button>
  )
}

/*
Steps: tick, rename in place, drag to reorder, and one "…" per step for the
two things a step can become (a task of its own) or stop being (removed).
*/
function StepList({
  task,
  toggleStep,
  moveStep,
  moveStepsTo,
  removeSteps,
  addStep,
  renameStep,
  startAdding = false,
  onIdle,
}: {
  task: ConceptTask
  /* `/Subtask` on an empty line: the list opens already asking for the first. */
  startAdding?: boolean
  /* The field closed; the caller hides an empty list again. */
  onIdle?: () => void
  toggleStep: (id: string, index: number) => void
  moveStep: (id: string, from: number, to: number) => void
  moveStepsTo?: (
    id: string,
    indices: number[],
    destination: { kind: "new-task" } | { kind: "folder"; name: string; color: string },
  ) => void
  removeSteps: (id: string, indices: number[]) => void
  addStep: (id: string, title: string) => void
  renameStep: (id: string, index: number, title: string) => void
}) {
  const [adding, setAddingState] = useState(startAdding)
  /* A list already drawn opens its field when asked again (the writing's
     "/subtask" on an empty line). */
  useEffect(() => {
    if (startAdding) setAddingState(true)
  }, [startAdding])
  const setAdding = (next: boolean) => {
    setAddingState(next)
    if (!next) onIdle?.()
  }
  const [newStep, setNewStep] = useState("")
  const stepDrag = useSortableList({
    count: task.steps?.length ?? 0,
    onReorder: (from, to) => moveStep(task.id, from, to),
    describe: (index) => task.steps?.[index]?.title ?? "Subtask",
  })
  const steps = task.steps ?? []

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const stepState = stepDrag.itemState(i)
        const promotable = moveStepsTo !== undefined && task.folder !== undefined && step.id !== undefined
        return (
          <div
            /* Keyed by position, never by title: a title key remounts the
               field on every keystroke. */
            key={i}
            ref={stepDrag.setItemRef(i)}
            style={{
              transform: stepState.offset === 0 ? undefined : `translate3d(0, ${stepState.offset}px, 0)`,
              transition:
                stepState.isActive && !stepState.isSettling
                  ? undefined
                  : "transform 150ms ease-out",
              zIndex: stepState.isActive ? 20 : undefined,
            }}
            className={cn(
              "group/step relative -ml-0.5 flex h-8 items-center gap-2 rounded-sm pr-1",
              stepState.isActive ? "cursor-grabbing bg-background" : "hover:bg-accent",
            )}
          >
            {/* The grip overlaps the tick's left edge on hover rather than
                taking a column of its own, so the list keeps one left edge. */}
            <button
              type="button"
              aria-label={`Reorder ${step.title}`}
              {...stepDrag.handleProps(i)}
              className={cn(
                "absolute -left-4 flex h-8 w-4 cursor-grab items-center justify-center text-muted-foreground opacity-0 transition-opacity duration-100 group-hover/step:opacity-100 focus-visible:opacity-100 active:cursor-grabbing",
                stepState.isActive && "opacity-100",
              )}
            >
              <GripVertical className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
            <span className="flex size-5 shrink-0 items-center justify-center">
              <Checkbox
                checked={Boolean(step.done)}
                aria-label={`Mark subtask ${step.done ? "not done" : "done"}`}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={() => toggleStep(task.id, i)}
              />
            </span>
            <StepTitle step={step} onRename={(title) => renameStep(task.id, i, title)} />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={`More actions for ${step.title}`}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity duration-100 group-hover/step:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 hover:text-foreground max-md:opacity-100",
                    )}
                  >
                    <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                {promotable ? (
                  <>
                    <DropdownMenuItem
                      label="Make this a task"
                      onClick={() => {
                        const folder = task.folder
                        if (folder === undefined) return
                        moveStepsTo(task.id, [i], { kind: "folder", name: folder.name, color: folder.color })
                      }}
                    >
                      <ListPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                      Make this a task
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuItem label="Remove" onClick={() => removeSteps(task.id, [i])}>
                  <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}

      {steps.length >= STEP_CAP ? (
        <p className="px-1 py-1 text-xs text-muted-foreground">{STEP_CAP_NOTICE}</p>
      ) : adding ? (
        /* Nothing is written until the field holds text: Enter saves and
           opens the next, blur saves what is there, Escape leaves. */
        <div className="-ml-0.5 flex h-8 items-center gap-2 rounded-sm pr-1">
          <span className="flex size-5 shrink-0 items-center justify-center">
            <Checkbox checked={false} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
          </span>
          <InlineInput
            autoFocus
            value={newStep}
            aria-label="New subtask"
            placeholder="Type a subtask"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setNewStep(event.target.value)}
            onBlur={() => {
              const title = newStep.trim()
              if (title) addStep(task.id, title)
              setNewStep("")
              setAdding(false)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
              }
              if (event.key === "Enter") {
                const title = newStep.trim()
                if (!title) {
                  setAdding(false)
                  return
                }
                addStep(task.id, title)
                setNewStep("")
              }
              if (event.key === "Escape") {
                setNewStep("")
                setAdding(false)
              }
            }}
            className="min-w-0 flex-1 rounded-sm bg-background px-1 text-sm text-foreground outline-none"
          />
        </div>
      ) : (
        <EmptyAction label="Add subtask" onSelect={() => setAdding(true)} />
      )}
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
  const folders = useFolders()
  const me = useMe()
  const detail = useTask(taskId).data
  const row = folders.data?.find((folder) => folder.id === folderId)
  const viewerId = me.data?.user.id ?? null
  const mine = viewerId !== null && detail?.assignee?.id === viewerId
  const facts = row === undefined ? null : { access: row.my_access, isOwner: row.is_owner, isDefault: row.is_default }
  return {
    complete:
      facts !== null &&
      (mayDraw(facts, "task.status.complete") || (mine && (facts.access === "can_contribute" || facts.access === "assigned_work"))),
    abandon: facts !== null && (mayDraw(facts, "task.status.abandon") || (mine && facts.access === "can_contribute")),
    /* Not on the Desk: it has no Discussion tab and nobody else to talk to. */
    discuss: facts !== null && !facts.isDefault && mayDraw(facts, "discussion.create"),
    threadId: detail?.discussion_id ?? null,
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
        <DuePanel task={task} patch={patch} />
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
          discuss.mutate(taskId, { onSuccess: (thread) => { void navigate(threadAt(thread.id)) } })
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
  toggleStep,
  moveStep,
  moveStepsTo,
  removeSteps,
}: {
  task: ConceptTask
  patch: (id: string, fields: Partial<ConceptTask>) => void
  toggleStep: (id: string, index: number) => void
  moveStep: (id: string, from: number, to: number) => void
  /* A step promotes to a task in its own folder; absent where the task has
     no id or folder yet, and then the item is not drawn. */
  moveStepsTo?: (
    id: string,
    indices: number[],
    destination: { kind: "new-task" } | { kind: "folder"; name: string; color: string },
  ) => void
  removeSteps: (id: string, indices: number[]) => void
  /* The wiring hands every card handler over; the ones this panel no longer
     draws (bulk step acts, a new folder) are accepted and unused. */
  [unused: string]: unknown
}) {
  const timeFormat = useTimeFormat()
  const folderId = task.folder?.id ?? null
  const roster = usePeopleLibrary(folderId)
  const [inviting, setInviting] = useState(false)
  /* `/Subtask` on an empty line, and `/Blocked by`: the block under the
     writing opens already asking. */
  const [addingStep, setAddingStep] = useState(false)
  const [depOpening, setDepOpening] = useState(false)
  const steps = task.steps ?? []
  const move = useStateMoves(task, patch)
  const may = useTaskMay(task.id, folderId)

  return (
    <div className="flex flex-col gap-6">
      {/* The four properties, always in this order. */}
      <div className="-mx-2 flex flex-col">
        <StatusRow task={task} may={may} onMove={move} />

        <MenuRow
          label={CHIP_ASSIGNEE}
          empty={!task.assignee}
          value={
            task.assignee ? (
              <>
                <Face person={task.assignee} className="size-4 data-[size=sm]:size-4" />
                <span className="truncate">{task.assignee.name}</span>
              </>
            ) : (
              "Empty"
            )
          }
        >
          {roster.map((person) => (
            <DropdownMenuItem key={person.name} onClick={() => patch(task.id, { assignee: person })}>
              <Face person={person} className="size-4 data-[size=sm]:size-4" />
              {person.name}
            </DropdownMenuItem>
          ))}
          {folderId === null ? null : (
            <DropdownMenuItem onClick={() => setInviting(true)}>{INVITE_BY_EMAIL}</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {/* `null`, issue #169: the patch that says "clear the assignee". */}
          <DropdownMenuItem onClick={() => patch(task.id, { assignee: null })}>{UNASSIGNED}</DropdownMenuItem>
        </MenuRow>

        <PropertyPicker
          label={DATE_LABEL}
          value={scheduleWords(task, timeFormat)}
          empty={!task.due && task.start === undefined}
          {...(task.due?.overdue ? { tone: "danger" as const } : {})}
        >
          <DatePanel task={task} patch={patch} />
        </PropertyPicker>

        <DiscussionRow taskId={task.id} folderId={folderId} threadId={may.threadId} mayStart={may.discuss} />
      </div>

      {inviting && task.folder?.id !== undefined ? (
        <TaskAssigneeInvite
          folderId={task.folder.id}
          folderName={task.folder.name}
          onDone={() => setInviting(false)}
        />
      ) : null}

      <hr className="border-border" />

      {/* #221: the task's own document, in the folder canvas's writer, with
          its subtasks and "Blocked by" under the writing. The plain-text
          notes stand in while the writer loads. */}
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
            addSubtasks={(added) => {
              if (added.length === 0) {
                setAddingStep(true)
                return true
              }
              if (steps.length + added.length > STEP_CAP) return false
              patch(task.id, { steps: [...steps, ...added] })
              return true
            }}
            {...(isRelatableTask(task.id) ? { onBlockedBy: () => setDepOpening(true) } : {})}
          />
        </Suspense>

        {steps.length > 0 || addingStep ? (
          <div role="group" aria-label="Subtasks">
            <StepList
              task={task}
              startAdding={addingStep}
              onIdle={() => setAddingStep(false)}
              toggleStep={toggleStep}
              moveStep={moveStep}
              {...(moveStepsTo === undefined ? {} : { moveStepsTo })}
              removeSteps={removeSteps}
              renameStep={(id, index, title) =>
                patch(id, {
                  steps: steps.map((step, i) => (i === index ? { ...step, title } : step)),
                })
              }
              addStep={(id, title) => patch(id, { steps: [...steps, { title, done: false }] })}
            />
          </div>
        ) : null}

        <TaskDependencies
          taskId={task.id}
          folderId={task.folder?.id}
          opening={depOpening}
          onIdle={() => setDepOpening(false)}
          section={(_badge, body) => body}
        />
      </div>

      <hr className="border-border" />

      <TaskHistory taskId={task.id} folderId={folderId} />
    </div>
  )
}
