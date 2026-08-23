import { useEffect, useRef, useState } from "react"
import {
  CheckCircle2,
  ChevronRight,
  Folder,
  FolderInput,
  Filter,
  LogOut,
  MoreHorizontal,
  Palette,
  Pencil,
  Share2,
  Trash2,
} from "@/lib/icons"

import { QuickAdd } from "@/components/quick-add"
import { SharingPanel } from "@/components/sharing-panel"
import { InlineError, SkeletonList } from "@/components/state-patterns"
import {
  TaskList,
  TaskRow,
  type TaskListWiring,
  type TaskRowProps,
  type TaskOpenMode,
} from "@/components/task-row"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type FolderTask = TaskRowProps & { id: string }
type OpenTaskFilter = "all" | "scheduled" | "unscheduled"

interface FolderScreenProps {
  folderName?: string
  folderColor?: string
  folderLabel?: string
  availableFolderLabels?: string[]
  isShared?: boolean
  scheduled: FolderTask[]
  unscheduled: FolderTask[]
  completed: FolderTask[]
  previewState?: string | null
  isOwner?: boolean
  isDefault?: boolean
  initialShareOpen?: boolean
  initialFolderAction?: "rename" | "appearance" | "delete"
  onAdd: (section: "scheduled" | "unscheduled", title: string) => void
  onOpenFullForm: (section: "scheduled" | "unscheduled") => void
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRestore: (taskId: string) => void
  onAbandon: (taskId: string) => void
  onDelete: (taskId: string) => void
  onDeleteFolder?: () => void
  onRenameFolder?: (name: string) => void
  onMoveToLabel?: (label: string | null, color: string) => void
}

export function FolderScreen({
  folderName = "Travel",
  folderColor = "var(--color-graphite-900)",
  folderLabel = "Personal",
  availableFolderLabels = ["Personal", "Work"],
  isShared = true,
  scheduled,
  unscheduled,
  completed,
  previewState,
  isOwner = true,
  isDefault = false,
  initialShareOpen = false,
  initialFolderAction,
  onAdd,
  onOpenFullForm,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onRestore,
  onAbandon,
  onDelete,
  onDeleteFolder,
  onRenameFolder,
  onMoveToLabel,
}: FolderScreenProps) {
  const [displayName, setDisplayName] = useState(folderName)
  const [displayColor, setDisplayColor] = useState(folderColor)
  const [personalLabel, setPersonalLabel] = useState(folderLabel)
  const [folderEditor, setFolderEditor] = useState<"rename" | "label" | null>(
    initialFolderAction === "rename"
      ? "rename"
      : initialFolderAction === "appearance"
        ? "label"
        : null,
  )
  const [draftName, setDraftName] = useState(folderName)
  const [draftLabel, setDraftLabel] = useState("")
  const [draftColor, setDraftColor] = useState(folderColor)
  const [shareOpen, setShareOpen] = useState(initialShareOpen)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [openTaskFilter, setOpenTaskFilter] = useState<OpenTaskFilter>("all")
  const [pendingTaskAction, setPendingTaskAction] = useState<{
    type: "abandon" | "delete"
    taskId: string
  } | null>(null)
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(
    initialFolderAction === "delete",
  )
  const [leaveFolderOpen, setLeaveFolderOpen] = useState(false)
  const [completingIds, setCompletingIds] = useState<Set<string>>(
    () => new Set(),
  )
  const moveLabels = [...new Set([...availableFolderLabels, personalLabel])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  const [completionNotice, setCompletionNotice] = useState<{
    id: string
    title: string
  } | null>(null)
  const completionTimers = useRef(new Map<string, number>())
  const completingRef = useRef(new Set<string>())
  const noticeTimer = useRef<number | null>(null)
  const isEmpty =
    scheduled.length === 0 &&
    unscheduled.length === 0 &&
    completed.length === 0
  const pendingCount = [...scheduled, ...unscheduled].filter(
    (task) =>
      task.status !== "abandoned" && !completingIds.has(task.id),
  ).length
  const completedCount = completed.length + completingIds.size
  const abandonedCount = [...scheduled, ...unscheduled].filter(
    (task) => task.status === "abandoned",
  ).length
  const openCount = [...scheduled, ...unscheduled].filter(
    (task) => task.status !== "abandoned",
  ).length
  const completionTotal = pendingCount + completedCount
  const openTasks =
    openTaskFilter === "scheduled"
      ? scheduled
      : openTaskFilter === "unscheduled"
        ? unscheduled
        : [...scheduled, ...unscheduled]
  const filterLabel =
    openTaskFilter === "scheduled"
      ? "With due date"
      : openTaskFilter === "unscheduled"
        ? "Without due date"
        : "All open tasks"
  const quickAddSection =
    openTaskFilter === "scheduled" ? "scheduled" : "unscheduled"

  useEffect(() => {
    return () => {
      completionTimers.current.forEach((timer) => window.clearTimeout(timer))
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  useEffect(() => {
    setDisplayName(folderName)
    setDraftName(folderName)
  }, [folderName])

  useEffect(() => {
    setDisplayColor(folderColor)
    setDraftColor(folderColor)
  }, [folderColor])

  function completeWithTransition(task: FolderTask) {
    completingRef.current.add(task.id)
    setCompletingIds((current) => new Set(current).add(task.id))
    setCompletionNotice({ id: task.id, title: task.title })

    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(
      () => setCompletionNotice(null),
      5000,
    )

    const timer = window.setTimeout(() => {
      onToggleComplete(task.id, true)
      completingRef.current.delete(task.id)
      setCompletingIds((current) => {
        const next = new Set(current)
        next.delete(task.id)
        return next
      })
      completionTimers.current.delete(task.id)
    }, 240)
    completionTimers.current.set(task.id, timer)
  }

  function undoCompletion() {
    if (!completionNotice) return
    const timer = completionTimers.current.get(completionNotice.id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      completionTimers.current.delete(completionNotice.id)
      completingRef.current.delete(completionNotice.id)
      setCompletingIds((current) => {
        const next = new Set(current)
        next.delete(completionNotice.id)
        return next
      })
    } else {
      onToggleComplete(completionNotice.id, false)
    }
    setCompletionNotice(null)
  }

  /* The screen keeps its own row: completing one here plays a transition
     before it leaves the list, and an abandoned one restores instead. The
     list wiring is spread straight through. */
  function renderTask(task: FolderTask, wiring?: TaskListWiring) {
    return (
      <TaskRow
        key={task.id}
        {...task}
        {...wiring}
        completionPreview={completingIds.has(task.id)}
        collapsing={completingIds.has(task.id)}
        onOpen={(mode) => {
          if (!completingRef.current.has(task.id)) onOpenTask(task.id, mode)
        }}
        onToggleComplete={(completedValue) =>
          task.status === "abandoned"
            ? onRestore(task.id)
            : completedValue && task.status !== "completed"
              ? completeWithTransition(task)
              : onToggleComplete(task.id, completedValue)
        }
        onToggleImportant={() => onToggleImportant(task.id)}
        onAbandon={() =>
          setPendingTaskAction({ type: "abandon", taskId: task.id })
        }
        onDelete={() =>
          setPendingTaskAction({ type: "delete", taskId: task.id })
        }
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
      <header className="flex min-h-14 items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-3">
          <Folder
            className="mt-0.5 size-6 shrink-0"
            style={{ color: displayColor }}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h1 className="truncate text-2xl leading-8 font-semibold">{displayName}</h1>
            {completionTotal > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {completedCount} / {completionTotal}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-[var(--control-height)] ${openTaskFilter !== "all" ? "bg-[var(--color-graphite-100)] text-[var(--color-graphite-800)]" : "text-[var(--color-graphite-600)]"}`}
                  aria-label={`Filter open tasks: ${filterLabel}`}
                  title={`Filter open tasks: ${filterLabel}`}
                />
              }
            >
              <Filter className="size-5" strokeWidth={1.75} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuRadioGroup
                value={openTaskFilter}
                onValueChange={(value) =>
                  setOpenTaskFilter(value as OpenTaskFilter)
                }
              >
                <DropdownMenuRadioItem value="all">
                  All open tasks
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="scheduled">
                  With due date
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="unscheduled">
                  Without due date
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <AvatarGroup>
            <Avatar size="sm"><AvatarFallback>IW</AvatarFallback></Avatar>
            {isShared ? (
              <Avatar size="sm"><AvatarFallback>S</AvatarFallback></Avatar>
            ) : null}
          </AvatarGroup>
          {!isDefault ? (
            <Button
              variant="outline"
              className="h-[var(--control-height)] px-3 text-sm"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Share
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-[var(--control-height)]"
                  aria-label="More folder actions"
                />
              }
            >
              <MoreHorizontal className="size-5" strokeWidth={1.75} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {isOwner ? (
                <DropdownMenuItem
                  onClick={() => {
                    setDraftName(displayName)
                    setFolderEditor("rename")
                  }}
                >
                  <Pencil className="size-4" />Rename
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={() => {
                  setDraftLabel(personalLabel)
                  setDraftColor(displayColor)
                  setFolderEditor("label")
                }}
              >
                <Palette className="size-4" />Label and color
              </DropdownMenuItem>
              {!isDefault ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput className="size-4" />Move to group
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    <DropdownMenuRadioGroup
                      value={personalLabel || "__none"}
                      onValueChange={(value) => {
                        const nextLabel = value === "__none" ? null : value
                        setPersonalLabel(nextLabel ?? "")
                        setDraftLabel(nextLabel ?? "")
                        onMoveToLabel?.(nextLabel, displayColor)
                      }}
                    >
                      {moveLabels.map((label) => (
                        <DropdownMenuRadioItem
                          key={label}
                          value={label}
                          closeOnClick
                        >
                          {label}
                        </DropdownMenuRadioItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioItem value="__none" closeOnClick>
                        No group
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
              {!isDefault ? <DropdownMenuSeparator /> : null}
              {!isDefault && isOwner ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteFolderOpen(true)}
                >
                  <Trash2 className="size-4" />Delete folder…
                </DropdownMenuItem>
              ) : !isDefault ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setLeaveFolderOpen(true)}
                >
                  <LogOut className="size-4" />Leave folder…
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="mt-7">
        {previewState === "loading" ? (
          <SkeletonList />
        ) : previewState === "error" ? (
          <InlineError />
        ) : previewState === "empty" || isEmpty ? (
          <div>
            <Empty className="min-h-52">
              <EmptyMedia className="text-[var(--color-graphite-400)]">
                <Folder className="size-9" strokeWidth={1.6} aria-hidden="true" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyDescription className="text-sm">
                  No tasks yet. Add one below.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
            <QuickAdd
              folderName={folderName}
              label="Add task"
              onAdd={(title) => onAdd("unscheduled", title)}
              onOpenFullForm={() => onOpenFullForm("unscheduled")}
            />
          </div>
        ) : (
          <div className="space-y-7">
            <section aria-label={filterLabel}>
              {openTasks.length > 0 ? (
                <div role="list" className="space-y-0.5">
                  <TaskList onTaskOpen={onOpenTask} tasks={openTasks} renderRow={renderTask} />
                </div>
              ) : (
                <p className="h-[var(--control-height)] px-2 text-sm leading-[var(--control-height)] text-[var(--color-graphite-500)]">
                  {openTaskFilter === "scheduled"
                    ? "No tasks with a due date."
                    : openTaskFilter === "unscheduled"
                      ? "No tasks without a due date."
                      : "No open tasks."}
                </p>
              )}
              <QuickAdd
                folderName={folderName}
                label={
                  openTaskFilter === "scheduled"
                    ? "Add scheduled task"
                    : "Add task"
                }
                onAdd={(title) => onAdd(quickAddSection, title)}
                onOpenFullForm={() => onOpenFullForm(quickAddSection)}
              />
            </section>

            {completed.length > 0 ? (
              <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
                <CollapsibleTrigger className={`group/completed flex h-[var(--control-height)] w-full items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors hover:bg-[var(--color-graphite-50)] focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none ${completionNotice ? "bg-[var(--color-graphite-50)] text-[var(--color-graphite-800)]" : "text-[var(--color-graphite-500)]"}`}>
                  <ChevronRight className="size-4 transition-transform group-data-panel-open/completed:rotate-90" strokeWidth={1.75} />
                  Completed ({completed.length})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <TaskList onTaskOpen={onOpenTask} className="mt-0.5" tasks={completed} renderRow={renderTask} />
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </div>
        )}
      </div>

      {!isDefault ? (
        <SharingPanel
          open={shareOpen}
          onOpenChange={setShareOpen}
          isOwner={isOwner}
          folderName={displayName}
        />
      ) : null}

      {completionNotice ? (
        <div
          role="status"
          className="fixed right-6 bottom-[76px] z-40 flex min-h-[var(--control-height)] max-w-sm items-center gap-2 rounded-lg bg-[var(--color-graphite-900)] px-3 text-sm text-white shadow-[var(--elevation-1)]"
        >
          <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 truncate">Completed: {completionNotice.title}</span>
          <Button
            variant="ghost"
            className="h-8 px-2 text-xs text-white hover:bg-white/10 hover:text-white"
            onClick={undoCompletion}
          >
            Undo
          </Button>
        </div>
      ) : null}

      <AlertDialog open={pendingTaskAction !== null} onOpenChange={(open) => !open && setPendingTaskAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTaskAction?.type === "abandon" ? "Abandon this task?" : "Delete this task?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTaskAction?.type === "abandon" ? "You can restore it from this folder later." : "This can’t be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => {
                if (!pendingTaskAction) return
                pendingTaskAction.type === "abandon"
                  ? onAbandon(pendingTaskAction.taskId)
                  : onDelete(pendingTaskAction.taskId)
              }}
            >
              {pendingTaskAction?.type === "abandon" ? "Abandon" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={folderEditor !== null}
        onOpenChange={(open) => {
          if (!open) setFolderEditor(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {folderEditor === "rename" ? "Rename folder" : "Label and color"}
            </DialogTitle>
            <DialogDescription>
              {folderEditor === "rename"
                ? "The new name is visible to every folder member."
                : "This grouping label and color are personal to you."}
            </DialogDescription>
          </DialogHeader>
          {folderEditor === "rename" ? (
            <div>
              <label htmlFor="folder-rename" className="text-xs font-medium text-foreground">
                Folder name
              </label>
              <Input
                id="folder-rename"
                value={draftName}
                maxLength={100}
                onChange={(event) => setDraftName(event.target.value)}
                className="mt-2 h-[var(--control-height)]"
              />
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label htmlFor="folder-label" className="text-xs font-medium text-foreground">
                  Personal label
                </label>
                <Input
                  id="folder-label"
                  value={draftLabel}
                  maxLength={40}
                  placeholder="For example, Personal or Work"
                  onChange={(event) => setDraftLabel(event.target.value)}
                  className="mt-2 h-[var(--control-height)]"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Leave empty to keep the folder outside a label group.
                </p>
              </div>
              <fieldset>
                <legend className="text-xs font-medium text-foreground">Folder color</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    ["Graphite", "var(--color-graphite-900)"],
                    ["Cobalt", "var(--color-folder-cobalt)"],
                    ["Violet", "var(--color-folder-violet)"],
                    ["Teal", "var(--color-folder-teal)"],
                    ["Fern", "var(--color-folder-fern)"],
                    ["Clay", "var(--color-folder-clay)"],
                    ["Ochre", "var(--color-folder-ochre)"],
                  ].map(([name, value]) => (
                    <button
                      key={name}
                      type="button"
                      aria-label={`${name} folder color`}
                      aria-pressed={draftColor === value}
                      className={cn(
                        "flex size-10 items-center justify-center rounded-md border bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                        draftColor === value
                          ? "border-[var(--color-graphite-700)]"
                          : "border-[var(--color-graphite-200)]",
                      )}
                      onClick={() => setDraftColor(value)}
                    >
                      <Folder className="size-5" style={{ color: value }} strokeWidth={1.75} />
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderEditor(null)}>Cancel</Button>
            <Button
              disabled={folderEditor === "rename" && !draftName.trim()}
              onClick={() => {
                if (folderEditor === "rename") {
                  const nextName = draftName.trim()
                  setDisplayName(nextName)
                  onRenameFolder?.(nextName)
                }
                if (folderEditor === "label") {
                  const nextLabel = draftLabel.trim()
                  setPersonalLabel(nextLabel)
                  setDisplayColor(draftColor)
                  onMoveToLabel?.(nextLabel || null, draftColor)
                }
                setFolderEditor(null)
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={leaveFolderOpen} onOpenChange={setLeaveFolderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll lose access. Tasks assigned to you in this folder will become unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction destructive onClick={() => setLeaveFolderOpen(false)}>
              Leave folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteFolderOpen} onOpenChange={setDeleteFolderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {openCount} open, {completed.length} completed, and {abandonedCount} abandoned tasks for every member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => {
                onDeleteFolder?.()
                setDeleteFolderOpen(false)
              }}
            >
              Delete folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
