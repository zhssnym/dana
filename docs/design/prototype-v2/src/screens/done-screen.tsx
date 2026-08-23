import { useState } from "react"

import { CheckCircle2 } from "@/lib/icons"
import { PageHead, pageBodyClass } from "@/components/page-head"
import { pageQuestion } from "@/lib/nav-model"
import { TaskSection } from "@/components/task-section"
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
    <div className={pageBodyClass()}>
      <PageHead
        storageName="Done"
        icon={CheckCircle2}
        title="Done"
        description={pageQuestion("Done")}
      />

      <div className="mt-3">
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
              <TaskSection
                key={group.label}
                id={`done-${group.label.toLowerCase().replaceAll(" ", "-")}`}
                name={group.label}
                count={group.tasks.length}
              >
                <TaskList
                  className=""
                  onTaskOpen={onOpenTask}
                  tasks={group.tasks}
                  renderRow={(task, wiring) => (
                    <TaskRow
                      key={task.id}
                      {...task}
                      {...wiring}
                      /* The due date goes: this page groups by when work was
                         finished, and a spent deadline beside that is two
                         dates where the louder one no longer matters (R7). */
                      given={{ due: true }}
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
              </TaskSection>
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
