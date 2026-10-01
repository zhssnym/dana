/*
Grouping, which DES-156 rules replaces a page's arrangement and never nests
inside it.

"Asking a page to group by something is asking it to arrange itself that way
instead. Today grouped by folder is today's work in folders. The page keeps
its head, its cover, its bar and its filters, because those belong to the
place; the one thing you changed is the one thing that changes, and returning
Group by to Nothing gives the page back untouched, because nothing about it
was ever edited."

So this file answers one question: given rows and an axis, what are the
groups? The list view draws them as sections and the board draws them as
columns, and neither is a second grouping.

**A column's name is the folder's own name, never a member's label for it.**
DES-225 splits the two: the name is the folder's and the label is arrangement,
personal and never anybody else's business. A board grouped by folder is
showing the folder, so it says what the folder is called; the label belongs to
the sidebar, where a person arranges their own library. AC-221 reads the
column by the folder's name for that reason.

**Ordering inside a group is the server's, untouched.** Rows are walked once
and appended, so section 6's order survives inside every column, which is that
section's own rule about clients never re-sorting.
*/
import type { TaskCard } from '../../shared/tasks.js'
import { DELETED_USER } from '../parts/presenters.js'
import { UNASSIGNED } from './filter.js'
import type { GroupBy } from './filter.js'
import { rungForTask } from './ladder.js'
import type { ColumnValue } from './place-pages.js'

/*
What a group's heading draws beside its name.

A section has a mark, "a folder's glyph or even a profile avatar", and it is
optional in the honest sense: a date rung
has none and the heading simply starts its name earlier, because the mark is
inline rather than in a reserved slot. So this says which kind of mark the
axis produced and never how to draw one, the drawing being a page's.
*/
export type GroupMark =
  | { readonly kind: 'folder'; readonly folderId: string }
  /* The person's own picture beside the name the tint is a function of,
     read off the card's `avatar_url` (4.1). Null where the person has no
     picture, which is the disc. */
  | {
      readonly kind: 'person'
      readonly id: string
      readonly name: string
      readonly image: string | null
    }

export interface TaskGroup {
  readonly key: string
  /** The heading and the region's name (9.1's regions rule). */
  readonly name: string
  /** The glyph or face beside the name, where the axis has one. */
  readonly mark: GroupMark | null
  /**
   * What a capture in this group writes, or null where the group is a
   * relation rather than a value and there is nothing to make (DES-182).
   */
  readonly capture: ColumnValue | null
  readonly rows: readonly TaskCard[]
  /**
   * A column of finished work: Done's days and the folder board's Done
   * column (item 58, F and G). The lifted board strikes its cards through,
   * and a drop into one completes rather than moves.
   */
  readonly done?: boolean
}

/**
 * The column a task under no section sits in, and the one a task naming a
 * section this page no longer has falls back to.
 *
 * 9.6 calls them "the loose open tasks", which is what the list view draws
 * above the blocks, so the board says the same word for the same rows.
 */
export const LOOSE = 'loose'

interface Slot {
  readonly key: string
  readonly name: string
  readonly capture: ColumnValue | null
  readonly mark: GroupMark | null
}

function slotFor(task: TaskCard, axis: GroupBy, today: string, viewerId: string | null): Slot {
  switch (axis) {
    case 'folder':
      return {
        key: task.folder.id,
        name: task.folder.name,
        capture: { folder_id: task.folder.id },
        mark: { kind: 'folder', folderId: task.folder.id },
      }
    case 'person': {
      if (task.assignee === null) {
        return {
          key: UNASSIGNED,
          name: 'Unassigned',
          capture: { assignee_id: null },
          mark: null,
        }
      }
      const mine = task.assignee.id === viewerId
      /* The face is tinted from the person's own name and never from the
         heading's, which is "You" for the viewer: one person is one colour on
         every surface, and a group headed "You" that painted itself from that
         word would give the viewer a different disc here than on their own
         rows (`parts/person-tint.ts`, AC-244). */
      const who = task.assignee.display_name ?? DELETED_USER
      return {
        key: task.assignee.id,
        name: mine ? 'You' : who,
        capture: { assignee_id: task.assignee.id },
        mark: { kind: 'person', id: task.assignee.id, name: who, image: task.assignee.avatar_url },
      }
    }
    case 'date': {
      /* The same rung the list ladder draws, from the same function.

         It read `rungFor(task.due_date, today)` until 2026-09-20 while the
         ladder read the schedule date, and the two then disagreed about
         every Start-only row: one page put it under "Thursday" as a list and
         in a "No date" column as a board, on a page whose whole membership
         is "carries a date" since issue #216. A heading contradicting the
         heading beside it is worse than either answer, so there is one
         answer and `views/ladder.ts` holds it.

         The capture is still a due date, and that is not the same question:
         a task *made* in a day column is new and has no Schedule to keep, so
         the column's day is its deadline. What a *drop* writes is the row's
         own end of the Schedule, which `TaskBoard.tsx` reads off the task
         through `movableEnd`. */
      const rung = rungForTask(task, today)
      return {
        key: rung.key,
        name: rung.name,
        capture: rung.date === null ? null : { due_date: rung.date },
        mark: null,
      }
    }
    case 'section': {
      /* The name is the seeded column's, because a section's name is a block
         of the folder's page and no task carries it (4.5 carries the id
         alone). `groupRows` reads it off `extra`, which is the page's own
         block order and therefore the column order too. */
      const at = task.section_block_id
      return {
        key: at ?? LOOSE,
        name: at ?? LOOSE,
        capture: { section_block_id: at },
        mark: null,
      }
    }
    case 'none':
      return { key: 'all', name: 'All', capture: null, mark: null }
  }
}

/**
 * The groups an axis makes of a page's rows.
 *
 * `extra` is a slot a page wants present whether or not it holds a row, which
 * is what keeps a folder board offering somewhere to capture on a page whose
 * rows happen to be in one folder. Nothing else is invented: a board of every
 * folder a person has would be a wall of empty columns, and DES-144's rule
 * about dead affordances applies to a column as much as to a menu item.
 */
export function groupRows(
  rows: readonly TaskCard[],
  axis: GroupBy,
  today: string,
  viewerId: string | null,
  extra: readonly TaskGroup[] = [],
): readonly TaskGroup[] {
  const order: string[] = []
  const groups = new Map<string, { slot: Slot; rows: TaskCard[] }>()
  for (const seed of extra) {
    order.push(seed.key)
    groups.set(seed.key, {
      slot: { key: seed.key, name: seed.name, capture: seed.capture, mark: seed.mark },
      rows: [],
    })
  }
  for (const task of rows) {
    const assignees = task.assignees ?? (task.assignee === null ? [] : [task.assignee])
    const slots = axis === 'person' && assignees.length > 0
      ? assignees.map((person) => slotFor({ ...task, assignee: person }, axis, today, viewerId))
      : [slotFor(task, axis, today, viewerId)]
    for (let slot of slots) {
      /* A task naming a section the page no longer has is loose, which is the
         list view's own rule (4.17 deletes a block without touching the tasks
         that named it). The seeded columns are the authority on which sections
         exist, so this is the one axis where an unseeded key is a fallback
         rather than a new column. */
      if (axis === 'section' && !groups.has(slot.key)) {
        slot = { key: LOOSE, name: LOOSE, capture: { section_block_id: null }, mark: null }
      }
      const existing = groups.get(slot.key)
      if (existing === undefined) {
        order.push(slot.key)
        groups.set(slot.key, { slot, rows: [task] })
        continue
      }
      existing.rows.push(task)
    }
  }
  const built = order.map((key) => {
    const held = groups.get(key)
    return {
      key,
      name: held?.slot.name ?? key,
      capture: held?.slot.capture ?? null,
      mark: held?.slot.mark ?? null,
      rows: held?.rows ?? ([] as readonly TaskCard[]),
    }
  })
  return axis === 'person' ? byPerson(built, viewerId) : built
}

/**
 * 9.5's own ordering for the person axis: "the viewer's own group first,
 * 'Unassigned' last".
 *
 * A reordering of groups rather than of rows, which section 6's no-re-sort
 * rule does not reach: the query returns no grouping at all here, Assignments
 * being a client-side composition rather than a query (section 6's preamble).
 */
function byPerson(
  groups: readonly TaskGroup[],
  viewerId: string | null,
): readonly TaskGroup[] {
  const mine = groups.filter((group) => group.key === viewerId)
  const unassigned = groups.filter((group) => group.key === UNASSIGNED)
  const others = groups
    .filter((group) => group.key !== viewerId && group.key !== UNASSIGNED)
    .sort((a, b) => a.name.localeCompare(b.name))
  return [...mine, ...others, ...unassigned]
}
