import { useState } from "react"
import { CheckCircle2 } from "lucide-react"

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

export type DoneTask = TaskRowProps & {
  id: string
  hasRecurrenceSuccessor?: boolean
}

export interface DoneGroup {
  label: string
  tasks: DoneTask[]
}

interface DoneScreenProps {
  groups: DoneGroup[]
  previewState?: string | null
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onMarkNotDone: (taskId: string) => void
  onToggleImportant: (taskId: string) => void
  onDelete: (taskId: string) => void
}

export function DoneScreen({
  groups,
  previewState,
  onOpenTask,
  onMarkNotDone,
  onToggleImportant,
  onDelete,
}: DoneScreenProps) {
  const [pendingAction, setPendingAction] = useState<{
    type: "uncomplete-series" | "delete"
    taskId: string
  } | null>(null)
  const hasTasks = groups.some((group) => group.tasks.length > 0)

  return (
    <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
      <header className="flex min-h-12 items-start gap-3">
        <CheckCircle2
          className="mt-0.5 size-6 shrink-0 text-[var(--color-graphite-700)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
            Done
          </h1>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            Completion history
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
              <CheckCircle2 className="size-9" strokeWidth={1.6} aria-hidden="true" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyDescription className="max-w-[52ch] text-sm leading-5 text-muted-foreground">
                Nothing completed yet. Finished tasks build your history here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-7">
            {groups.map((group) => (
              <section key={group.label} aria-labelledby={`done-${group.label.toLowerCase().replaceAll(" ", "-")}`}>
                <h2
                  id={`done-${group.label.toLowerCase().replaceAll(" ", "-")}`}
                  className="mb-1 px-2 text-[13px] leading-6 font-semibold text-[var(--color-graphite-700)]"
                >
                  {group.label}
                </h2>
                <TaskList
                  className=""
                  tasks={group.tasks}
                  renderRow={(task, wiring) => (
                    <TaskRow
                      key={task.id}
                      {...task}
                      {...wiring}
                      status="completed"
                      onOpen={(mode) => onOpenTask(task.id, mode)}
                      onToggleComplete={(completed) => {
                        if (completed) return
                        if (task.hasRecurrenceSuccessor) {
                          setPendingAction({
                            type: "uncomplete-series",
                            taskId: task.id,
                          })
                        } else {
                          onMarkNotDone(task.id)
                        }
                      }}
                      onToggleImportant={() => onToggleImportant(task.id)}
                      onDelete={() =>
                        setPendingAction({ type: "delete", taskId: task.id })
                      }
                    />
                  )}
                />
              </section>
            ))}
            {previewState === "loading-more" ? (
              <div className="pt-1" aria-label="Loading more completed tasks">
                <SkeletonList />
              </div>
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
              {pendingAction?.type === "uncomplete-series"
                ? "Mark this repeating task as not done?"
                : "Delete this task?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "uncomplete-series"
                ? "This removes the next scheduled occurrence (including any edits to it). Continue?"
                : "This can’t be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive={pendingAction?.type === "delete"}
              onClick={() => {
                if (!pendingAction) return
                if (pendingAction.type === "uncomplete-series") {
                  onMarkNotDone(pendingAction.taskId)
                } else {
                  onDelete(pendingAction.taskId)
                }
                setPendingAction(null)
              }}
            >
              {pendingAction?.type === "uncomplete-series" ? "Continue" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
