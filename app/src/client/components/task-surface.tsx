/*
The task surface: one task held five ways, a dialog, full screen, a sidebar on
either edge, or a floating card, plus the sixth way that is really the page
bar's: opened as a tab.

**A task in a surface is a page, not a row.** List affordances turn to noise
once the list is gone: a collapse chevron leaves a naked row floating in an
empty screen, and a 14px row title would be the largest text on a full page.
What leaves is the row; what stays is the card. The surface composes its own
header, the title at page scale renaming in place, a deliberate completion
control, the star, over the same `TaskCard` blocks the inline row opens, wired
through the same `useCardWiring` layer: same fields, same commit-as-it-is-made
behaviour, two compositions.

The view switcher is the icon strip, labels on hover, the same grammar as the
conversation's homes. Escape closes; the chrome closes; the card's own footer
offers neither, because two closes in one surface is one too many.
*/

import { InlineInput } from "./ui/inline-field.js"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { ChevronRight, X } from "../lib/icons.js"
import { TITLE_REQUIRED, tooLong } from "./task-copy.js"
/* 10.3's number for the field, from the shared contract rather than restated:
   a limit written twice is a limit the client and the server can disagree on,
   which is the one thing this message must never do. */
import { TASK_TITLE_LIMIT } from "../../shared/tasks.js"
import { FolderMark, folderNameOf } from "./folder-mark.js"
import { HistorySheet } from "./history-sheet.js"
import { TaskCard } from "./task-card.js"
import {
  Actions,
  Check,
  TASK_OPEN_OPTIONS,
  useCardWiring,
  type TaskOpenMode,
  type TaskRowProps,
} from "./task-row.js"
import { ViewStrip } from "./view-strip.js"
import { HoldsTheDocument, ReservesRightEdge } from "./right-edge.js"
import { WindowBarActions, WindowBarLead } from "./window-bar.js"
import { setTaskOpen } from "../lib/task-surface-preference.js"
import { copyTaskLink, duplicateTask, makeFolderOfTask } from "../tasks/task-acts.js"
import { cn } from "./ui/utils.js"
import { useIsMobile } from "./ui/use-mobile.js"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

export type TaskSurfaceMode = Exclude<TaskOpenMode, "tab">

/* The side panel's width, remembered like every other display preference: a
   person who widens it once should not widen it again on the next task. Clamped
   so the panel can never eat the page or vanish. */
const PANEL_KEY = "dana.taskPanelWidth"
const PANEL_MIN = 360
const PANEL_MAX = 720
const PANEL_DEFAULT = 440

/*
**The dialog is resizable too, and 9.3 is why.**

9.3 makes the width a property of the surface rather than of one of its shapes:
"The form's width is the viewer's, persisted client-side, on the sidebar's rule
in 9.1", and AC-182 reads that on the dialog, drags its handle and reloads. So
the dialog carries one, remembered under its own key, on the same rule and with
the same clamp as the panel's.

Wider bounds than the panel's, because a dialog is centred rather than pinned to
an edge; 680 stays the default, so nothing about the surface changes until
somebody drags it.
*/
const DIALOG_KEY = "dana.taskDialogWidth"
const DIALOG_MIN = 420
const DIALOG_MAX = 960
const DIALOG_DEFAULT = 680

function readDialogWidth() {
  try {
    const stored = Number(localStorage.getItem(DIALOG_KEY))
    if (!Number.isFinite(stored) || stored <= 0) return DIALOG_DEFAULT
    return Math.min(DIALOG_MAX, Math.max(DIALOG_MIN, stored))
  } catch {
    return DIALOG_DEFAULT
  }
}

function readPanelWidth() {
  try {
    const stored = Number(localStorage.getItem(PANEL_KEY))
    if (!Number.isFinite(stored) || stored <= 0) return PANEL_DEFAULT
    return Math.min(PANEL_MAX, Math.max(PANEL_MIN, stored))
  } catch {
    return PANEL_DEFAULT
  }
}

/* The grab edge, mirrored: a right panel is widened by dragging left, a left
   panel by dragging right, so the arithmetic flips with the side. Keyboard
   resizing comes along, as it does on the app sidebar. */
function PanelResizeHandle({
  side,
  min = PANEL_MIN,
  max = PANEL_MAX,
  width,
  onChange,
  onCommit,
  onReset,
}: {
  side: "left" | "right"
  min?: number
  max?: number
  width: number
  onChange: (next: number) => void
  onCommit: (next: number) => void
  onReset: () => void
}) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number; current: number } | null>(null)

  /* The bounds are the surface's rather than the panel's, a centred dialog
     affording more room than an edge does. */
  const clamp = (value: number) => Math.min(max, Math.max(min, value))

  return (
    <div
      role="separator"
      /* 9.1's names table, "Resize sidebar" and "Resize panel". */
      aria-label="Resize panel"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onDoubleClick={onReset}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.focus()
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: width,
          current: width,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return
        const delta = event.clientX - drag.current.startX
        const next = clamp(
          drag.current.startWidth + (side === "right" ? -delta : delta),
        )
        drag.current.current = next
        onChange(next)
      }}
      onPointerUp={(event) => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return
        onCommit(drag.current.current)
        drag.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 24 : 8
        let next: number | null = null
        if (event.key === "ArrowLeft") next = clamp(width + (side === "right" ? step : -step))
        else if (event.key === "ArrowRight") next = clamp(width + (side === "right" ? -step : step))
        else if (event.key === "Home") next = PANEL_MIN
        else if (event.key === "End") next = PANEL_MAX
        if (next === null) return
        event.preventDefault()
        onChange(next)
        onCommit(next)
      }}
      className={cn(
        "absolute inset-y-0 z-10 w-1.5 cursor-col-resize transition-colors",
        T_FAST,
        FOCUS,
        "hover:bg-[var(--color-dana-accent-200)] focus-visible:bg-[var(--color-dana-accent-200)]",
        side === "right" ? "left-0" : "right-0",
      )}
    />
  )
}

/* The title at page scale, renaming in place by the row's own rule. */
function PageTitle({
  value,
  done,
  onRename,
  compact = false,
}: {
  value: string
  done: boolean
  onRename: (title: string) => void
  compact?: boolean
}) {
  /* A task with no name has just been made, so the page opens in the field.
     This is a separate title component from the row's, so it needs its own
     autofocus for the floating button to land on a writable page. */
  const [editing, setEditing] = useState(value.trim() === "")
  const [draft, setDraft] = useState(value)
  /*
  **9.3's title row refuses and says why.**

  The row is "1 to 300; empty commits are refused with 'Give it a title'", and
  10.3 is where the 300 comes from; over-limit fields take "Too long: limit N
  characters", which AC-161 reads with the number in it, because a surface
  saying only Too long leaves the person to find out how much to delete by
  deleting.

  **It is a client message about a server rule and never a rule of its own.**
  7.6 and 10.3 enforce both bounds and answer 422 naming the field; this is the
  convenience 9.3 asks for in front of them. Never implement a validation the
  server does not also enforce.

  Held here rather than raised, because the control that has to change is this
  one and a message somewhere else would be a message beside the wrong field.
  */
  const [refusal, setRefusal] = useState<string | null>(null)

  function commit(next: string): void {
    const trimmed = next.trim()
    if (trimmed === "") {
      setRefusal(TITLE_REQUIRED)
      return
    }
    if (trimmed.length > TASK_TITLE_LIMIT) {
      setRefusal(tooLong(TASK_TITLE_LIMIT))
      return
    }
    setRefusal(null)
    onRename(trimmed)
    setEditing(false)
  }

  const metrics = cn(
    "min-w-0 flex-1 text-left font-semibold",
    /* The panel is 440px by default and a 24px title fills a third of it, so
       the page's scale steps down where the surface is narrow rather than
       shouting inside a column. */
    compact ? "text-lg leading-7" : "text-2xl leading-8",
    done
      ? "text-[var(--color-graphite-500)] line-through decoration-[var(--color-graphite-400)]"
      : "text-foreground",
  )

  /*
  **The title is a field at rest, not a button that becomes one.**

  `ui/inline-field.tsx` "renders as the text it edits, shows a soft ground when
  you point at it, and grows a ring only once you are actually in it", so there
  is nothing a click-to-edit button would buy.

  9.3 requires it. Its field table opens "the title (editable in place,
  required)", and the tests read it as a field: AC-092, AC-093 and AC-161 all
  `fill` and `blur` `formField(page, 'title')`, and the `taskSurface` helper
  identifies the whole surface as a dialog containing an element labelled title,
  the title being the one thing 9.3 puts on the card and on no picker. A control
  that is a button until it is clicked answers to none of that while it is
  resting.

  **The name is 9.3's field name, "title".** The row's own rename control keeps
  "Task title", because it is a different control on a surface that may hold
  fifty of them and giving both one name would make `formField` ambiguous.

  `editing` still does its one remaining job, which is the autofocus: a task
  with no name has just been made, so the page opens in the field.
  */
  return (
    <>
      <InlineInput
        autoFocus={editing}
        value={editing ? draft : value}
        aria-label="title"
        aria-invalid={refusal !== null}
        onFocus={(event) => {
          setDraft(value)
          setEditing(true)
          event.currentTarget.select()
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          if (refusal !== null) setRefusal(null)
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit(draft)
          }
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            setDraft(value)
            setRefusal(null)
            setEditing(false)
          }
        }}
        className={cn(
          metrics,
          "-mx-1 rounded-md px-1",
          editing &&
            "bg-background outline-none ring-2 ring-[var(--color-dana-accent-600)]",
        )}
      />
      {refusal === null ? null : (
        <p
          role="status"
          className="text-[12px] leading-4 text-[var(--color-danger-700)]"
        >
          {refusal}
        </p>
      )}
    </>
  )
}


/*
The task as a page: the surface's composition and the tab's. Exported so the
tab view renders exactly this with no chrome around it, a tab already has
its close in the strip.
*/
export function TaskPage({
  task: props,
  compact = false,
  inWindow = false,
}: {
  task: TaskRowProps & { id: string }
  /* A narrow surface, the side panel, steps the page scale down. */
  compact?: boolean
  /*
  This page *is* the window's content, the tab presentation, so its chrome
  belongs in the window bar rather than inside the scroll area.

  A task has no filter and no cover, but the bar's right end holds the controls
  for whatever the tab is showing, and a task has controls. So the same
  `Actions` cluster is drawn there instead of in the header: one element, one
  set of handlers, moved rather than copied.

  The bar's left end holds the task's address: its folder, and its section
  within that folder, the same path the row shows.
  */
  inWindow?: boolean
}) {
  const { task, patch, cardHandlers } = useCardWiring(props)
  /* The surface's menu carries History like the row's, over the same sheet. */
  const [historyOpen, setHistoryOpen] = useState(false)

  const actions = (
    <Actions
      task={task}
      persistent
      onHistory={props.id ? () => setHistoryOpen(true) : undefined}
      extra={
        props.id ? (
          <HistorySheet
            kind="task"
            subject={props.id}
            name={task.title}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
          />
        ) : undefined
      }
      onStar={() => {
        patch(task.id, { important: !task.important })
        props.onToggleImportant?.()
      }}
      onRestore={
        task.abandoned ? () => patch(task.id, { abandoned: false }) : undefined
      }
      onMoveToFolder={(folder: { name: string; color: string }) =>
        patch(task.id, { folder })
      }
      onAbandon={props.onAbandon}
      onDelete={props.onDelete}
      /* The three acts a surface can perform from its own id, as the row reads
         them: none is drawn without one. */
      onCopyLink={props.id ? () => copyTaskLink(props.id!, task.title) : undefined}
      onDuplicate={props.id ? () => duplicateTask(props.id!, task.title) : undefined}
      onMakeFolder={props.id ? () => makeFolderOfTask(props.id!, task.title) : undefined}
    />
  )

  return (
    <div>
      {inWindow ? (
        <>
          <WindowBarLead>
            <span className="flex min-w-0 items-center gap-1.5 pl-1 text-[12px] leading-4 text-[var(--color-graphite-500)]">
              <FolderMark
                name={task.folder?.name}
                color={task.folder?.color}
                className="size-3.5 shrink-0"
              />
              <span className="truncate">{folderNameOf(task.folder?.name)}</span>
              {props.section ? (
                <>
                  {/* A chevron rather than a second glyph: the mark before it
                      already said "folder", and what this adds is depth, not a
                      different kind of thing. */}
                  <ChevronRight
                    className="size-3 shrink-0 text-[var(--color-graphite-400)]"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <span className="truncate">{props.section}</span>
                </>
              ) : null}
            </span>
          </WindowBarLead>
          <WindowBarActions>{actions}</WindowBarActions>
        </>
      ) : null}
      {/*
      The checkbox sits on the title's first line, not on the header's top edge.

      A fixed nudge cannot be right for two title sizes, so the alignment is
      derived instead: the row is centred on the title's own line height, and
      the line height is the thing that already changes with `compact`. One
      rule, both sizes, and any future size too.
       */}
      <header className="flex items-start gap-3 pb-2 pl-1">
        <span
          className={cn(
            "flex shrink-0 items-center",
            compact ? "h-7" : "h-8",
          )}
        >
          {/*
          **9.5's confirmation, at the control rather than in the write path.**

          9.3 gives the card's completion control 9.5's rule "unchanged": an
          un-complete that takes a G-SERIES successor confirms first, because
          5.1 deletes that successor in the same transaction and the parenthesis
          is the part the person cannot see, "any edits already made to the next
          occurrence go with it". A row gets this from its page; a surface has
          no page behind it.

          **It sits on the control and not on the write**: a writer sees a
          `Partial<ConceptTask>` and has to work out from the task what the
          press meant, while this component holds both the press and the task.
          The rule is the task's own `recurrence`, which survives a completion,
          the successor existing because the rule did.

          Only on the branch that has a successor: a task with no rule generates
          none, and a confirmation with an empty consequence is a dead control.
           */}
          <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
        </span>
        <PageTitle
          compact={compact}
          value={task.title}
          done={Boolean(task.done)}
          onRename={(title) => patch(task.id, { title })}
        />
        {/*
        The row's own trailing cluster, reused rather than rebuilt.

        A surface must not do strictly less to a task than the row it came from,
        so the page takes `Actions` entire: the same items, in the same order,
        from one definition, star included.
         */}
        {inWindow ? null : (
          <span
            className={cn(
              "flex shrink-0 items-center",
              compact ? "h-7" : "h-8",
            )}
          >
            {actions}
          </span>
        )}
      </header>
      {/* The same card, the same wiring, the page differs only in what
          stands above it. The card keeps its own left gutter (pl-7), which
          here lines the blocks up under the title rather than under a row. */}
      <TaskCard
        task={task}
        patch={patch}
        {...cardHandlers}
        chrome="surface"
        onClose={() => {}}
      />
    </div>
  )
}

function SurfaceChrome({
  mode,
  onModeChange,
  onOpenInTab,
  onClose,
  children,
}: {
  mode: TaskSurfaceMode
  onModeChange: (mode: TaskSurfaceMode) => void
  onOpenInTab?: () => void
  onClose: () => void
  children: ReactNode
}) {
  /* The strip offers every mode; "tab" is an action rather than a state, so
     selecting it hands the task to the page bar instead of switching. */
  const options = TASK_OPEN_OPTIONS.filter(
    (option) => option.key !== "tab" || Boolean(onOpenInTab),
  )

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-graphite-100)] pr-2 pl-4">
        {/*
        **The chrome does not repeat the title**, the same rule as
        `components/window-bar.tsx`: "The title is not repeated. The tab says
        it; saying it twice, two centimetres apart, is how a chrome stack starts
        looking cluttered." The card below carries the title as a field.

        **Repeating it would cost more than clutter.** AC-178 refuses an open
        task's surface saying anything matching /completed/i, which is how it
        proves the history block renders the completion only when the task has
        one. A title read as text would put every word of the task's own name
        into that assertion. The card's title is an `<input>`, whose value is
        not text content, so the field says the name without asserting anything
        about the task's state.

        The strip keeps its space, so the view controls stay where they are.
         */}
        <span className="min-w-0 flex-1" />
        {/* Unlabelled icons beside the close control read as nothing in
            particular; the word says what they choose, and that choosing one is
            remembered. */}
        <span
          className="text-[11px] leading-4 text-[var(--color-graphite-500)]"
          title="Where this task opens; Dana remembers the one you pick"
        >
          Open in
        </span>
        <ViewStrip
          ariaLabel="Where this task opens"
          value={mode}
          options={options}
          onSelect={(key) => {
            if (key === "tab") {
              onOpenInTab?.()
              return
            }
            setTaskOpen(key === "right" ? "panel" : "dialog")
            onModeChange(key as TaskSurfaceMode)
          }}
        />
        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-[var(--color-graphite-200)]" />
        <button
          type="button"
          aria-label="Close task"
          onClick={onClose}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-500)] transition-colors hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
            T_FAST,
            FOCUS,
          )}
        >
          <X className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {children}
    </>
  )
}

export function TaskSurface({
  task,
  mode,
  onModeChange,
  onOpenInTab,
  onClose,
}: {
  task: TaskRowProps & { id: string }
  mode: TaskSurfaceMode
  onModeChange: (mode: TaskSurfaceMode) => void
  onOpenInTab?: () => void
  onClose: () => void
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [panelWidth, setPanelWidth] = useState(readPanelWidth)
  const [dialogWidth, setDialogWidth] = useState(readDialogWidth)
  /* Below 768px the surface takes the whole width in either mode and its resize
     handle goes, a hand having nothing to drag against; the close control in
     the chrome above stays where it is. */
  const isMobile = useIsMobile()

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /* Keyed by task and mode so a switch remounts the page cleanly rather
     than carrying transient state across layouts. */
  const page = (
    <TaskPage
      /*
      Keyed by task and mode so a switch remounts the page cleanly rather than
      carrying transient state, the title's draft and its refusal, across
      layouts.
      */
      key={`${task.id}-${mode}`}
      task={task}
      compact={mode === "right"}
    />
  )

  const chrome = (body: ReactNode) => (
    <SurfaceChrome
      mode={mode}
      onModeChange={onModeChange}
      onOpenInTab={onOpenInTab}
      onClose={onClose}
    >
      {body}
    </SurfaceChrome>
  )

  if (mode === "dialog") {
    return (
      <HoldsTheDocument>
      <div className="fixed inset-0 z-50 duration-[var(--duration-base)] ease-[var(--ease-enter)] animate-in fade-in-0">
        <button
          type="button"
          aria-label="Close task"
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-black/30"
        />
        <div
          style={{ width: isMobile ? "100%" : dialogWidth }}
          /*
          **The dialog says so.** 9.1's roles table fixes "The task surface: a
          dialog when opened as one; a page when opened as a tab or by its URL",
          and tests read exactly that, `getByRole('dialog')` filtered by the
          element labelled title. The label is the task, so a page holding a
          picker open over the surface still has one dialog named after the task
          and one named after the field.
          */
          role="dialog"
          aria-modal="true"
          aria-label={task.title}
          /*
          **`transition-none`, because the handle above makes the width move.**
          The class list carries `duration-*` for the entrance animation and no
          `transition-*`, which would leave transition-property at its initial
          value, `all`: every pointer move would animate the width over 200 ms
          instead of following the hand, and AC-182 would measure a width still
          travelling. The entrance keeps its animation; only the transition is
          switched off.
          */
          className={cn(
            "absolute inset-x-0 mx-auto flex w-full max-w-full flex-col overflow-hidden border border-[var(--color-graphite-200)] bg-card shadow-[var(--elevation-2)] transition-none duration-[var(--duration-base)] ease-[var(--ease-enter)] animate-in fade-in-0 slide-in-from-top-2",
            isMobile ? "top-0 max-h-svh rounded-none" : "top-[8vh] max-h-[84vh] rounded-xl",
          )}
        >
          {isMobile ? null : (
          <PanelResizeHandle
            side="left"
            min={DIALOG_MIN}
            max={DIALOG_MAX}
            width={dialogWidth}
            onChange={setDialogWidth}
            onCommit={(next) => {
              setDialogWidth(next)
              try {
                localStorage.setItem(DIALOG_KEY, String(Math.round(next)))
              } catch {
                /* Remembered for this session only, the honest fallback. */
              }
            }}
            onReset={() => setDialogWidth(DIALOG_DEFAULT)}
          />
          )}
          {chrome(
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{page}</div>,
          )}
        </div>
      </div>
      </HoldsTheDocument>
    )
  }

  function commitPanelWidth(next: number) {
    setPanelWidth(next)
    try {
      localStorage.setItem(PANEL_KEY, String(Math.round(next)))
    } catch {
      /* Remembered for this session only, the honest fallback. */
    }
  }

  /*
  The page makes room rather than being covered: a right sidebar adjusts the
  view of the page instead of overlapping it.

  A panel that sits *over* the page hides the row the task came from, which is
  the one piece of context a side-by-side surface exists to keep. Notion, Linear
  and Things all shrink the page for the same reason.

  The width is published as a variable on the document rather than lifted into
  the shell's state, because the panel owns its own width, it is resizable, and
  remembered, and threading a live number up through the shell so the shell can
  hand it back down is a lot of wiring for a fact that has one owner. The shell
  reads the variable; nothing has to be told.
  */
  return (
    <ReservesRightEdge width={isMobile ? 0 : panelWidth}>
    <aside
      aria-label={task.title}
      style={{ width: isMobile ? "100%" : panelWidth }}
      className={cn(
        "fixed right-0 bottom-0 z-50 flex max-w-full flex-col border-l border-[var(--color-graphite-200)] bg-card shadow-[var(--elevation-2)] duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in slide-in-from-right",
        /* Keep the tab strip visible, then let the panel provide its own
           window bar instead of leaving the page's bar as an empty cap. */
        isMobile ? "top-0" : "top-[var(--shell-pagebar-height)]",
      )}
    >
      {isMobile ? null : (
      <PanelResizeHandle
        side={mode === "right" ? "right" : "left"}
        width={panelWidth}
        onChange={setPanelWidth}
        onCommit={commitPanelWidth}
        onReset={() => commitPanelWidth(PANEL_DEFAULT)}
      />
      )}
      {chrome(
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{page}</div>,
      )}
    </aside>
    </ReservesRightEdge>
  )
}
