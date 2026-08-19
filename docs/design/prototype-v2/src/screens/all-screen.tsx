import { useState } from "react"
import { CalendarDays, Folder, Layers3, ListTodo } from "lucide-react"

import { QuickAdd } from "@/components/quick-add"
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"

export type AllTask = TaskRowProps & { id: string }

export interface AllFolderGroup {
  name: string
  color: string
  tasks: AllTask[]
}

interface AllScreenProps {
  planned: AllTask[]
  inbox: AllTask[]
  groups: AllFolderGroup[]
  previewState?: string | null
  onAddPlanned: (title: string) => void
  onAddUndated: (folderName: string, title: string) => void
  onOpenPlannedForm: () => void
  onOpenUndatedForm: (folderName: string) => void
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRestore: (taskId: string) => void
  onAbandon: (taskId: string) => void
  onDelete: (taskId: string) => void
}

export function AllScreen({
  planned,
  inbox,
  groups,
  previewState,
  onAddPlanned,
  onAddUndated,
  onOpenPlannedForm,
  onOpenUndatedForm,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onRestore,
  onAbandon,
  onDelete,
}: AllScreenProps) {
  const [pendingAction, setPendingAction] = useState<{
    type: "abandon" | "delete"
    taskId: string
  } | null>(null)
  const hasTasks =
    planned.length > 0 ||
    inbox.length > 0 ||
    groups.some((group) => group.tasks.length > 0)

  /* The screen keeps its own row, because its completion is conditional —
     an abandoned task restores rather than completes — and hands the list
     wiring straight through. See TaskList's renderRow. */
  function renderTask(task: AllTask, wiring?: TaskListWiring) {
    return (
      <TaskRow
        key={task.id}
        {...task}
        {...wiring}
        onOpen={(mode) => onOpenTask(task.id, mode)}
        onToggleComplete={(completed) =>
          task.status === "abandoned"
            ? onRestore(task.id)
            : onToggleComplete(task.id, completed)
        }
        onToggleImportant={() => onToggleImportant(task.id)}
        onAbandon={() =>
          setPendingAction({ type: "abandon", taskId: task.id })
        }
        onDelete={() =>
          setPendingAction({ type: "delete", taskId: task.id })
        }
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
      <header className="flex min-h-12 items-start gap-3">
        <Layers3
          className="mt-0.5 size-6 shrink-0 text-[var(--color-graphite-700)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
            All
          </h1>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            Every open task
          </p>
        </div>
      </header>

      <div className="mt-7">
        {previewState === "loading" ? (
          <SkeletonList />
        ) : previewState === "error" ? (
          <InlineError />
        ) : previewState === "empty" || !hasTasks ? (
          <Empty className="min-h-72">
            <EmptyMedia className="text-[var(--color-graphite-400)]">
              <Layers3 className="size-9" strokeWidth={1.6} aria-hidden="true" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyDescription className="max-w-[52ch] text-sm leading-5 text-muted-foreground">
                Nothing here yet. Add your first task with the + button.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-8">
            {planned.length > 0 ? (
              <section aria-labelledby="all-planned-heading">
                <div className="mb-2 flex h-8 items-center gap-2 border-b border-border px-2">
                  <CalendarDays
                    className="size-4 text-[var(--color-graphite-500)]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <h2
                    id="all-planned-heading"
                    className="text-base leading-6 font-semibold text-foreground"
                  >
                    Planned
                  </h2>
                </div>
                <TaskList
                    className=""
                    tasks={planned}
                    renderRow={renderTask}
                  />
                <QuickAdd
                  folderName="Inbox"
                  label="Add scheduled task"
                  onAdd={onAddPlanned}
                  onOpenFullForm={onOpenPlannedForm}
                />
              </section>
            ) : null}

            {inbox.length > 0 || groups.some((group) => group.tasks.length > 0) ? (
              <section aria-labelledby="all-tasks-heading">
                <div className="mb-2 flex h-8 items-center gap-2 border-b border-border px-2">
                  <ListTodo
                    className="size-4 text-[var(--color-graphite-500)]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <h2
                    id="all-tasks-heading"
                    className="text-base leading-6 font-semibold text-foreground"
                  >
                    Tasks
                  </h2>
                </div>

                <div className="space-y-7">
                  {inbox.length > 0 ? (
                    <div aria-label="Inbox tasks">
                      <TaskList
                                                    tasks={inbox}
                          renderRow={renderTask}
                        />
                      <QuickAdd
                        folderName="Inbox"
                        onAdd={(title) => onAddUndated("Inbox", title)}
                        onOpenFullForm={() => onOpenUndatedForm("Inbox")}
                      />
                    </div>
                  ) : null}

                  {groups
                    .filter((group) => group.tasks.length > 0)
                    .map((group) => (
                      <div key={group.name}>
                        <div className="mb-1 flex h-7 items-center gap-2 px-2">
                          <Folder
                            className="size-4 shrink-0"
                            style={{ color: group.color }}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <h3 className="truncate text-[13px] font-semibold text-[var(--color-graphite-700)]">
                            {group.name}
                          </h3>
                        </div>
                        <TaskList
                                                        tasks={group.tasks}
                            renderRow={renderTask}
                          />
                        <QuickAdd
                          folderName={group.name}
                          onAdd={(title) => onAddUndated(group.name, title)}
                          onOpenFullForm={() => onOpenUndatedForm(group.name)}
                        />
                      </div>
                    ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.type === "abandon"
                ? "Abandon this task?"
                : "Delete this task?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "abandon"
                ? "You can restore it from its home page later."
                : "This can’t be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => {
                if (!pendingAction) return
                if (pendingAction.type === "abandon") {
                  onAbandon(pendingAction.taskId)
                } else {
                  onDelete(pendingAction.taskId)
                }
                setPendingAction(null)
              }}
            >
              {pendingAction?.type === "abandon" ? "Abandon" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
