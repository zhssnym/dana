/*
The Library's one ordered column, and how a person's arrangement of it is
written down.

DES-171: "an alphabet is a reasonable first arrangement and a poor permanent
one, because the folders somebody reaches for hourly are not the ones whose
names begin with A." So 9.1 gives the Library "one ordered list", "the order
is the viewer's own, seeded alphabetically and rearranged by dragging". Two
sentences from that decision are what this module implements, and they pull in
opposite directions until they are written out:

- **The directory is one list, not two.** Groups and loose folders share a
  column, so a person moving things in that column is arranging one sequence.
  A model that kept them apart would have to refuse the obvious drag, a loose
  folder above a group, for a reason that exists only in the code.
- **Nothing is stored until somebody drags something.** A sidebar nobody has
  touched reads exactly as it did, which is what keeps AC-155 green: Inbox
  pinned first, the labelled folders grouped by label ascending, the unlabelled
  after them by name ascending. That order is the *seed* of this column and not
  a separate arrangement, which is the whole reason the two can coexist.

**The store is a flat sequence of folder ids, and that is a decision worth the
paragraph.** `patchSettingsBody.sidebar_order` is `z.array(z.uuid()).max(300)`,
so an entry it can name has to have a uuid, and a group in today's Library is
`folder_members.label`: a string, with no id of its own. The designer's
prototype stores entries and a per-group sequence, which needs both, and
writing that shape here would need 4.19's column to change, which is S7's file
and a frozen-adjacent contract this package has no business widening.

It does not need to. A group is drawn as a block, so its folders are always
adjacent in the column, and a column whose groups are contiguous runs is
losslessly encoded by the flat folder sequence alone: a group's position is
the position of its first folder, and the folders inside it are the run. The
one thing the encoding cannot hold is a group with no folders in it, and no
such thing exists, a group being the label its folders carry and nothing else
(9.1). So the arrangement round trips through the column the settings bundle
already has, and the finding raised at S11 is that the two models look
different rather than that either is short.

**The rank is applied as a stable sort over the seed, never as a sort of its
own.** Every entry the stored sequence does not name ranks last, and what
decides those is the order they were already in, which is AC-155's. A
comparator that fell back to comparing names would interleave a group's label
with a folder's name and take that criterion red the moment anybody dragged
anything, which is a seeded order quietly becoming an arrangement.
*/

import type { Folder } from '../../shared/folders.js'

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
export function seedColumn(folders: readonly Folder[]): DirectoryEntry[] {
  const rest = folders.filter((folder) => !folder.is_default)
  const byLabel = new Map<string, Folder[]>()
  const loose: Folder[] = []
  for (const folder of rest) {
    const label = folder.my_label
    if (label === null || label === '') {
      loose.push(folder)
      continue
    }
    const bucket = byLabel.get(label)
    if (bucket === undefined) byLabel.set(label, [folder])
    else bucket.push(folder)
  }

  const groups: DirectoryEntry[] = [...byLabel.entries()]
    .sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
    .map(([label, members]) => ({
      kind: 'group' as const,
      key: groupKey(label),
      label,
      folders: [...members].sort(byName),
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
 * makes a run of folder ids stand for the block that draws them. Everything
 * the sequence does not name keeps its seeded place, which is DES-171's
 * "the stored sequence is the authority for the entries it names and the
 * alphabet places the rest": a folder made tomorrow has a defined home
 * without anybody having had to decide where new things go.
 */
export function arrangeColumn(
  folders: readonly Folder[],
  stored: readonly string[],
): DirectoryEntry[] {
  const seeded = seedColumn(folders)
  const arranged = seeded.map((entry): DirectoryEntry => {
    if (entry.kind === 'folder') return entry
    return {
      ...entry,
      folders: stableBy(entry.folders, (folder) => rankOf(stored, folder.id)),
    }
  })
  return stableBy(arranged, (entry) =>
    entry.kind === 'folder'
      ? rankOf(stored, entry.folder.id)
      : Math.min(
          ...entry.folders.map((folder) => rankOf(stored, folder.id)),
          Number.MAX_SAFE_INTEGER,
        ),
  )
}

/**
 * The column with one folder taken out of wherever it is and put somewhere
 * else: into the group `label` names, or out of every group.
 *
 * The membership write is the server's and this is not it. What this is for
 * is the *sequence*, and without it a folder joining a group would keep the
 * rank it had as a loose row, which would make the group it joined take that
 * rank and jump up the column behind it. The person moved one row and two
 * things moved, which is the sort of surprise a drag exists to remove.
 *
 * A folder joining a group lands at the foot of it, and one leaving lands
 * immediately after the group it left. Both are choices rather than
 * deductions, and they are the predictable ones: the row appears where the
 * gesture ended and stays put until somebody moves it again.
 */
export function moveFolderTo(
  entries: readonly DirectoryEntry[],
  folderId: string,
  label: string | null,
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
      : emptied.map((entry) =>
          entry.kind === 'group' && entry.label === label
            ? { ...entry, folders: [...entry.folders, landed] }
            : entry,
        )
  if (label === null) {
    next.splice(Math.min(leftAt, next.length), 0, {
      kind: 'folder',
      key: folderKey(landed.id),
      folder: landed,
    })
  }

  /* Emptied last, so that the insertion above could still count against the
     group it left. A group that holds nothing is not a smaller group, it is
     not a group: 9.1's rule read forwards, a group being the label its
     folders carry and nothing else. */
  return next.filter((entry) => entry.kind === 'folder' || entry.folders.length > 0)
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
    else for (const folder of entry.folders) ids.push(folder.id)
  }
  return ids
}
