import { useState } from "react"
import { CalendarCheck2, ChevronRight, Star, SunMedium } from "lucide-react"

import { InlineError, SkeletonList } from "@/components/state-patterns"
import { TaskRow, type TaskRowProps } from "@/components/task-row"
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import { Switch } from "@/components/ui/switch"

export type MyDayTask = TaskRowProps & { id: string }

interface MyDayScreenProps {
  carriedOver: MyDayTask[]
  today: MyDayTask[]
  doneToday: MyDayTask[]
  previewState?: string | null
  onOpenTask: (taskId: string) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRemoveFromMyDay: (taskId: string) => void
  onAbandon: (taskId: string) => void
  onDelete: (taskId: string) => void
}

function TaskGroup({
  title,
  tasks,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onRemoveFromMyDay,
  onRequestAbandon,
  onRequestDelete,
}: {
  title: string
  tasks: MyDayTask[]
  onOpenTask: (taskId: string) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRemoveFromMyDay: (taskId: string) => void
  onRequestAbandon: (taskId: string) => void
  onRequestDelete: (taskId: string) => void
}) {
  if (tasks.length === 0) return null
  const headingId = `my-day-${title.toLowerCase().replaceAll(" ", "-")}`

  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="mb-1 px-2 text-[13px] leading-6 font-semibold text-[var(--color-graphite-700)]"
      >
        {title}
      </h2>
      <div role="list" className="space-y-0.5">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            {...task}
            onOpen={() => onOpenTask(task.id)}
            onToggleComplete={(completed) =>
              onToggleComplete(task.id, completed)
            }
            onToggleImportant={() => onToggleImportant(task.id)}
            onRemoveFromMyDay={() => onRemoveFromMyDay(task.id)}
            onAbandon={() => onRequestAbandon(task.id)}
            onDelete={() => onRequestDelete(task.id)}
          />
        ))}
      </div>
    </section>
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
}: MyDayScreenProps) {
  const [importantOnly, setImportantOnly] = useState(previewState === "important")
  const [doneOpen, setDoneOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<{
    type: "abandon" | "delete"
    taskId: string
  } | null>(null)
  const filterTasks = (tasks: MyDayTask[]) =>
    importantOnly ? tasks.filter((task) => task.important) : tasks
  const visibleCarried = filterTasks(carriedOver)
  const visibleToday = filterTasks(today)
  const visibleDone = filterTasks(doneToday)
  const isEmpty =
    previewState === "empty" ||
    (visibleCarried.length === 0 && visibleToday.length === 0)

  return (
    <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
      <header className="flex min-h-12 items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-3">
          <SunMedium
            className="mt-0.5 size-6 shrink-0 text-[var(--color-graphite-700)]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
              My Day
            </h1>
            <p className="mt-1 text-xs leading-4 text-muted-foreground">
              Monday, 10 August
            </p>
          </div>
        </div>

        <label className="flex h-[var(--control-height)] shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)]">
          <Star className="size-4" strokeWidth={1.75} aria-hidden="true" />
          <span>Important only</span>
          <Switch
            checked={importantOnly}
            onCheckedChange={setImportantOnly}
          />
        </label>
      </header>

      <div className="mt-7">
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

            {visibleDone.length > 0 ? (
              <Collapsible open={doneOpen} onOpenChange={setDoneOpen}>
                <CollapsibleTrigger className="group/done flex h-[var(--control-height)] w-full items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-800)] focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none">
                  <ChevronRight
                    className="size-4 transition-transform group-data-panel-open/done:rotate-90"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  Done today ({visibleDone.length})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div role="list" className="mt-0.5 space-y-0.5">
                    {visibleDone.map((task) => (
                      <TaskRow
                        key={task.id}
                        {...task}
                        status="completed"
                        onOpen={() => onOpenTask(task.id)}
                        onToggleComplete={(completed) =>
                          onToggleComplete(task.id, completed)
                        }
                        onToggleImportant={() => onToggleImportant(task.id)}
                        onAbandon={() =>
                          setPendingAction({ type: "abandon", taskId: task.id })
                        }
                        onDelete={() =>
                          setPendingAction({ type: "delete", taskId: task.id })
                        }
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
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
