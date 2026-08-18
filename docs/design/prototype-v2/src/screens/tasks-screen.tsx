import { useState } from "react"
import { Folder, ListTodo } from "lucide-react"

import { QuickAdd } from "@/components/quick-add"
import { InlineError, SkeletonList } from "@/components/state-patterns"
import {
  TaskList,
  TaskRow,
  type TaskListWiring,
  type TaskRowProps,
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

export type TasksTask = TaskRowProps & { id: string }

export interface TasksFolderGroup {
  name: string
  color: string
  tasks: TasksTask[]
}

interface TasksScreenProps {
  inbox: TasksTask[]
  groups: TasksFolderGroup[]
  previewState?: string | null
  onAdd: (folderName: string, title: string) => void
  onOpenFullForm: (folderName: string) => void
  onOpenTask: (taskId: string) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRestore: (taskId: string) => void
  onAbandon: (taskId: string) => void
  onDelete: (taskId: string) => void
}

export function TasksScreen({
  inbox,
  groups,
  previewState,
  onAdd,
  onOpenFullForm,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onRestore,
  onAbandon,
  onDelete,
}: TasksScreenProps) {
  const [pendingAction, setPendingAction] = useState<{
    type: "abandon" | "delete"
    taskId: string
  } | null>(null)
  const hasTasks = inbox.length > 0 || groups.some((group) => group.tasks.length > 0)

  /* The screen keeps its own row, because its completion is conditional —
     an abandoned task restores rather than completes — and hands the list
     wiring straight through. See TaskList's renderRow. */
  function renderTask(task: TasksTask, wiring?: TaskListWiring) {
    return (
      <TaskRow
        key={task.id}
        {...task}
        {...wiring}
        onOpen={() => onOpenTask(task.id)}
        onToggleComplete={(completed) =>
          task.status === "abandoned"
            ? onRestore(task.id)
            : onToggleComplete(task.id, completed)
        }
        onToggleImportant={() => onToggleImportant(task.id)}
        onAbandon={() => setPendingAction({ type: "abandon", taskId: task.id })}
        onDelete={() => setPendingAction({ type: "delete", taskId: task.id })}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
      <header className="flex min-h-12 items-start gap-3">
        <ListTodo
          className="mt-0.5 size-6 shrink-0 text-[var(--color-graphite-700)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
            Tasks
          </h1>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            Undated tasks
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
              <ListTodo className="size-9" strokeWidth={1.6} aria-hidden="true" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyDescription className="max-w-[52ch] text-sm leading-5 text-muted-foreground">
                No undated tasks. Anything you capture without a date lands here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-7">
            {inbox.length > 0 ? (
              <section aria-label="Inbox tasks">
                <TaskList
                    className=""
                    tasks={inbox}
                    renderRow={renderTask}
                  />
                <QuickAdd
                  folderName="Inbox"
                  onAdd={(title) => onAdd("Inbox", title)}
                  onOpenFullForm={() => onOpenFullForm("Inbox")}
                />
              </section>
            ) : null}

            {groups
              .filter((group) => group.tasks.length > 0)
              .map((group) => {
                const headingId = `tasks-${group.name.toLowerCase().replaceAll(" ", "-")}`
                return (
                <section key={group.name} aria-labelledby={headingId}>
                  <div className="mb-1 flex h-7 items-center gap-2 px-2">
                    <Folder
                      className="size-4 shrink-0"
                      style={{ color: group.color }}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <h2
                      id={headingId}
                      className="truncate text-[13px] font-semibold text-[var(--color-graphite-700)]"
                    >
                      {group.name}
                    </h2>
                  </div>
                  <TaskList
                                            tasks={group.tasks}
                      renderRow={renderTask}
                    />
                  <QuickAdd
                    folderName={group.name}
                    onAdd={(title) => onAdd(group.name, title)}
                    onOpenFullForm={() => onOpenFullForm(group.name)}
                  />
                </section>
                )
              })}
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
                ? "You can restore it from Tasks later."
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
