import { useState } from "react"

import { CalendarCheck2, SunMedium } from "@/lib/icons"
import { PageHead, pageBodyClass } from "@/components/page-head"
import { CompletedSection, TaskSection } from "@/components/task-section"
import { InlineError, SkeletonList } from "@/components/state-patterns"
import { TaskList, type TaskOpenMode, type TaskRowProps } from "@/components/task-row"
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

export type MyDayTask = TaskRowProps & { id: string }

interface MyDayScreenProps {
  carriedOver: MyDayTask[]
  today: MyDayTask[]
  doneToday: MyDayTask[]
  previewState?: string | null
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRemoveFromMyDay: (taskId: string) => void
  onAbandon: (taskId: string) => void
  onDelete: (taskId: string) => void
  /* DES-152 renames this page Today. The screen takes the name rather than
     reading the flag itself, because which page it is, is the shell's
     business and the screen only draws one. */
  title?: string
  description?: string
}

function TaskGroup({
  title,
  tasks,
  given,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onRemoveFromMyDay,
  onRequestAbandon,
  onRequestDelete,
}: {
  title: string
  tasks: MyDayTask[]
  /* What this heading has already said — see TaskRowProps.given. */
  given?: TaskRowProps["given"]
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRemoveFromMyDay: (taskId: string) => void
  onRequestAbandon: (taskId: string) => void
  onRequestDelete: (taskId: string) => void
}) {
  if (tasks.length === 0) return null
  const headingId = `my-day-${title.toLowerCase().replaceAll(" ", "-")}`

  return (
    /* One section component for computed and hand-made alike, so a group here
       folds exactly like a folder's own (DES-151, and Imran 2026-08-22). The
       words are 9.1's, to the letter, and untouched. */
    <TaskSection id={headingId} name={title} count={tasks.length}>
      {/* A TaskList rather than a map, because reordering, the hold that makes
          a folder and press-and-hold selection are facts about the list and
          not about any row in it. Each section is its own list, so a task
          carried inside Carried over cannot be dropped into Today — which is
          right: those groups are computed, not arranged. */}
      <TaskList
        tasks={tasks}
        given={given}
        onTaskOpen={onOpenTask}
        onTaskToggleComplete={onToggleComplete}
        onTaskToggleImportant={onToggleImportant}
        onTaskRemoveFromMyDay={onRemoveFromMyDay}
        onTaskAbandon={onRequestAbandon}
        onTaskDelete={onRequestDelete}
      />
    </TaskSection>
  )
}

export function MyDayScreen({
  carriedOver,
  today,
  doneToday,
  previewState,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onRemoveFromMyDay,
  onAbandon,
  onDelete,
  title = "My Day",
  description = "Monday, 10 August",
}: MyDayScreenProps) {
  const [pendingAction, setPendingAction] = useState<{
    type: "abandon" | "delete"
    taskId: string
  } | null>(null)
  /* The tasks arrive already filtered: importance is one of the window bar
     filter's four variables (DES-140), and this page used to keep a second
     switch of its own that the bar's copy could contradict. One variable now,
     read wherever it is shown. */
  const visibleCarried = carriedOver
  const visibleToday = today
  const visibleDone = doneToday
  const isEmpty =
    previewState === "empty" ||
    (visibleCarried.length === 0 && visibleToday.length === 0)
  const dayTotal =
    visibleCarried.length + visibleToday.length + visibleDone.length

  return (
    <div className={pageBodyClass()}>
      {/* My Day is the one place-page besides a folder with a completion, so
          it is the one that fills the fact slot; the date is its prose. */}
      <PageHead
        storageName={title}
        icon={SunMedium}
        title={title}
        fact={
          dayTotal > 0 ? `${visibleDone.length} of ${dayTotal} done` : undefined
        }
        description={description}
      />

      <div className="mt-3">
        {previewState === "loading" ? (
          <SkeletonList />
        ) : previewState === "error" ? (
          <InlineError />
        ) : isEmpty ? (
          <Empty className="min-h-72">
            <EmptyMedia className="text-[var(--color-graphite-400)]">
              <CalendarCheck2
                className="size-9"
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyDescription className="max-w-[54ch] text-sm leading-5 text-muted-foreground">
                Nothing on your day. Tasks assigned to you appear here on their due date, or pull anything in yourself.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-6">
            <TaskGroup
              title="Carried over"
              tasks={visibleCarried}
              /* Membership *is* being late, so red on every row here warns
                 nobody and quietens the rows elsewhere that mean it (R4). The
                 date keeps its words. */
              given={{ overdue: true }}
              onOpenTask={onOpenTask}
              onToggleComplete={onToggleComplete}
              onToggleImportant={onToggleImportant}
              onRemoveFromMyDay={onRemoveFromMyDay}
              onRequestAbandon={(taskId) =>
                setPendingAction({ type: "abandon", taskId })
              }
              onRequestDelete={(taskId) =>
                setPendingAction({ type: "delete", taskId })
              }
            />
            <TaskGroup
              title="Today"
              tasks={visibleToday}
              onOpenTask={onOpenTask}
              onToggleComplete={onToggleComplete}
              onToggleImportant={onToggleImportant}
              onRemoveFromMyDay={onRemoveFromMyDay}
              onRequestAbandon={(taskId) =>
                setPendingAction({ type: "abandon", taskId })
              }
              onRequestDelete={(taskId) =>
                setPendingAction({ type: "delete", taskId })
              }
            />

            {/* "Done today (N)" rather than "Completed" — 9.1 makes this
                page's three headings normative to the letter, count
                included, so this is the one place the shared component is
                given different words. */}
            <CompletedSection label="Done today" count={visibleDone.length}>
                  <TaskList
                    className="mt-0.5"
                    tasks={visibleDone.map((task) => ({
                      ...task,
                      status: "completed" as const,
                    }))}
                    onTaskOpen={onOpenTask}
                    onTaskToggleComplete={onToggleComplete}
                    onTaskToggleImportant={onToggleImportant}
                    onTaskAbandon={(taskId) =>
                      setPendingAction({ type: "abandon", taskId })
                    }
                    onTaskDelete={(taskId) =>
                      setPendingAction({ type: "delete", taskId })
                    }
                  />
            </CompletedSection>
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
                ? "It stops appearing in My Day but stays everywhere else."
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
