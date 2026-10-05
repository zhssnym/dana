/*
 * Grouping replaces a page's arrangement; it never nests inside it. Rows are walked once and appended, so the
 * server's order survives inside every group. A folder column uses the folder's name, never a member's label
 * (AC-221).
 */
import type { TaskCard } from '../../shared/tasks.js'
import { DELETED_USER } from '../parts/presenters.js'
import { UNASSIGNED } from './filter.js'
import type { GroupBy } from './filter.js'
import { rungForTask } from './ladder.js'
import type { ColumnValue } from './place-pages.js'

/* What a heading draws beside its name, or nothing (a date rung). This says which kind; a page draws it. */
export type GroupMark =
  | { readonly kind: 'folder'; readonly folderId: string }
  /* The person's picture from `avatar_url`; null draws the disc. */
  | {
      readonly kind: 'person'
      readonly id: string
      readonly name: string
      readonly image: string | null
    }

export interface TaskGroup {
  readonly key: string
  /** The heading, also the region's name. */
  readonly name: string
  readonly mark: GroupMark | null
  /** What a capture in this group writes, or null where the group is a relation, not a value. */
  readonly capture: ColumnValue | null
  readonly rows: readonly TaskCard[]
  /** A column of finished work: dropping into it completes rather than moves. */
  readonly done?: boolean
}

/** The column for tasks under no section, or naming a section the page no longer has. */
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
      /*
       * Tinted from the person's own name, never the heading's "You", so the viewer's disc matches everywhere
       * (AC-244).
       */
      const who = task.assignee.display_name ?? DELETED_USER
      return {
        key: task.assignee.id,
        name: mine ? 'You' : who,
        capture: { assignee_id: task.assignee.id },
        mark: { kind: 'person', id: task.assignee.id, name: who, image: task.assignee.avatar_url },
      }
    }
    case 'date': {
      /*
       * The same rung the list ladder draws (`views/ladder.ts`), so list and board agree. A capture writes the
       * column's day as a due date; a drop writes the row's own end (`movableEnd`).
       */
      const rung = rungForTask(task, today)
      return {
        key: rung.key,
        name: rung.name,
        capture: rung.date === null ? null : { due_date: rung.date },
        mark: null,
      }
    }
    case 'section': {
      /* The section's name comes from the page's blocks (`extra`), which also fix the column order. */
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

/** `extra` slots appear even when empty, so a board keeps somewhere to capture. Nothing else is invented. */
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
      /* A task naming a missing section is loose; seeded columns decide which sections exist. */
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

/** "You" first, "Unassigned" last. Reorders groups, not rows. */
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
