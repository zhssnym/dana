import { useState } from "react"
import { Star } from "@/lib/icons"

import { QuickAdd } from "@/components/quick-add"
import { InlineError, SkeletonList } from "@/components/state-patterns"
import { TaskList, TaskRow, type TaskRowProps } from "@/components/task-row"
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

export type ImportantTask = TaskRowProps & {
  id: string
  importantTooltip: string
}

interface ImportantScreenProps {
  tasks: ImportantTask[]
  previewState?: string | null
  onOpenTask: (taskId: string) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRestore: (taskId: string) => void
  onAbandon: (taskId: string) => void
  onDelete: (taskId: string) => void
  onAdd?: (title: string) => void
  onOpenFullForm?: () => void
}

export function ImportantScreen({
  tasks,
  previewState,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onRestore,
  onAbandon,
  onDelete,
  onAdd,
  onOpenFullForm,
}: ImportantScreenProps) {
  const [pendingAction, setPendingAction] = useState<{
    type: "abandon" | "delete"
    taskId: string
  } | null>(null)
  const isEmpty = previewState === "empty" || tasks.length === 0

  return (
    <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
      <header className="flex min-h-12 items-start gap-3">
        <Star
          className="mt-0.5 size-6 shrink-0 text-[var(--color-graphite-700)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
            Important
          </h1>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            Starred tasks
          </p>
        </div>
      </header>

      <div className="mt-7">
        {previewState === "loading" ? (
          <SkeletonList />
        ) : previewState === "error" ? (
          <InlineError />
        ) : isEmpty ? (
          <Empty className="min-h-72">
            <EmptyMedia className="text-[var(--color-graphite-400)]">
              <Star className="size-9" strokeWidth={1.6} aria-hidden="true" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyDescription className="max-w-[52ch] text-sm leading-5 text-muted-foreground">
                Nothing marked important. Star any task and it shows up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <TaskList
            className=""
            tasks={tasks}
            renderRow={(task, wiring) => (
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
                onAbandon={() =>
                  setPendingAction({ type: "abandon", taskId: task.id })
                }
                onDelete={() =>
                  setPendingAction({ type: "delete", taskId: task.id })
                }
              />
            )}
          />
        )}
        {/* Capture on the page's own terms: a task typed here is born
            starred, which is what Important means. Fills the gap DES-133
            opened when the floating button retired (shell sweep). */}
        {!isEmpty && onAdd && onOpenFullForm ? (
          <QuickAdd
            folderName="Important"
            label="Add important task"
            onAdd={onAdd}
            onOpenFullForm={onOpenFullForm}
          />
        ) : null}
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
