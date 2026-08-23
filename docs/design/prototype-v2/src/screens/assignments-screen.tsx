/*
Assignments: who is carrying what.

DES-152's Who axis, and the one page in the new model that did not exist
before. Imran's objection to calling it People is exact — that word "conveys a
message of community and connections, not assignations", and the footer's
People screen already owns that meaning — so this is Assignments, the plain
noun for what is on the page and nobody's coinage. Microsoft's "Assigned to
me" is left where it is.

**It defaults to everyone, grouped by person, the viewer first**, rather than
to the viewer's own list. Three reasons, and the third is the one that
matters: the value of a shared to-do app is seeing the whole household's load
at a glance; the viewer's own tasks are still at the top where a personal list
would have put them; and it stops being Microsoft's feature rather than merely
being renamed. Narrowing to one person is the scope control, one press.

**Unassigned is a stop on that control, not a leftover.** In a multi-member
folder an unassigned task is nobody's, which is a real state worth being able
to look at — spec Q3 already gives it its own row chip.

The "from [A] to [B]" framing Imran drew is honest only halfway: Dana records
who *created* a task and not who *assigned* it, so after a reassignment the
"from" half is the creator rather than the assigner. So the assignee is this
page's spine and creator belongs in the filter (DES-153). A true assigner
field is a backend change worth making only if people ask "who gave me this?".
*/

import { useState } from "react"

import { UserRound, UserRoundCheck, UsersRound } from "@/lib/icons"
import { Face } from "@/components/person-face"
import { PageHead, pageBodyClass } from "@/components/page-head"
import { CompletedSection } from "@/components/task-section"
import { pageQuestion } from "@/lib/nav-model"
import { TaskSection } from "@/components/task-section"
import { InlineError, SkeletonList } from "@/components/state-patterns"
import { ViewStrip } from "@/components/view-strip"
import { WindowBarActions } from "@/components/window-bar"
import {
  TaskList,
  TaskRow,
  type TaskListWiring,
  type TaskOpenMode,
  type TaskRowProps,
} from "@/components/task-row"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import { PEOPLE, firstName } from "@/lib/task-model"

/*
`assigneeName` is carried separately and deliberately. A row's `assignee` prop
is a *display* field, and spec Q2/Q3 suppress it when the assignee is the
viewer — the chip exists to say "this one is somebody else's". Grouping on it
would therefore file every one of the viewer's own tasks under Unassigned,
which is exactly what the first drawing of this page did. The name comes from
the task itself instead, and the chip goes on rendering by its own rule.
*/
export type AssignmentTask = TaskRowProps & {
  id: string
  assigneeName?: string
}

/* The scope: everyone, one named person, or nobody. `PEOPLE[0]` is the
   viewer, which is why "Everyone" puts their group first rather than sorting
   the roster alphabetically. */
type AssignmentScope = "everyone" | "unassigned" | string

/* People are matched on the first name — `firstName` in `lib/task-model`,
   which carries the reason. It moved there at F5, when the filter and the
   grouped screen each needed the same accommodation and each had written it
   out again. */
export function AssignmentsScreen({
  tasks,
  completed = [],
  previewState,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
}: {
  tasks: AssignmentTask[]
  /* Finished work, closing the page collapsed — Imran, 2026-08-22: every
     page that lists tasks ends in one, so the grammar is the same wherever
     you are. */
  completed?: (TaskRowProps & { id: string })[]
  previewState?: string | null
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
}) {
  const [scope, setScope] = useState<AssignmentScope>("everyone")
  const viewer = PEOPLE[0]!

  /* Groups in one fixed order: the viewer, then the rest of the roster in
     roster order, then the unassigned. A person with nothing carries no
     group — an empty heading is a question nobody asked. */
  const groups = [
    { key: viewer.name, label: "Assigned to me", person: viewer },
    ...PEOPLE.slice(1).map((person) => ({
      key: person.name,
      label: person.name,
      person,
    })),
  ]
    .map((group) => ({
      ...group,
      rows: tasks.filter(
        (task) => firstName(task.assigneeName) === firstName(group.key),
      ),
    }))
    .concat([
      {
        key: "unassigned",
        label: "Unassigned",
        person: undefined as unknown as (typeof PEOPLE)[number],
        rows: tasks.filter((task) => !task.assigneeName),
      },
    ])
    .filter((group) => group.rows.length > 0)
    .filter((group) => scope === "everyone" || group.key === scope)

  const isEmpty = previewState === "empty" || groups.length === 0

  /* Grouped by person, so a face on every row repeats the heading above
     it — the same suppression the folder heading gets on All. */
  function renderTask(task: AssignmentTask, wiring?: TaskListWiring) {
    return (
      <TaskRow
        given={{ assignee: true }}
        key={task.id}
        {...task}
        {...wiring}
        onOpen={(mode) => onOpenTask(task.id, mode)}
        onToggleComplete={(completed) => onToggleComplete(task.id, completed)}
        onToggleImportant={() => onToggleImportant(task.id)}
      />
    )
  }

  return (
    <div className={pageBodyClass()}>
      {/* The spine, promoted out of the filter panel onto the bar: a page's
          axis is a control you can see, not a setting hidden one press deep
          (DES-152). Left of the shell's shared block, the folder page's own
          arrangement — the spine, then the filter, then the quiet things. */}
      <WindowBarActions order={-1}>
        <ViewStrip
          ariaLabel="Whose assignments"
          value={scope}
          options={[
            { key: "everyone", label: "Everyone", icon: UsersRound },
            ...PEOPLE.map((person, index) => ({
              key: person.name,
              label: index === 0 ? "Assigned to me" : person.name,
              icon: UserRound,
            })),
            { key: "unassigned", label: "Unassigned", icon: UserRound },
          ]}
          onSelect={setScope}
          collapse
        />
      </WindowBarActions>

      <PageHead
        storageName="Assignments"
        icon={UserRoundCheck}
        title="Assignments"
        description={pageQuestion("Assignments")}
      />

      <div className="mt-3">
        {previewState === "loading" ? (
          <SkeletonList />
        ) : previewState === "error" ? (
          <InlineError />
        ) : isEmpty ? (
          <Empty className="min-h-72">
            <EmptyMedia className="text-[var(--color-graphite-400)]">
              <UserRoundCheck className="size-9" strokeWidth={1.6} aria-hidden="true" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyDescription className="max-w-[52ch] text-sm leading-5 text-muted-foreground">
                Nothing assigned yet. Give a task to someone in a shared folder
                and it shows up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-7">
            {groups.map((group) => (
              /* The section that carries a face rather than a glyph — the
                 case Imran named when he asked for one section component
                 that can take "an icon or even a profile avatar". */
              <TaskSection
                key={group.key}
                id={`assignments-${group.key.toLowerCase().replaceAll(" ", "-")}`}
                name={group.label}
                count={group.rows.length}
                avatar={
                  group.person ? (
                    <Face
                      person={group.person}
                      className="size-5 shrink-0 data-[size=sm]:size-5"
                    />
                  ) : undefined
                }
                icon={group.person ? undefined : UserRound}
              >
                <TaskList
                  onTaskOpen={onOpenTask}
                  tasks={group.rows}
                  renderRow={renderTask}
                />
              </TaskSection>
            ))}
          </div>
        )}

        {/* The same close as every other page that lists tasks. */}
        <div className="mt-6">
          <CompletedSection count={completed.length}>
            <TaskList onTaskOpen={onOpenTask} className="mt-0.5" tasks={completed} />
          </CompletedSection>
        </div>
      </div>
    </div>
  )
}
