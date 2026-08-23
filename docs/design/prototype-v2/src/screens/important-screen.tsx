import { useState } from "react"

import { Star } from "@/lib/icons"
import { PageHead, pageBodyClass } from "@/components/page-head"
import { CompletedSection } from "@/components/task-section"
import { pageQuestion } from "@/lib/nav-model"
import { InlineError, SkeletonList } from "@/components/state-patterns"
import { TaskList, TaskRow, type TaskOpenMode, type TaskRowProps } from "@/components/task-row"
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
  /* Finished work, closing the page collapsed — Imran, 2026-08-22: every
     page that lists tasks ends in one, so the grammar is the same wherever
     you are. */
  completed?: (TaskRowProps & { id: string })[]
  previewState?: string | null
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRestore: (taskId: string) => void
  onAbandon: (taskId: string) => void
  onDelete: (taskId: string) => void
}

export function ImportantScreen({
  tasks,
  completed = [],
  previewState,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onRestore,
  onAbandon,
  onDelete,
}: ImportantScreenProps) {
  const [pendingAction, setPendingAction] = useState<{
    type: "abandon" | "delete"
    taskId: string
  } | null>(null)
  const isEmpty = previewState === "empty" || tasks.length === 0

  return (
    <div className={pageBodyClass()}>
      <PageHead
        storageName="Important"
        icon={Star}
        title="Important"
        description={pageQuestion("Important")}
      />

      <div className="mt-3">
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
            onTaskOpen={onOpenTask}
            tasks={tasks}
            renderRow={(task, wiring) => (
              <TaskRow
                key={task.id}
                {...task}
                {...wiring}
                /* Every row here is starred, so the star says nothing and
                   drops its fill — R2, and the general rule is on
                   TaskRowProps.given. */
                given={{ important: true }}
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
            )}
          />
        )}

        {/* Every page that lists tasks ends the same way (Imran,
            2026-08-22): finished work, collapsed, in the grammar a folder's
            Completed section and My Day's recap already use. */}
        <div className="mt-6">
          <CompletedSection count={completed.length}>
            <TaskList onTaskOpen={onOpenTask} className="mt-0.5" tasks={completed} />
          </CompletedSection>
        </div>
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
