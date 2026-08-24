
import { CalendarDays, Layers3, ListTodo } from "@/lib/icons"
import { FolderMark } from "@/components/folder-mark"
import { PageHead, pageBodyClass } from "@/components/page-head"
import { pageQuestion } from "@/lib/nav-model"
import { CompletedSection, TaskSection } from "@/components/task-section"
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
  /* Finished work, when this page is carrying it (DES-152). Empty under the
     v1 model, where All is 9.5's open-only page. */
  completed?: AllTask[]
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
  completed = [],
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
  const hasTasks =
    planned.length > 0 ||
    inbox.length > 0 ||
    completed.length > 0 ||
    groups.some((group) => group.tasks.length > 0)

  /* The screen keeps its own row, because its completion is conditional —
     an abandoned task restores rather than completes — and hands the list
     wiring straight through. See TaskList's renderRow. */
  /* A row under a folder's own heading does not repeat it. Passed per list
     rather than per row, and the undated block is the only one grouped that
     way — Planned above it is grouped by date, where the folder is exactly
     what a row still has to say. */
  function renderTask(
    task: AllTask,
    wiring?: TaskListWiring,
    given?: TaskRowProps["given"],
  ) {
    return (
      <TaskRow
        key={task.id}
        {...task}
        {...wiring}
        given={given}
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
    )
  }

  return (
    <div className={pageBodyClass()}>
      <PageHead
        storageName="All"
        icon={Layers3}
        title="All"
        description={pageQuestion("All")}
      />

      <div className="mt-3">
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
              <TaskSection id="all-planned-heading" name="Planned" icon={CalendarDays} count={planned.length}>
                <TaskList
                    className=""
                    onTaskOpen={onOpenTask}
                    tasks={planned}
                    renderRow={renderTask}
                  />
                <QuickAdd
                  folderName="Desk"
                  label="Add scheduled task"
                  onAdd={onAddPlanned}
                  onOpenFullForm={onOpenPlannedForm}
                />
              </TaskSection>
            ) : null}

            {inbox.length > 0 || groups.some((group) => group.tasks.length > 0) ? (
              <TaskSection id="all-tasks-heading" name="Tasks" icon={ListTodo}>

                <div className="space-y-7">
                  {inbox.length > 0 ? (
                    <div aria-label="Inbox tasks">
                      <TaskList
                                                    onTaskOpen={onOpenTask}
                                                    tasks={inbox}
                          renderRow={renderTask}
                        />
                      <QuickAdd
                        folderName="Desk"
                        onAdd={(title) => onAddUndated("Desk", title)}
                        onOpenFullForm={() => onOpenUndatedForm("Desk")}
                      />
                    </div>
                  ) : null}

                  {groups
                    .filter((group) => group.tasks.length > 0)
                    .map((group) => (
                      <div key={group.name}>
                        <div className="mb-1 flex h-7 items-center gap-2 px-2">
                          <FolderMark
                            name={group.name}
                            color={group.color}
                            className="size-4 shrink-0"
                          />
                          {/* A third level, and correctly so: on All a folder
                              sits inside "Tasks" rather than beside it. It
                              takes the scale's next step down (14, DES-148)
                              and no hairline, so it reads as subordinate to
                              the band above it rather than competing with it.
                              13px was on no scale at all. */}
                          <h3 className="truncate text-sm leading-5 font-semibold text-[var(--color-graphite-700)]">
                            {group.name}
                          </h3>
                        </div>
                        <TaskList
                          onTaskOpen={onOpenTask}
                          tasks={group.tasks}
                          renderRow={(task, wiring) =>
                            renderTask(task, wiring, { folder: true })
                          }
                        />
                        <QuickAdd
                          folderName={group.name}
                          onAdd={(title) => onAddUndated(group.name, title)}
                          onOpenFullForm={() => onOpenUndatedForm(group.name)}
                        />
                      </div>
                    ))}
                </div>
              </TaskSection>
            ) : null}

            {/* Finished work closes the page, collapsed — the grammar a
                folder's Completed section and My Day's recap already use
                (Q7, DES-142), so the three read as one idea rather than
                three inventions. Collapsed because All is a working page
                first and a history second. */}
            <CompletedSection count={completed.length}>
              <TaskList onTaskOpen={onOpenTask} className="mt-0.5" tasks={completed} renderRow={renderTask} />
            </CompletedSection>
          </div>
        )}
      </div>

    </div>
  )
}
