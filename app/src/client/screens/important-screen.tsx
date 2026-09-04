/*
`docs/design/prototype-v2/src/screens/important-screen.tsx`, lifted whole.
That prototype is deleted (`a7886df`, 2026-09-01); read it in git history
before that commit.

**This is the proof RFC 0005 change control item 45 asked for and item 47(l)
could not produce.** Item 45 measured that no prototype screen could run end
to end at S22 and recommended this file, "117 lines, the smallest screen that
draws tasks"; item 47(l) declined it at S23 for one reason, that it imports
`@/components/page-head`, which is the first line of this row. Every other
dependency it has, `task-row`, `task-section`, `state-patterns` and the
page's own question, was already in the tree. The head landed above, so the
screen lands here, and the acceptance it answers is item 45's own sentence: it
diffs empty against its original except at the seams named below.

**Why it is a screen and not a page.** Item 45's deeper finding is the
architecture one: "the prototype's screens are presentational and its wiring
is in its shell", which is the same architecture this client has. So this file
takes rows and callbacks and touches nothing else, exactly as the original
does, and `pages/ImportantPage.tsx` is the wiring beside it. That split is why
this crosses as nearly as it does, and it is the measurement item 48(i) asks
each of S25 to S27 to make before reading its row as owing a verbatim
anything: none of the eight screens this row names imports `@/fixtures` at
all, where `app-shell.tsx` and its two neighbours did, so the answer here
points the other way from S24's.

**The seams, and there are seven.**

1. **The `@/` specifiers become this client's relative ESM paths** (11.4), the
   mechanical seam every lifted file takes.
2. **`pageQuestion("Important")` becomes `PLACES.important`**, which is this
   client's `lib/nav-model.ts`: one table carrying each place's key, name and
   DES-152 question, so the three strings the head draws come from the same
   row rather than from three literals.
3. **`storageName` is 4.20's place key rather than the page's display name.**
   The prototype keys its browser store by the words on the screen; this
   client keys `user_page_covers` by `place`, and the two must be one string
   or a cover would move when a page was renamed.
4. **The description uses the shared identity seam.** It starts with Dana's
   friendly sentence, saves a person's edit through 7.21, and returns to the
   default when cleared.
5. **The `pageBodyClass()` wrapper is the shell's here.** `app-shell.tsx`
   holds the measure for every page, on its own recorded reason that thirteen
   pages each choosing a width is thirteen chances to disagree, and it holds
   the identical classes; the prototype's screens carry it because they have
   no shell to put it in. `pageBodyClass` stays exported for whichever row
   decides otherwise.
6. **The completed foot is left empty here and drawn by the page.**
   `CompletedSection` renders nothing when its count is zero, which is its
   own rule; Q6 is keyset-paginated and this client reads it only while the
   section is open, so filling this prop would mean fetching every page of
   everything the viewer has ever finished in order to draw a collapsed
   heading. `components/page/CompletedFoot.tsx` draws the same section with the read
   the client already had, and `pages/ImportantPage.tsx` says so too.
7. **The failed-read line gets a retry.** 9.1 gives that line a "Try again"
   control and the prototype's lab has nothing to retry, so it renders one
   with no handler, which is DES-144's dead control. The page supplies the
   query's own refetch. The page also keeps section 6's cap notice above this
   screen, the prototype having no idea a list can be truncated.

Nothing else moves. The empty copy is byte-identical to Q4's, which
`pages/empty-states.ts` also carries as `IMPORTANT_EMPTY`.
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
  /* Finished work, closing the page collapsed, Imran, 2026-08-22: every
     page that lists tasks ends in one, so the grammar is the same wherever
     you are. */
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
          /* Seam 7: 9.1 gives the inline failed-read line a "Try again"
             control, and a control with no handler is DES-144's dead one.
             The prototype's lab has nothing to retry. */
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
                /* Every row here is starred, so the star says nothing and
                   drops its fill, R2, and the general rule is on
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
