/*
What a place-page becomes when you group it by something other than its own
spine.

F5, 2026-08-22, for DES-153's "group by — folder, person, date — which does
not exist at all today and which every page in DES-152 needs".

**Why one screen rather than a grouping added to seven.** Every place-page
arranges itself by the one question it exists to answer: Today by its three
normative headings (spec 9.1, to the letter), Scheduled by its time ladder,
Assignments by person, All by planned-then-folders. Teaching each of them to
*also* group by folder would mean seven implementations of one idea, and on a
page that already groups it would mean headings inside headings — folders
inside a folder, people inside a person.

So grouping does not decorate a page's arrangement; it **replaces** it. Ask
Today to group by folder and you get exactly that: today's tasks, in folders.
The page keeps its head, its cover, its bar and its filters, because those
belong to the place; what changes is the one thing you asked to change. That
is also what DES-153 means by "a page is a view" — the spine is the default
arrangement, not a fixed property of the page, and this screen is what a view
looks like when its arrangement is overridden.

Returning to `Nothing` gives the page back, unchanged, because nothing about
it was ever edited.
*/

import { Face } from "@/components/person-face"
import { FolderMark } from "@/components/folder-mark"
import type { ReactNode } from "react"

import { CalendarDays, UserRound, type LucideIcon } from "@/lib/icons"
import { PageHead, pageBodyClass } from "@/components/page-head"
import { CompletedSection, TaskSection } from "@/components/task-section"
import { InlineError, SkeletonList } from "@/components/state-patterns"
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
import {
  BoardAddColumn,
  BoardQuickAdd,
  TaskBoard,
  type BoardColumn,
} from "@/components/task-board"
import { groupTasks, UNASSIGNED, type FilterableTask, type TaskFilters } from "@/components/task-filters"
import { PEOPLE, firstName } from "@/lib/task-model"

export type GroupedTask = FilterableTask & { id: string }

/*
The sections themselves, with no page around them — so the folder page can
put them where its own list goes without also inheriting a second head.

One component for both, because "grouped by folder" has to look identical
whether you asked for it on Today or inside Travel. Two implementations of
that would be the thing DES-154 was written about.
*/
export function GroupedList({
  filters,
  tasks,
  idPrefix = "grouped",
  shape = "list",
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onMoveToGroup,
  onAddInGroup,
  onAddColumn,
  pageGiven,
}: {
  filters: TaskFilters
  tasks: GroupedTask[]
  idPrefix?: string
  /* What the *page* has said, as opposed to what the grouping has — see the
     note where the two are merged. */
  pageGiven?: TaskRowProps["given"]
  /*
  Stacked or side by side — and nothing else changes.

  DES-177: a view is a shape, not a question. The grouping is already decided
  by the time this renders, so a board is these same sections drawn as
  columns. That is why there is no second screen for it and no second way of
  deciding what the groups are.
  */
  shape?: "list" | "board"
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  /* A card dropped in another column. On a derived grouping the column *is*
     the value, so landing there means taking it: another folder, another
     person, another day. Returns true if the page took it. */
  onMoveToGroup?: (taskId: string, groupKey: string) => boolean
  /* Capture inside a column, with that column's value already set — the
     column says where the task lands, which is what W5 asks a capture point
     to do (DES-133). Absent for a column whose value cannot be typed into:
     Overdue is a relation to today, not a value. */
  onAddInGroup?: (groupKey: string, title: string) => void
  /* A new column, when a column is a thing a person makes. Grouped by folder
     that is a folder; grouped by person or by date it is nothing, and the
     control is absent rather than refused (DES-177). */
  onAddColumn?: () => void
}) {
  const sections = groupTasks(tasks, filters)

  /*
  Ungrouped is a shape this renders too, not a different screen.

  `groupTasks` answers null when nothing is being grouped by, and the first
  version treated that as "no sections" and drew an empty page. But a view
  with no grouping is just a list — which is what Abandoned and Anytime are
  (DES-170), and what any page is the moment somebody sets Group by back to
  Nothing. One screen renders a view of tasks; whether it has headings is a
  property of the view, not a reason for a second screen.
  */

  /*
  What the reader already knows, from two sources at once.

  The **grouping** says one thing — a folder heading names the folder, a person
  heading names the person — and the **page** says another: Important is
  defined by the star whatever it is grouped by, and Done by being finished.
  They merge, because a person standing on Important grouped by folder is told
  both, and a row that honoured only one of them would still be repeating the
  other.

  This is also where the fault was: the page's half reached the six bespoke
  screens and stopped at the moment somebody grouped one of them, because
  grouping swaps the screen (DES-156) and the new one knew nothing.
  */
  const given = {
    ...pageGiven,
    ...(filters.groupBy === "folder"
      ? { folder: true }
      : filters.groupBy === "person"
        ? { assignee: true }
        : filters.groupBy === "date"
          ? { due: true }
          : {}),
  }

  function renderTask(task: GroupedTask, wiring?: TaskListWiring) {
    return (
      <TaskRow
        key={task.id}
        {...task}
        {...wiring}
        given={given}
        onOpen={(mode) => onOpenTask(task.id, mode)}
        onToggleComplete={(done) => onToggleComplete(task.id, done)}
        onToggleImportant={() => onToggleImportant(task.id)}
      />
    )
  }

  /* The mark a group wears says what kind of group it is, and it comes from
     the same places every other surface takes it: a folder's chosen glyph,
     a person's face, and a calendar for a date — which is the one of the
     three that has no likeness of its own. */
  function markFor(section: { key: string; label: string }): {
    avatar?: ReactNode
    icon?: LucideIcon
  } {
    if (filters.groupBy === "folder") {
      return {
        avatar: <FolderMark name={section.key} className="size-4 shrink-0" />,
      }
    }
    if (filters.groupBy === "person") {
      const person = PEOPLE.find(
        (candidate) => firstName(candidate.name) === firstName(section.key),
      )
      return person
        ? {
            avatar: (
              <Face
                person={person}
                className="size-5 shrink-0 data-[size=sm]:size-5"
              />
            ),
          }
        : { icon: UserRound }
    }
    return { icon: CalendarDays }
  }


  if (!sections) {
    return (
      <TaskList
        onTaskOpen={onOpenTask}
        tasks={tasks}
        renderRow={renderTask}
      />
    )
  }

  if (shape === "board") {
    const columns: BoardColumn[] = sections.map((section) => ({
      key: section.key,
      label: section.label,
      tasks: section.tasks,
      mark: markFor(section).avatar,
      /* The group nobody made — Unassigned, No due date — in the quieter
         tone the headings already give it. */
      quiet: section.key === UNASSIGNED || section.key === "none",
    }))
    return (
      <TaskBoard
        columns={columns}
        onOpenTask={onOpenTask}
        onToggleComplete={onToggleComplete}
        onToggleImportant={onToggleImportant}
        onDropIn={(taskId, groupKey) =>
          onMoveToGroup ? onMoveToGroup(taskId, groupKey) : false
        }
        given={given}
        quickAdd={
          onAddInGroup
            ? (column) =>
                column.key === "overdue" ? null : (
                  <BoardQuickAdd
                    onAdd={(title) => onAddInGroup(column.key, title)}
                  />
                )
            : undefined
        }
        footer={
          onAddColumn ? (
            <BoardAddColumn label="New folder" onClick={onAddColumn} />
          ) : null
        }
      />
    )
  }

  return (
    <div className="space-y-7">
      {sections.map((section) => (
        <TaskSection
          key={section.key}
          id={`${idPrefix}-${section.key.toLowerCase().replaceAll(" ", "-")}`}
          name={section.label}
          count={section.tasks.length}
          {...markFor(section)}
        >
          <TaskList
            onTaskOpen={onOpenTask}
            tasks={section.tasks}
            renderRow={renderTask}
          />
        </TaskSection>
      ))}
    </div>
  )
}

export function GroupedScreen({
  storageName,
  icon: Icon,
  title,
  description,
  filters,
  tasks,
  completed = [],
  previewState,
  shape = "list",
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onMoveToGroup,
  onAddInGroup,
  onAddColumn,
  pageGiven,
}: {
  storageName: string
  icon: LucideIcon
  title: string
  description?: string
  filters: TaskFilters
  tasks: GroupedTask[]
  completed?: (TaskRowProps & { id: string })[]
  previewState?: string | null
  shape?: "list" | "board"
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onMoveToGroup?: (taskId: string, groupKey: string) => boolean
  onAddInGroup?: (groupKey: string, title: string) => void
  onAddColumn?: () => void
  pageGiven?: TaskRowProps["given"]
}) {
  const isEmpty = previewState === "empty" || tasks.length === 0

  return (
    <div className={pageBodyClass()}>
      <PageHead
        storageName={storageName}
        icon={Icon}
        title={title}
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
              <Icon className="size-9" strokeWidth={1.6} aria-hidden="true" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyDescription className="max-w-[52ch] text-sm leading-5 text-muted-foreground">
                Nothing matches these filters.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <GroupedList
            filters={filters}
            tasks={tasks}
            shape={shape}
            onOpenTask={onOpenTask}
            onToggleComplete={onToggleComplete}
            onToggleImportant={onToggleImportant}
            onMoveToGroup={onMoveToGroup}
            onAddInGroup={onAddInGroup}
            onAddColumn={onAddColumn}
            pageGiven={pageGiven}
          />
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
