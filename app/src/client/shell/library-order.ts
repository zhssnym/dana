/*
The Library's one ordered column, and how a person's arrangement of it is
written down.

An alphabet is a reasonable first arrangement and a poor permanent one, because
the folders somebody reaches for hourly are not the ones whose names begin with
A. So 9.1 gives the Library "one ordered list", "the order is the viewer's own,
seeded alphabetically and rearranged by dragging". Two rules follow, and they
pull in opposite directions until they are written out:

- **The directory is one list, not two.** Groups and loose folders share a
  column, so a person moving things in that column is arranging one sequence. A
  model that kept them apart would have to refuse the obvious drag, a loose
  folder above a group, for a reason that exists only in the code.
- **Nothing is stored until somebody drags something.** A sidebar nobody has
  touched reads as the seed, which is what AC-155 asserts: Inbox pinned first,
  the labelled folders grouped by label ascending, the unlabelled after them by
  name ascending. That order is the *seed* of this column and not a separate
  arrangement, which is the whole reason the two can coexist.

**The store is a flat sequence of ids.** `patchSettingsBody.sidebar_order` is
`z.array(z.uuid()).max(300)`, so an entry it can name has to have a uuid. A
group is drawn as a block, so its folders are always adjacent in the column, and
a column whose groups are contiguous runs is losslessly encoded by the flat
folder sequence alone: a group's position is the position of its first folder,
and the folders inside it are the run. So the arrangement round trips through
the column the settings bundle already has, without widening 4.19.

**A group is a shelf.** 9.1: "the Library holds the viewer's shelves and folders
as one ordered list", and 4.18 is what makes the join possible: a shelf's
membership *is* `folder_members.shelf_name`, held in step with the shelf's own
name by the server in one transaction, so a label and a shelf name are two views
of one string rather than two facts to reconcile. A shelf holding nothing is an
ordinary thing to have (`POST /shelves` labels no folder), and it must still
appear in the Library.

Three consequences, each a decision rather than a deduction:

- **Every shelf is a group, whether or not a folder carries its label**, so the
  Library draws the shelves a person has rather than the labels their folders
  happen to spell. `seedColumn` takes the shelves beside the folders and unions
  the two.
- **A label with no shelf row is still a group.** Accounts labelled before 7.16
  existed carry labels no `shelves` row names, and dropping those rows from the
  column would empty a person's Library to fix a model. Such a group has no page
  and no mark; it is a shelf that has not been made yet.
- **A shelf outlives its folders.** `moveFolderTo` keeps a shelf its last folder
  left, because the shelf is the thing and the label is its membership; only a
  *labelless* group, one no shelf row names, disappears when it empties.

**An empty shelf unranked by the sequence keeps its seeded place.**
`arrangeColumn` ranks a group by the first of its folders the sequence names,
and a group with no folders has no such rank, so it takes `MAX_SAFE_INTEGER` and
the stable sort leaves it exactly where the seed put it, which is alphabetical
among the shelves. That is the right answer rather than a fallback: nobody has
dragged it, so nothing has said where it goes.

**The rank is applied as a stable sort over the seed, never as a sort of its
own.** Every entry the stored sequence does not name ranks last, and what
decides those is the order they were already in, which is AC-155's. A comparator
that fell back to comparing names would interleave a group's label with a
folder's name and break that order the moment anybody dragged anything, which is
a seeded order quietly becoming an arrangement.
*/

import type { Folder } from '../../shared/folders.js'
import type { Shelf } from '../../shared/shelves.js'

/**
 * One entry in the column: a group with its folders, or a loose folder.
 *
 * Keyed rather than identified by index, because the engine reorders indexes
 * and the column is rebuilt from the server's folder list on every settled
 * query. A key survives that; an index does not.
 */
export type DirectoryEntry =
  | {
      readonly kind: 'group'
      readonly key: string
      readonly label: string
      readonly folders: readonly Folder[]
      /**
       * The shelf this group is, where one exists.
       *
       * Null for a label no `shelves` row names, which is what an account
       * labelled before 7.16 carries. What hangs off it is everything a shelf
       * has that a label does not: a page to link the heading to (9.10), a
       * mark of its own (4.18), and the object contract's acts. A group with
       * none of those is drawn exactly as it was.
       */
      readonly shelf: Shelf | null
    }
  | { readonly kind: 'folder'; readonly key: string; readonly folder: Folder }

/** A group's key. Prefixed so that no folder id can ever collide with one. */
export function groupKey(label: string): string {
  return `group:${label}`
}

/** A loose folder's key. */
export function folderKey(id: string): string {
  return `folder:${id}`
}

/**
 * The label a group key stands for, for the sentence a drop reads.
 *
 * 9.1 fixes that sentence as "Into {shelf}", so what the carried row says has
 * to be the group's own name and not the key the engine passes around.
 */
export function labelOfKey(key: string): string {
  return key.startsWith('group:') ? key.slice('group:'.length) : key
}

/** What an entry is called, for the aria-live line a keyboard move announces. */
export function entryName(entry: DirectoryEntry): string {
  return entry.kind === 'group' ? entry.label : entry.folder.name
}

/** Case-insensitive, so "aardvark" and "Aardvark" order together. */
function byName(a: Folder, b: Folder): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
}

/**
 * The seeded column: AC-155's order, expressed as one list.
 *
 * Inbox is not in it. 9.1 pins that row first and gives it a clause of its
 * own, above the label groups and never inside one, so it is chrome the
 * column sits under rather than an entry the column holds.
 */
export function seedColumn(
  folders: readonly Folder[],
  /**
   * The viewer's shelves (7.16).
   *
   * Defaulted so that a caller with none, and the unit cases written before
   * shelves reached this column, read the label-only Library they always did.
   * A shelf here contributes a group whether or not any folder carries its
   * name, which is the half 9.1 asks for and the label model could not give.
   */
  shelves: readonly Shelf[] = [],
): DirectoryEntry[] {
  const rest = folders.filter((folder) => !folder.is_default)
  const byLabel = new Map<string, Folder[]>()
  const loose: Folder[] = []
  for (const folder of rest) {
    const label = folder.my_shelf
    if (label === null || label === '') {
      loose.push(folder)
      continue
    }
    const bucket = byLabel.get(label)
    if (bucket === undefined) byLabel.set(label, [folder])
    else bucket.push(folder)
  }

  /* 4.18 holds a shelf's name and its folders' labels in step in one
     transaction, so the name is the join key and no reconciliation is owed.
     A shelf with no folders enters the map empty, which is the whole point. */
  const shelfByName = new Map<string, Shelf>()
  for (const shelf of shelves) {
    shelfByName.set(shelf.name, shelf)
    if (!byLabel.has(shelf.name)) byLabel.set(shelf.name, [])
  }

  const groups: DirectoryEntry[] = [...byLabel.entries()]
    .sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
    .map(([label, members]) => ({
      kind: 'group' as const,
      key: groupKey(label),
      label,
      folders: [...members].sort(byName),
      shelf: shelfByName.get(label) ?? null,
    }))

  const singles: DirectoryEntry[] = [...loose]
    .sort(byName)
    .map((folder) => ({ kind: 'folder' as const, key: folderKey(folder.id), folder }))

  return [...groups, ...singles]
}

/** Where a folder sits in the stored sequence; unnamed folders rank last. */
function rankOf(stored: readonly string[], id: string): number {
  const at = stored.indexOf(id)
  return at === -1 ? Number.MAX_SAFE_INTEGER : at
}

/**
 * A stable sort. `Array.prototype.sort` has been stable since ES2019, and
 * this names the reliance rather than leaving a reader to know it, because
 * the fallback for every unranked entry is precisely the order it arrived in.
 */
function stableBy<T>(items: readonly T[], rank: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .map((entry) => entry.item)
}

/**
 * The seeded column rearranged by a stored sequence.
 *
 * A group ranks by the first of its folders the sequence names, which is what
 * makes a run of folder ids stand for the block that draws them. Everything the
 * sequence does not name keeps its seeded place: the stored sequence is the
 * authority for the entries it names and the alphabet places the rest, so a
 * folder made tomorrow has a defined home without anybody having had to decide
 * where new things go.
 */
export function arrangeColumn(
  folders: readonly Folder[],
  stored: readonly string[],
  shelves: readonly Shelf[] = [],
): DirectoryEntry[] {
  const seeded = seedColumn(folders, shelves)
  const arranged = seeded.map((entry): DirectoryEntry => {
    if (entry.kind === 'folder') return entry
    return {
      ...entry,
      folders: stableBy(entry.folders, (folder) => rankOf(stored, folder.id)),
    }
  })
  /* A shelf ranks by its own id where the sequence names it, so an empty shelf
     keeps the place it was given rather than sinking below everything the
     sequence names the moment anything moves; a shelf the sequence does not
     name still ranks by its first folder. */
  return stableBy(arranged, (entry) =>
    entry.kind === 'folder'
      ? rankOf(stored, entry.folder.id)
      : Math.min(
          entry.shelf === null ? Number.MAX_SAFE_INTEGER : rankOf(stored, entry.shelf.id),
          ...entry.folders.map((folder) => rankOf(stored, folder.id)),
          Number.MAX_SAFE_INTEGER,
        ),
  )
}

/**
 * The column with one folder taken out of wherever it is and put somewhere
 * else: into the group `label` names, or out of every group.
 *
 * The membership write is the server's and this is not it. What this is for is
 * the *sequence*, and without it a folder joining a group would keep the rank
 * it had as a loose row, which would make the group it joined take that rank
 * and jump up the column behind it. The person moved one row and two things
 * moved, which is the sort of surprise a drag exists to remove.
 *
 * A folder leaving a group lands immediately after the group it left, which is
 * a choice rather than a deduction and is the predictable one: the row appears
 * where the gesture ended and stays put until somebody moves it again.
 *
 * **`at` is where inside the group it lands**, because the Library draws an
 * insert line under the pointer while a folder is carried over an open shelf,
 * and a line promising a slot that the drop does not honour is worse than no
 * line at all. Omitted, it appends, so every caller that has no line to keep
 * honest is unchanged.
 */
export function moveFolderTo(
  entries: readonly DirectoryEntry[],
  folderId: string,
  label: string | null,
  at?: number,
): DirectoryEntry[] {
  let carried: Folder | null = null
  let leftAt = entries.length

  const emptied: DirectoryEntry[] = []
  for (const entry of entries) {
    if (entry.kind === 'folder') {
      if (entry.folder.id === folderId) {
        carried = entry.folder
        leftAt = emptied.length
        continue
      }
      emptied.push(entry)
      continue
    }
    const held = entry.folders.find((folder) => folder.id === folderId)
    if (held !== undefined) {
      carried = held
      leftAt = emptied.length + 1
      emptied.push({
        ...entry,
        folders: entry.folders.filter((folder) => folder.id !== folderId),
      })
      continue
    }
    emptied.push(entry)
  }

  if (carried === null) return [...entries]
  // Bound to a const so the closure below sees a Folder rather than the
  // widened `let`, which narrowing does not reach into.
  const landed: Folder = carried

  const next: DirectoryEntry[] =
    label === null
      ? emptied
      : emptied.map((entry) => {
          if (entry.kind !== 'group' || entry.label !== label) return entry
          const folders = [...entry.folders]
          folders.splice(
            at === undefined ? folders.length : Math.max(0, Math.min(at, folders.length)),
            0,
            landed,
          )
          return { ...entry, folders }
        })
  if (label === null) {
    next.splice(Math.min(leftAt, next.length), 0, {
      kind: 'folder',
      key: folderKey(landed.id),
      folder: landed,
    })
  }

  /* Emptied last, so that the insertion above could still count against the
     group it left.

     **A shelf outlives its folders and a bare label does not.** A label is
     nothing but what its folders spell, so an emptied label group goes; a shelf
     is a row with a page, a mark and a name of its own that 7.16's delete is
     the only thing that ends. So a group carrying a shelf stays where it is,
     empty, and the Library keeps saying the shelf exists. */
  return next.filter(
    (entry) => entry.kind === 'folder' || entry.folders.length > 0 || entry.shelf !== null,
  )
}

/**
 * The flat folder sequence a column encodes to, which is what is stored.
 *
 * Groups first-to-last as they stand in the column, each contributing its own
 * folders in their own order, and a loose folder contributing itself. Read
 * back through `arrangeColumn` this returns the same column, which is the
 * property the round-trip cases assert.
 */
export function encodeColumn(entries: readonly DirectoryEntry[]): string[] {
  const ids: string[] = []
  for (const entry of entries) {
    if (entry.kind === 'folder') ids.push(entry.folder.id)
    else {
      /* The shelf's own id ahead of its folders, so a shelf with no folders has
         a rank at all. A bare label has no id and is held by its folders. */
      if (entry.shelf !== null) ids.push(entry.shelf.id)
      for (const folder of entry.folders) ids.push(folder.id)
    }
  }
  return ids
}
