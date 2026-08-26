
import { Star } from "@/lib/icons"
import { PageHead, pageBodyClass } from "@/components/page-head"
import { CompletedSection } from "@/components/task-section"
import { pageQuestion } from "@/lib/nav-model"
import { InlineError, SkeletonList } from "@/components/state-patterns"
import { TaskList, TaskRow, type TaskOpenMode, type TaskRowProps } from "@/components/task-row"
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
                  onAbandon(task.id)
                }
                onDelete={() =>
                  onDelete(task.id)
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

    </div>
  )
}
