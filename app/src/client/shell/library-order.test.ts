/*
The Library column's seed, its arrangement, and the round trip between them.

Unit tests, owned by this module under protocol section 8. AC-155 asserts the
seeded order through the browser and AC-227 asserts the gesture; what is here
is the arithmetic between the two, and in particular the one property the
whole storage decision rests on: a column encodes to a flat folder sequence
and that sequence reads back as the same column.

The fixture folders carry only what this module reads. `Folder` has fourteen
fields and thirteen of them are nothing to do with an order, so building whole
ones would put the interesting three inside a wall of noise.
*/
import { describe, expect, it } from 'vitest'

import {
  arrangeColumn,
  encodeColumn,
  entryName,
  folderKey,
  groupKey,
  moveFolderTo,
  seedColumn,
  type DirectoryEntry,
} from './library-order.js'
import type { Folder } from '../../shared/folders.js'

function folderOf(id: string, name: string, label: string | null, isDefault = false): Folder {
  return {
    id,
    name,
    is_default: isDefault,
    is_owner: true,
    member_count: 1,
    counts: { pending: 0, completed: 0 },
    my_label: label,
    my_color: null,
    icon: null,
    color: null,
    cover_file_id: null,
    description: null,
  } as Folder
}

/* Deliberately not in any tidy order, because an input already sorted cannot
   show that anything sorted it. */
const FOLDERS: readonly Folder[] = [
  folderOf('f-zebra', 'Zebra', null),
  folderOf('f-desk', 'Desk', null, true),
  folderOf('f-rent', 'Rent', 'Home'),
  folderOf('f-apple', 'Apple', null),
  folderOf('f-specs', 'Specs', 'Work'),
  folderOf('f-boiler', 'Boiler', 'Home'),
  folderOf('f-admin', 'Admin', 'Work'),
]

/** The column read as names, which is what a person sees down the sidebar. */
function shape(entries: readonly DirectoryEntry[]): string[] {
  return entries.map((entry) =>
    entry.kind === 'group'
      ? `${entry.label}[${entry.folders.map((folder) => folder.name).join(',')}]`
      : entry.folder.name,
  )
}

describe('seedColumn: the alphabet, as one list', () => {
  it('is AC-155 order: groups by label ascending, then loose folders by name', () => {
    expect(shape(seedColumn(FOLDERS))).toEqual([
      'Home[Boiler,Rent]',
      'Work[Admin,Specs]',
      'Apple',
      'Zebra',
    ])
  })

  it('leaves Inbox out of the column entirely', () => {
    // 9.1 pins that row first and gives it a clause of its own, above the
    // label groups and never inside one, so it is chrome the column sits
    // under rather than an entry the column holds. Its own row is drawn by
    // the sidebar, which is why nothing here has to place it.
    expect(shape(seedColumn(FOLDERS))).not.toContain('Desk')
  })

  it('reads an empty label as no label', () => {
    // 4.4 puts no exclusion on the empty string, and a client that wrote one
    // instead of a null would put every ungrouped folder into a group named
    // "", which AC-180 exists partly to refuse. Read the same way here.
    const folders = [folderOf('f-a', 'Alpha', ''), folderOf('f-b', 'Beta', null)]
    expect(shape(seedColumn(folders))).toEqual(['Alpha', 'Beta'])
  })

  it('orders case-insensitively, so two spellings of one word sit together', () => {
    const folders = [folderOf('f-a', 'apple', null), folderOf('f-b', 'Banana', null)]
    expect(shape(seedColumn(folders))).toEqual(['apple', 'Banana'])
  })

  it('gives every entry a key no other entry can collide with', () => {
    const keys = seedColumn(FOLDERS).map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain(groupKey('Home'))
    expect(keys).toContain(folderKey('f-apple'))
  })
})

describe('arrangeColumn: the stored sequence over the seed', () => {
  it('is the seed exactly while nothing has been stored', () => {
    // DES-171: "a sidebar nobody has touched still reads exactly as it did",
    // which is what keeps AC-155 green once this column can be rearranged.
    expect(shape(arrangeColumn(FOLDERS, []))).toEqual(shape(seedColumn(FOLDERS)))
  })

  it('moves a loose folder above a group, which is the drag the two-list model refused', () => {
    // Zebra first: its id leads the sequence, so its entry leads the column
    // even though every group would sort above it alphabetically.
    const stored = ['f-zebra', 'f-boiler', 'f-rent', 'f-admin', 'f-specs', 'f-apple']
    expect(shape(arrangeColumn(FOLDERS, stored))).toEqual([
      'Zebra',
      'Home[Boiler,Rent]',
      'Work[Admin,Specs]',
      'Apple',
    ])
  })

  it('ranks a group by the first of its folders the sequence names', () => {
    // Work's run leads, so Work leads, and Home follows on Boiler's index.
    const stored = ['f-admin', 'f-specs', 'f-apple', 'f-boiler', 'f-rent', 'f-zebra']
    expect(shape(arrangeColumn(FOLDERS, stored))).toEqual([
      'Work[Admin,Specs]',
      'Apple',
      'Home[Boiler,Rent]',
      'Zebra',
    ])
  })

  it('orders the folders inside a group by the same sequence', () => {
    const stored = ['f-rent', 'f-boiler']
    const column = arrangeColumn(FOLDERS, stored)
    expect(shape(column)[0]).toBe('Home[Rent,Boiler]')
  })

  it('keeps an unnamed entry in its seeded place rather than sorting it by name', () => {
    // The fallback for everything the sequence does not name is the order it
    // was already in, which is AC-155's. A comparator falling back to names
    // would interleave a group's label with a folder's name and take that
    // criterion red the moment anybody dragged anything.
    const stored = ['f-zebra']
    expect(shape(arrangeColumn(FOLDERS, stored))).toEqual([
      'Zebra',
      'Home[Boiler,Rent]',
      'Work[Admin,Specs]',
      'Apple',
    ])
  })

  it('places a folder made after the arrangement without disturbing it', () => {
    // DES-171: "the stored sequence is the authority for the entries it names
    // and the alphabet places the rest", so a folder made tomorrow has a
    // defined home without anybody having had to decide where new things go.
    const stored = encodeColumn(arrangeColumn(FOLDERS, ['f-zebra']))
    const withNew = [...FOLDERS, folderOf('f-new', 'Newcomer', null)]
    expect(shape(arrangeColumn(withNew, stored))).toEqual([
      'Zebra',
      'Home[Boiler,Rent]',
      'Work[Admin,Specs]',
      'Apple',
      'Newcomer',
    ])
  })

  it('ignores an id the viewer can no longer see', () => {
    // A deleted folder leaves its id in the stored sequence, and the ranks of
    // everything after it must not shift meaning because of it.
    const stored = ['f-gone', 'f-zebra', 'f-apple']
    expect(shape(arrangeColumn(FOLDERS, stored))).toEqual([
      'Zebra',
      'Apple',
      'Home[Boiler,Rent]',
      'Work[Admin,Specs]',
    ])
  })
})

describe('encodeColumn: the flat sequence a column is stored as', () => {
  it('walks the column and spends each group on its own folders', () => {
    expect(encodeColumn(seedColumn(FOLDERS))).toEqual([
      'f-boiler',
      'f-rent',
      'f-admin',
      'f-specs',
      'f-apple',
      'f-zebra',
    ])
  })

  it('round trips: a column encodes and reads back as itself', () => {
    // This is the property the whole storage decision rests on. A group has
    // no uuid, so `sidebar_order` cannot name one; a group is drawn as a
    // block, so its folders are contiguous; and a column whose groups are
    // contiguous runs is held whole by the flat sequence alone.
    const arrangements = [
      [] as string[],
      ['f-zebra', 'f-boiler', 'f-rent', 'f-admin', 'f-specs', 'f-apple'],
      ['f-admin', 'f-specs', 'f-apple', 'f-boiler', 'f-rent', 'f-zebra'],
      ['f-rent', 'f-boiler', 'f-zebra'],
    ]
    for (const stored of arrangements) {
      const column = arrangeColumn(FOLDERS, stored)
      const again = arrangeColumn(FOLDERS, encodeColumn(column))
      expect(shape(again), `re-reading ${JSON.stringify(stored)}`).toEqual(shape(column))
    }
  })

  it('names every folder in the column exactly once', () => {
    const ids = encodeColumn(seedColumn(FOLDERS))
    expect(new Set(ids).size).toBe(ids.length)
    // Six, not seven: Inbox is not in the column and so is never stored.
    expect(ids).toHaveLength(6)
  })
})

describe('moveFolderTo: where a folder lands when it changes container', () => {
  const column = seedColumn(FOLDERS)

  it('puts a loose folder at the foot of the group it was dropped on', () => {
    expect(shape(moveFolderTo(column, 'f-apple', 'Home'))).toEqual([
      'Home[Boiler,Rent,Apple]',
      'Work[Admin,Specs]',
      'Zebra',
    ])
  })

  /*
  The slot the insert line promised, added at S24 with the line itself.

  The Library draws a line under the pointer while a folder is carried over an
  open shelf, and a line naming a slot the drop then ignores is worse than no
  line: it is the interface saying one thing and doing another, in the one
  gesture where a person is watching closely. So the drop takes the index the
  line drew, and these two cases are what keep the pair honest.
  */
  it('lands a folder at the slot the insert line named', () => {
    expect(shape(moveFolderTo(column, 'f-apple', 'Home', 0))).toEqual([
      'Home[Apple,Boiler,Rent]',
      'Work[Admin,Specs]',
      'Zebra',
    ])
    expect(shape(moveFolderTo(column, 'f-apple', 'Home', 1))).toEqual([
      'Home[Boiler,Apple,Rent]',
      'Work[Admin,Specs]',
      'Zebra',
    ])
  })

  it('clamps a slot past either end rather than dropping the folder', () => {
    // A measurement taken while the rows were moving can name a slot that no
    // longer exists by the time the release lands. Losing the folder over it
    // would be the worst available answer to an off-by-one.
    expect(shape(moveFolderTo(column, 'f-apple', 'Home', 99))).toEqual([
      'Home[Boiler,Rent,Apple]',
      'Work[Admin,Specs]',
      'Zebra',
    ])
    expect(shape(moveFolderTo(column, 'f-apple', 'Home', -3))).toEqual([
      'Home[Apple,Boiler,Rent]',
      'Work[Admin,Specs]',
      'Zebra',
    ])
  })

  it('does not let the group it joined inherit its old rank', () => {
    // Without this move the sequence would still name Apple where it stood,
    // Home would rank by it, and the group would jump up the column behind a
    // folder somebody only meant to file. One gesture, one thing moving.
    const stored = encodeColumn(moveFolderTo(column, 'f-apple', 'Home'))
    const filed = FOLDERS.map((folder) =>
      folder.id === 'f-apple' ? folderOf('f-apple', 'Apple', 'Home') : folder,
    )
    expect(shape(arrangeColumn(filed, stored))).toEqual([
      'Home[Boiler,Rent,Apple]',
      'Work[Admin,Specs]',
      'Zebra',
    ])
  })

  it('puts a folder leaving a group immediately after the group it left', () => {
    expect(shape(moveFolderTo(column, 'f-boiler', null))).toEqual([
      'Home[Rent]',
      'Boiler',
      'Work[Admin,Specs]',
      'Apple',
      'Zebra',
    ])
  })

  it('carries a folder from one group straight into another', () => {
    expect(shape(moveFolderTo(column, 'f-rent', 'Work'))).toEqual([
      'Home[Boiler]',
      'Work[Admin,Specs,Rent]',
      'Apple',
      'Zebra',
    ])
  })

  it('drops a group that its last folder just left', () => {
    // A group is the label its folders carry and nothing else (9.1), so a
    // heading over nothing is not a smaller group, it is not a group.
    const oneEach = [folderOf('f-only', 'Only', 'Solo'), folderOf('f-free', 'Free', null)]
    const from = seedColumn(oneEach)
    expect(shape(moveFolderTo(from, 'f-only', null))).toEqual(['Only', 'Free'])
  })

  it('leaves the column alone for a folder that is not in it', () => {
    expect(shape(moveFolderTo(column, 'f-nowhere', 'Home'))).toEqual(shape(column))
  })
})

describe('entryName: what a keyboard move announces', () => {
  it('is the label of a group and the name of a folder', () => {
    const [group, , loose] = seedColumn(FOLDERS)
    expect(group === undefined ? null : entryName(group)).toBe('Home')
    expect(loose === undefined ? null : entryName(loose)).toBe('Apple')
  })
})
