/*
 * The Library's one ordered column of shelves (groups) and loose folders, stored as a flat id list in
 * `sidebar_order`. Nothing is stored until someone drags; untouched, the column is the seed (AC-155): labelled
 * groups ascending, then loose folders by name. Stored ranks apply as a stable sort over the seed, so unnamed
 * entries keep their seeded order. A shelf outlives its folders; a bare label does not.
 */

import type { Folder } from '../../shared/folders.js'
import type { Shelf } from '../../shared/shelves.js'

/** Keyed, not indexed: the column is rebuilt from the folder list on every settled query. */
export type DirectoryEntry =
  | {
      readonly kind: 'group'
      readonly key: string
      readonly label: string
      readonly folders: readonly Folder[]
      /** Null for a label no `shelves` row names. A shelf adds a page, a mark and the object acts. */
      readonly shelf: Shelf | null
    }
  | { readonly kind: 'folder'; readonly key: string; readonly folder: Folder }

/** Prefixed so that no folder id can collide with it. */
export function groupKey(label: string): string {
  return `group:${label}`
}

export function folderKey(id: string): string {
  return `folder:${id}`
}

/** The drop sentence is "Into {shelf}", so return the group's own name, not its key. */
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

/** AC-155's order as one list. Desk is not in it: it is pinned above the column. */
export function seedColumn(
  folders: readonly Folder[],
  /**
   * Defaulted so callers and tests without shelves read the label-only Library. A shelf adds a group even if no
   * folder carries its name.
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

  /* The name is the join key. A shelf with no folders enters the map empty, so it still shows. */
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

function rankOf(stored: readonly string[], id: string): number {
  const at = stored.indexOf(id)
  return at === -1 ? Number.MAX_SAFE_INTEGER : at
}

/** Relies on `Array.prototype.sort` being stable (ES2019): unranked entries keep their arrival order. */
function stableBy<T>(items: readonly T[], rank: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .map((entry) => entry.item)
}

/**
 * A group ranks by its first folder the sequence names. Unnamed entries keep their seeded place, so a new
 * folder has a defined home.
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
  /* A shelf ranks by its own id where the sequence names it, so an empty shelf keeps its place. */
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
 * Updates the sequence only; the membership write is the server's. Without this a joined group would jump to
 * the folder's old rank. A folder leaving a group lands right after it. `at` is the slot the insert line
 * showed; omitted, it appends.
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
  // Bound to a const so the closure sees a Folder, not the widened `let`.
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

  /*
   * Emptied last, so the insertion above could still count against the group it left. An emptied label group
   * goes; an emptied shelf stays.
   */
  return next.filter(
    (entry) => entry.kind === 'folder' || entry.folders.length > 0 || entry.shelf !== null,
  )
}

/** The flat sequence that is stored. `arrangeColumn` reads it back to the same column. */
export function encodeColumn(entries: readonly DirectoryEntry[]): string[] {
  const ids: string[] = []
  for (const entry of entries) {
    if (entry.kind === 'folder') ids.push(entry.folder.id)
    else {
      /*
       * The shelf's own id before its folders, so an empty shelf has a rank. A bare label is held by its
       * folders.
       */
      if (entry.shelf !== null) ids.push(entry.shelf.id)
      for (const folder of entry.folders) ids.push(folder.id)
    }
  }
  return ids
}
