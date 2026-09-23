/*
The Important screen, presentational: it takes rows and callbacks and touches
nothing else, and `pages/ImportantPage.tsx` is the wiring beside it.

What is worth knowing:

- **`PLACES.important`** (`lib/nav-model.ts`) is one table carrying each place's
  key, name and question, so the three strings the head draws come from the same
  row rather than from three literals.
- **`storageName` is 4.20's place key rather than the page's display name.**
  `user_page_covers` is keyed by `place`, and the two must be one string or a
  cover would move when a page was renamed.
- **The description uses the shared identity seam.** It starts with Dana's
  friendly sentence, saves a person's edit through 7.21, and returns to the
  default when cleared.
- **The page-body wrapper is the shell's.** `app-shell.tsx` holds the measure
  for every page, because thirteen pages each choosing a width is thirteen
  chances to disagree. `pageBodyClass` stays exported.
- **The completed foot is left empty here and drawn by the page.**
  `CompletedSection` renders nothing when its count is zero, which is its own
  rule; Q6 is keyset-paginated and this client reads it only while the section
  is open, so filling this prop would mean fetching every page of everything the
  viewer has ever finished in order to draw a collapsed heading.
  `components/page/CompletedFoot.tsx` draws the same section with the read the
  client already has.
- **The failed-read line gets a retry.** 9.1 gives that line a "Try again"
  control, and a control with no handler is a dead one, so the page supplies the
  query's own refetch. The page also keeps section 6's cap notice above this
  screen.

The empty copy is byte-identical to Q4's, which `pages/empty-states.ts` also
carries as `IMPORTANT_EMPTY`.
*/

import { Star } from "../lib/icons.js"
import { PageHead } from "../components/page-head.js"
import { CompletedSection } from "../components/task-section.js"
import { PLACES } from "../views/place-pages.js"
import { InlineError, SkeletonList } from "../components/state-patterns.js"
import { TaskList, TaskRow, type TaskOpenMode, type TaskRowProps } from "../components/task-row.js"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "../components/ui/empty.js"

export type ImportantTask = TaskRowProps & {
  id: string
  importantTooltip: string
}

interface ImportantScreenProps {
  tasks: ImportantTask[]
  /* Finished work, closing the page collapsed: every page that lists tasks ends
     in one, so the grammar is the same wherever you are. */
  completed?: (TaskRowProps & { id: string })[]
  previewState?: string | null
  /** Seam 7: what 9.1's "Try again" does. See the InlineError below. */
  onRetry?: () => void
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
  onRetry,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onRestore,
  onAbandon,
  onDelete,
}: ImportantScreenProps) {
  const isEmpty = previewState === "empty" || tasks.length === 0

  return (
    <div>
      <PageHead
        storageName={PLACES.important.key}
        icon={Star}
        title={PLACES.important.name}
        description={PLACES.important.question}
      />

      <div className="mt-3">
        {previewState === "loading" ? (
          <SkeletonList />
        ) : previewState === "error" ? (
          /* 9.1 gives the inline failed-read line a "Try again" control, and a
             control with no handler is a dead one. */
          <InlineError onRetry={onRetry} />
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
                /* Every row here is starred, so the star says nothing and drops
                   its fill; the general rule is on TaskRowProps.given. */
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

        {/* Every page that lists tasks ends the same way: finished work,
            collapsed, in the grammar a folder's Completed section and My Day's
            recap already use. */}
        <div className="mt-6">
          <CompletedSection count={completed.length}>
            <TaskList onTaskOpen={onOpenTask} className="mt-0.5" tasks={completed} />
          </CompletedSection>
        </div>
      </div>

    </div>
  )
}
