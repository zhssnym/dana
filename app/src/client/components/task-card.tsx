/*
The task page's body: everything a task is, in one quiet column, the same in
the side peek, the center peek and the full page.

The order is the page's (ROUND2-SPEC "Task"): one properties block (Status
first, then the fixed set, Steps, Dependencies and Attachments only where there
are some), then the page's two tabs, **Work** (the task's document) and
**Discussion** (its comments, never on the body). Nothing here can be
dragged or collapsed; a task is not a form somebody arranges. Every edit commits as it is made, so there is no Save
and no footer of actions: the task's own acts live in the panel's one "…".

**The properties block shows only what is set.** A task with no date draws no
Date row; "Add property" offers it, and choosing it reveals the row already
asking its question. A row dismissed without an answer goes away again.

**Attachments have one home**, the Attachments section here. The comment
composer in this panel offers no file or link of its own.
*/

import { Face } from "./person-face.js"
import { InlineInput } from "./ui/inline-field.js"
import { Input } from "./ui/input.js"
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Link2,
  ListPlus,
  MoreHorizontal,
  Paperclip,
  Play,
  Plus,
  Repeat2,
  UserRound,
  Video,
  Workflow,
  X,
  type LucideIcon,
} from "../lib/icons.js"
import { TaskDependencies, isRelatableTask } from "./task-dependencies.js"
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react"

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
  PropertyPicker,
  ReminderPanel,
  RepeatPanel,
} from "./task-pickers.js"
import { TaskThread } from "./thread/TaskThread.js"
import { usePeopleLibrary } from "../lib/people-library.js"
import { useMultiMemberFolderIds, useTask, useTaskDependencies } from "../api/queries.js"
import { useUpdateTask } from "../api/mutations.js"
import { presenterToday } from "../parts/presenters.js"
import { boardStatusOf, type BoardStatus } from "../views/BoardView.js"
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
  reminderChipValue,
  repeatSummary,
  stepCount,
  type ConceptStep,
  type ConceptTask,
} from "../tasks/task-model.js"
import { useTimeFormat } from "../lib/time-format.js"
import { useSortableList } from "../lib/use-sortable-list.js"
import { cn } from "./ui/utils.js"
import { Checkbox } from "./ui/checkbox.js"
import { Tab, TabList } from "./ui/tabs.js"

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

/* A section of the panel: a plain heading and its content. No rule, no
   toggle, no handle. */
function Section({
  title,
  badge,
  children,
}: {
  title: string
  badge?: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h3 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
        {title}
        {badge ? (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{badge}</span>
        ) : null}
      </h3>
      {children}
    </section>
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
  /* "Add property" > Subtasks: the list opens already asking for the first. */
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
                    <DropdownMenuSeparator />
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

/* ------------------------------------------------------------ attachments */

/*
Viewable is a decision the server makes, not a property of the file's name:
images and video are shown, documents opened, everything else handed over as a
download. A link is an anchor, so middle-click and "copy link address" work.
*/
const ATTACHMENT_ICON: Record<NonNullable<ConceptTask["attachments"]>[number]["kind"], LucideIcon> = {
  image: ImageIcon,
  video: Video,
  document: FileText,
  file: Paperclip,
  link: Link2,
}

type Attachment = NonNullable<ConceptTask["attachments"]>[number]

function kindOf(type: string): Attachment["kind"] {
  if (type.startsWith("image/")) return "image"
  if (type.startsWith("video/")) return "video"
  if (type === "application/pdf" || type.startsWith("text/")) return "document"
  return "file"
}

function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentPicker({
  onAdd,
  pickOnMount = false,
}: {
  onAdd: (files: Attachment[]) => void
  /* "Add property → Attachment" opens the file chooser straight away. */
  pickOnMount?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState("")
  const [showUrl, setShowUrl] = useState(false)
  const picked = useRef(false)

  function takeFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    onAdd(
      Array.from(list).map((file) => {
        const kind = kindOf(file.type)
        return {
          name: file.name,
          meta: `${file.type.split("/")[1]?.toUpperCase() ?? "FILE"} · ${readableSize(file.size)}`,
          kind,
          preview: kind === "image" ? URL.createObjectURL(file) : undefined,
        }
      }),
    )
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        takeFiles(event.dataTransfer.files)
      }}
    >
      <input
        ref={(element) => {
          input.current = element
          if (element && pickOnMount && !picked.current) {
            picked.current = true
            element.click()
          }
        }}
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          takeFiles(event.target.files)
          event.target.value = ""
        }}
      />
      <div className="flex items-center gap-1">
        <EmptyAction label="Add a file" fill={false} onSelect={() => input.current?.click()} />
        <EmptyAction
          label="From a link"
          icon={Link2}
          fill={false}
          expanded={showUrl}
          onSelect={() => setShowUrl((open) => !open)}
        />
      </div>

      {showUrl ? (
        <form
          className="mt-1 flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = url.trim()
            if (!trimmed) return
            /* A URL with no scheme is still a link a person meant. */
            const href = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
            let host = trimmed
            let path = ""
            try {
              const parsed = new URL(href)
              host = parsed.hostname.replace(/^www\./, "")
              path = parsed.pathname.split("/").filter(Boolean).pop() ?? ""
            } catch {
              /* Not parseable: show what they typed rather than guessing. */
            }
            const image = /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(trimmed)
            onAdd([
              {
                name: decodeURIComponent(path) || host,
                meta: host,
                kind: "link",
                url: href,
                preview: image ? href : undefined,
              },
            ])
            setUrl("")
            setShowUrl(false)
          }}
        >
          <Input
            value={url}
            autoFocus
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste a link"
            aria-label="Attachment link"
            className="h-[var(--control-height)] min-w-0 flex-1 text-sm"
          />
        </form>
      ) : null}
    </div>
  )
}

function AttachmentList({ files }: { files: NonNullable<ConceptTask["attachments"]> }) {
  const [openName, setOpenName] = useState<string | null>(null)

  return (
    <div className="flex flex-col">
      {files.map((file) => {
        const Icon = ATTACHMENT_ICON[file.kind]
        const viewable = file.kind === "image" || file.kind === "video"
        const isOpen = openName === file.name
        const Row = file.url ? "a" : "button"
        const rowProps = file.url
          ? ({
              href: file.url,
              target: "_blank",
              rel: "noreferrer noopener",
              onClick: (event: React.MouseEvent) => event.stopPropagation(),
            } as const)
          : ({
              type: "button" as const,
              onClick: (event: React.MouseEvent) => {
                event.stopPropagation()
                if (viewable) setOpenName(isOpen ? null : file.name)
              },
            } as const)

        return (
          <div key={file.name}>
            <Row
              {...rowProps}
              className={cn(
                "flex h-10 w-full items-center gap-2.5 rounded-sm px-1 text-left transition-colors duration-100 hover:bg-accent",
              )}
            >
              {file.preview ? (
                <span className="relative size-7 shrink-0 overflow-hidden rounded-sm bg-muted">
                  <img src={file.preview} alt="" className="size-full object-cover" />
                  {file.kind === "video" ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Play className="size-3.5 fill-background text-background" strokeWidth={1.5} aria-hidden="true" />
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-muted">
                  <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{file.name}</span>
                <span className="block text-xs text-muted-foreground">{file.meta}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                {file.url ? (
                  <>
                    Open
                    <ArrowUpRight className="size-3" strokeWidth={2} aria-hidden="true" />
                  </>
                ) : viewable ? (
                  isOpen ? "Hide" : "View"
                ) : (
                  "Download"
                )}
              </span>
            </Row>
            {viewable && file.preview ? (
              <Reveal open={isOpen}>
                <div className="px-1 pb-2">
                  <img
                    src={file.preview}
                    alt={file.name}
                    /* Reserved from the stored shape where there is one, so
                       the reveal does not jump when the bytes land (#108). */
                    style={file.ratio === undefined ? undefined : { aspectRatio: file.ratio }}
                    className="w-full max-w-[320px] rounded-sm"
                  />
                </div>
              </Reveal>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------- properties */

type AddableProperty = "date" | "reminder" | "repeat" | "assignee" | "steps"

function dateWords(task: ConceptTask): string {
  if (!task.due) return "Empty"
  const label = task.due.label
  return label.charAt(0).toUpperCase() + label.slice(1)
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

type StatusKey = BoardStatus

const STATUS_LABEL: Record<StatusKey | "abandoned", string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  abandoned: "Abandoned",
}

/* The three states as one small mark: a dashed ring, a half-filled ring, a
   filled check. Abandoned is a ring with a stroke through it. */
export function StatusMark({ status, className }: { status: StatusKey | "abandoned"; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn(
        "size-3.5 shrink-0",
        status === "not_started" || status === "abandoned" ? "text-muted-foreground" : "text-primary",
        className,
      )}
    >
      {status === "done" ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5 8.3 7.1 10.3 11 6" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={status === "not_started" ? "2.4 1.8" : undefined} />
          {status === "in_progress" ? <path d="M8 3.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" /> : null}
          {status === "abandoned" ? <path d="M4.5 11.5 11.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /> : null}
        </>
      )}
    </svg>
  )
}

/*
Status, the first property: Not started, In progress, Done. The Board's own
rule (`boardStatusOf` in `views/BoardView.tsx`), so the page and the Board can
never disagree: a pending task whose start date is today or earlier is In
progress. Choosing In progress starts it today (or on its due day when that is
earlier, since the server holds start <= due); Not started clears the start;
Done is the completion verb, so a series still generates its next occurrence
exactly once. Abandoned is the fourth choice; an abandoned task says so, and
any other choice restores it first.
*/
function StatusRow({
  task,
  patch,
}: {
  task: ConceptTask
  patch: (id: string, fields: Partial<ConceptTask>) => void
}) {
  const card = useTask(task.id).data
  const update = useUpdateTask()
  const today = presenterToday()
  /* Abandoned to Done is two verbs in order (restore, then complete); the
     second waits for the first to land. */
  const [completeAfterRestore, setCompleteAfterRestore] = useState(false)
  useEffect(() => {
    if (!completeAfterRestore || task.abandoned) return
    setCompleteAfterRestore(false)
    patch(task.id, { done: true })
  }, [completeAfterRestore, task.abandoned, task.id, patch])

  if (card === undefined) return null
  const current: StatusKey | "abandoned" = task.abandoned ? "abandoned" : boardStatusOf(card, today)
  const started = card.start_date !== null && card.start_date <= today

  function choose(next: StatusKey | "abandoned") {
    if (card === undefined || next === current) return
    // Abandon lives here, with the other states, not in the "…".
    if (next === "abandoned") { patch(task.id, { abandoned: true }); return }
    if (next === "done") {
      if (task.abandoned) {
        setCompleteAfterRestore(true)
        patch(task.id, { abandoned: false })
      } else patch(task.id, { done: true })
      return
    }
    /* Out of Done first: an abandoned task is restored, a completed one
       uncompleted, as a Board drop does. */
    if (task.abandoned) patch(task.id, { abandoned: false })
    else if (task.done) patch(task.id, { done: false })
    if (next === "in_progress" && !started) {
      const day = card.due_date !== null && card.due_date < today ? card.due_date : today
      update.mutate({ id: task.id, body: { start_date: day } })
    }
    if (next === "not_started" && started) update.mutate({ id: task.id, body: { start_date: null } })
  }

  return (
    <MenuRow
      label="Status"
      value={
        <>
          <StatusMark status={current} />
          <span className="truncate">{STATUS_LABEL[current]}</span>
        </>
      }
    >
      {(["not_started", "in_progress", "done", "abandoned"] as const).map((key) => (
        <DropdownMenuItem key={key} onClick={() => choose(key)}>
          <StatusMark status={key} />
          <span className="flex-1">{STATUS_LABEL[key]}</span>
          {key === current ? <span className="text-xs text-muted-foreground">Current</span> : null}
        </DropdownMenuItem>
      ))}
    </MenuRow>
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
  const roster = usePeopleLibrary(task.folder?.id ?? null)
  /* INV-5: the assignee is hidden in a single-member folder, not disabled. */
  const shared = useMultiMemberFolderIds()
  const assignable = task.folder?.id !== undefined && shared.has(task.folder.id)
  const [inviting, setInviting] = useState(false)
  /* The one property "Add property" has just revealed, if any. */
  const [adding, setAdding] = useState<AddableProperty | null>(null)
  const [depOpening, setDepOpening] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const counts = stepCount(task)

  const relatable = isRelatableTask(task.id)
  const deps = useTaskDependencies(relatable ? task.id : null)
  const hasDeps =
    (deps.data?.depends_on.length ?? 0) > 0 || (deps.data?.blocks.length ?? 0) > 0
  const attachments = task.attachments ?? []
  const labels = task.labels ?? []
  const steps = task.steps ?? []
  /* `?tab=discussion` (a notification or a Dana Link to a post) opens on the
     Discussion tab. /app/tasks/:id is always the full page, and the router has
     already pushed the address when this first renders. */
  const [tab, setTab] = useState<"notes" | "discussion">(() =>
    new URLSearchParams(globalThis.location?.search ?? "").get("tab") === "discussion" ? "discussion" : "notes",
  )

  const showDate = Boolean(task.due) || adding === "date"
  const showReminder = Boolean(task.reminder) || adding === "reminder"
  const showRepeat = Boolean(task.recurrence) || adding === "repeat"
  const showAssignee = assignable && (Boolean(task.assignee) || adding === "assignee")

  /* A revealed row that closes without an answer goes away again. */
  function settle(which: AddableProperty) {
    return (open: boolean) => {
      if (!open) setAdding((current) => (current === which ? null : current))
    }
  }

  const addable: { key: string; label: string; icon: LucideIcon; onSelect: () => void }[] = [
    ...(!task.due
      ? [{ key: "date", label: DATE_LABEL, icon: CalendarDays, onSelect: () => setAdding("date") }]
      : []),
    ...(task.due && !task.reminder
      ? [{ key: "reminder", label: CHIP_REMINDER, icon: Bell, onSelect: () => setAdding("reminder") }]
      : []),
    ...(task.due && !task.recurrence
      ? [{ key: "repeat", label: CHIP_REPEAT, icon: Repeat2, onSelect: () => setAdding("repeat") }]
      : []),
    ...(assignable && !task.assignee
      ? [{ key: "assignee", label: CHIP_ASSIGNEE, icon: UserRound, onSelect: () => setAdding("assignee") }]
      : []),
    ...(steps.length === 0 && adding !== "steps"
      ? [{ key: "steps", label: "Subtasks", icon: ListPlus, onSelect: () => setAdding("steps") }]
      : []),
    ...(relatable && deps.data !== undefined && !hasDeps && !depOpening
      ? [{ key: "dependency", label: "Dependency", icon: Workflow, onSelect: () => setDepOpening(true) }]
      : []),
    ...(attachments.length === 0 && !attaching
      ? [{ key: "attachment", label: "Attachment", icon: Paperclip, onSelect: () => setAttaching(true) }]
      : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* The properties block: quiet rows, only what is set. */}
      <div className="-mx-2 flex flex-col">
        <StatusRow task={task} patch={patch} />
        {showDate ? (
          <PropertyPicker
            label={DATE_LABEL}
            value={dateWords(task)}
            empty={!task.due}
            {...(task.due?.overdue ? { tone: "danger" as const } : {})}
            defaultOpen={adding === "date"}
            onOpenChange={settle("date")}
          >
            <DuePanel task={task} patch={patch} />
          </PropertyPicker>
        ) : null}

        {showReminder ? (
          <PropertyPicker
            label={CHIP_REMINDER}
            value={task.reminder ? reminderChipValue(task, timeFormat) : "Empty"}
            empty={!task.reminder}
            defaultOpen={adding === "reminder"}
            onOpenChange={settle("reminder")}
          >
            <ReminderPanel task={task} patch={patch} />
          </PropertyPicker>
        ) : null}

        {showRepeat ? (
          <PropertyPicker
            label={CHIP_REPEAT}
            value={task.recurrence ? repeatSummary(task) : "Empty"}
            empty={!task.recurrence}
            defaultOpen={adding === "repeat"}
            onOpenChange={settle("repeat")}
          >
            <RepeatPanel task={task} patch={patch} />
          </PropertyPicker>
        ) : null}

        {showAssignee ? (
          <MenuRow
            label={CHIP_ASSIGNEE}
            empty={!task.assignee}
            {...(adding === "assignee" ? { open: true } : {})}
            onOpenChange={settle("assignee")}
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
              <DropdownMenuItem
                key={person.name}
                onClick={() => {
                  setAdding(null)
                  patch(task.id, { assignee: person })
                }}
              >
                <Face person={person} className="size-4 data-[size=sm]:size-4" />
                {person.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => setInviting(true)}>{INVITE_BY_EMAIL}</DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* `null`, issue #169: the patch that says "clear the assignee". */}
            <DropdownMenuItem onClick={() => patch(task.id, { assignee: null })}>
              {UNASSIGNED}
            </DropdownMenuItem>
          </MenuRow>
        ) : null}

        {labels.length > 0 ? (
          <div className={cn(PROPERTY_ROW, "hover:bg-transparent")}>
            <span className={PROPERTY_LABEL}>Labels</span>
            <span className="flex min-w-0 flex-wrap gap-1.5">
              {labels.map((label) => (
                <span key={label.id} className="rounded-sm bg-muted px-1.5 text-xs leading-5 text-foreground">
                  {label.name}
                </span>
              ))}
            </span>
          </div>
        ) : null}

        {addable.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    "flex h-[var(--control-height)] w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground data-popup-open:bg-accent",
                  )}
                >
                  <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  Add property
                </button>
              }
            />
            <DropdownMenuContent align="start" className="w-auto min-w-56">
              {addable.map((item) => (
                <DropdownMenuItem key={item.key} onClick={item.onSelect}>
                  <item.icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {inviting && task.folder?.id !== undefined ? (
        <TaskAssigneeInvite
          folderId={task.folder.id}
          folderName={task.folder.name}
          onDone={() => setInviting(false)}
        />
      ) : null}

      {steps.length > 0 || adding === "steps" ? (
        <Section title="Subtasks" {...(counts ? { badge: `${counts.done}/${counts.total}` } : {})}>
          <StepList
            task={task}
            startAdding={adding === "steps"}
            onIdle={() => setAdding((current) => (current === "steps" ? null : current))}
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
        </Section>
      ) : null}

      <TaskDependencies
        taskId={task.id}
        folderId={task.folder?.id}
        opening={depOpening}
        onIdle={() => setDepOpening(false)}
        section={(badge, body) => (
          <Section title="Dependencies" {...(badge === undefined ? {} : { badge })}>
            {body}
          </Section>
        )}
      />

      {attachments.length > 0 || attaching ? (
        <Section title="Attachments" {...(attachments.length > 0 ? { badge: String(attachments.length) } : {})}>
          {attachments.length > 0 ? <AttachmentList files={attachments} /> : null}
          <AttachmentPicker
            pickOnMount={attaching && attachments.length === 0}
            onAdd={(added) => {
              patch(task.id, { attachments: [...attachments, ...added] })
              setAttaching(false)
            }}
          />
        </Section>
      ) : null}

      {/* The page's two tabs, drawn as the folder page draws its own:
          Work is the task's document, Discussion its comments. */}
      <div className="flex flex-col gap-4">
        <TabList label="Task tabs">
          {(
            [
              ["notes", "Work"],
              ["discussion", "Discussion"],
            ] as const
          ).map(([key, name]) => (
            <Tab
              key={key}
              id={`task-tab-${key}`}
              aria-controls={`task-tabpanel-${key}`}
              selected={tab === key}
              onClick={() => setTab(key)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
                event.preventDefault()
                const next = key === "notes" ? "discussion" : "notes"
                setTab(next)
                globalThis.requestAnimationFrame(() => document.getElementById(`task-tab-${next}`)?.focus())
              }}
            >
              {name}
            </Tab>
          ))}
        </TabList>

        {tab === "notes" ? (
          /* #221: the Task's own document, in the Folder canvas's writer. The
             plain-text notes stand in while the writer loads. */
          <div role="tabpanel" id="task-tabpanel-notes" aria-labelledby="task-tab-notes">
            <Suspense
              fallback={
                task.notes ? <p className="whitespace-pre-wrap px-1 text-sm text-foreground">{task.notes}</p> : null
              }
            >
              <TaskComposer taskId={task.id} folderId={task.folder?.id ?? null} notes={task.notes ?? null} />
            </Suspense>
          </div>
        ) : (
          <div role="tabpanel" id="task-tabpanel-discussion" aria-labelledby="task-tab-discussion">
            <TaskThread taskId={task.id} folderId={task.folder?.id ?? null} />
          </div>
        )}
      </div>
    </div>
  )
}
