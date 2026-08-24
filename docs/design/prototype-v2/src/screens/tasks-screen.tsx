
import { ListTodo } from "@/lib/icons"
import { folderMarkFor } from "@/components/folder-mark"
import { PageHead, pageBodyClass } from "@/components/page-head"
import { pageQuestion } from "@/lib/nav-model"
import { TaskSection } from "@/components/task-section"
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
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
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
        onOpen={(mode) => onOpenTask(task.id, mode)}
        onToggleComplete={(completed) =>
          task.status === "abandoned"
            ? onRestore(task.id)
            : onToggleComplete(task.id, completed)
        }
        onToggleImportant={() => onToggleImportant(task.id)}
        onAbandon={() => onAbandon(task.id)}
        onDelete={() => onDelete(task.id)}
      />
    )
  }

  return (
    <div className={pageBodyClass()}>
      <PageHead
        storageName="Tasks"
        icon={ListTodo}
        title="Tasks"
        description={pageQuestion("Tasks") ?? "Undated tasks"}
      />

      <div className="mt-3">
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
                    onTaskOpen={onOpenTask}
                    tasks={inbox}
                    renderRow={renderTask}
                  />
                <QuickAdd
                  folderName="Desk"
                  onAdd={(title) => onAdd("Desk", title)}
                  onOpenFullForm={() => onOpenFullForm("Desk")}
                />
              </section>
            ) : null}

            {groups
              .filter((group) => group.tasks.length > 0)
              .map((group) => {
                const headingId = `tasks-${group.name.toLowerCase().replaceAll(" ", "-")}`
                return (
                <TaskSection
                  key={group.name}
                  id={headingId}
                  name={group.name}
                  icon={folderMarkFor(group.name)}
                  iconColor={group.color}
                  count={group.tasks.length}
                >
                  <TaskList
                                            onTaskOpen={onOpenTask}
                                            tasks={group.tasks}
                      renderRow={renderTask}
                    />
                  <QuickAdd
                    folderName={group.name}
                    onAdd={(title) => onAdd(group.name, title)}
                    onOpenFullForm={() => onOpenFullForm(group.name)}
                  />
                </TaskSection>
                )
              })}
          </div>
        )}
      </div>

    </div>
  )
}
