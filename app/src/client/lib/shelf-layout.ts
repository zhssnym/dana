/*
A shelf page's arrangement, between the prototype's blocks and 4.17's: the
seam `screens/shelf-page.tsx` crosses in place of `lib/folder-layout.ts`
(RFC 0004's S27).

The prototype keeps a shelf's blocks as `ShelfItem[]` in the browser under
the shelf's key, reading them once at mount and saving them in an effect on
every change. 4.17 keeps them as `page_blocks` rows, read whole and written
whole through 7.16's PUT, every kept block carrying the id and `updated_at`
it was read with as its evidence and a block left out being a deletion. This
module is the two translations, and the page wires them to the screen's
`initialItems` and `onLayoutChange`.

**Ids are the one thing the two shapes disagree about.** A block's id is the
server's, so a section or paragraph the screen has just made carries a
temporary one and a picture's `id` is its file's, not its block's (the
lifted `page-image.tsx` reads a file id there). So a write matches a stored
row by the block id it carries, inserts what carries none, and the page hands
the screen back the items rebuilt from the response so its state adopts the
ids the server chose; without that, the next write would insert the same
section twice.

**A folder row is matched by the folder it names**, `ref_folder_id`, which
is 11.15's rule that a shelf's membership is never keyed by name: a stored
`folder_ref` whose folder is no longer on the shelf is dropped on read by
the screen's own reconciliation, and a member the layout has never seen
joins it there too.
*/
import type { PageBlock, PageBlockWrite } from '../../shared/pages.js'
import { reservedRatio } from './page-images.js'
import type { ShelfItem } from '../screens/shelf-page.js'

/** 4.17's rows as the screen's blocks. */
export function shelfItemsOf(blocks: readonly PageBlock[]): ShelfItem[] {
  const items: ShelfItem[] = []
  for (const block of blocks) {
    if (block.kind === 'section') {
      items.push({ kind: 'section', section: { id: block.id, name: block.text ?? '' } })
    } else if (block.kind === 'paragraph') {
      items.push({ kind: 'paragraph', paragraph: { id: block.id, text: block.text ?? '' } })
    } else if (block.kind === 'image') {
      items.push({
        kind: 'image',
        blockId: block.id,
        image: {
          id: block.file_id ?? '',
          /* 4.16's measured shape, so a shelf page reserves the space a
             picture will take exactly as a folder page does (issue #108).
             This read a literal `16 / 9` and threw away the pair sitting on
             the block beside it, which is the same defect `BlocksEditor`
             carried: the two translations feed one
             `components/page-image.tsx`, so a fallback spelled a second time
             here would be a second answer to a question that has one. Null
             stays 16 by 9 for ever, no backfill having been run. */
          ratio: reservedRatio(block.file_width, block.file_height),
          caption: block.text ?? '',
          ...(block.width_pct === null ? {} : { width: block.width_pct }),
        },
      })
    } else if (block.kind === 'folder_ref' && block.ref_folder_id !== null) {
      items.push({ kind: 'folder', folder: { id: block.ref_folder_id } })
    }
  }
  return items
}

/** The screen's blocks as one PUT body, evidence carried from the last read. */
export function shelfWritesOf(
  items: readonly ShelfItem[],
  stored: readonly PageBlock[],
): PageBlockWrite[] {
  const byId = new Map(stored.map((block) => [block.id, block]))
  const byFolder = new Map(
    stored.flatMap((block) =>
      block.kind === 'folder_ref' && block.ref_folder_id !== null
        ? [[block.ref_folder_id, block] as const]
        : [],
    ),
  )
  const carry = (
    block: PageBlock | undefined,
  ): { id?: string; updated_at?: string } =>
    block === undefined ? {} : { id: block.id, updated_at: block.updated_at }

  return items.map((item, position): PageBlockWrite => {
    if (item.kind === 'section') {
      return { ...carry(byId.get(item.section.id)), kind: 'section', position, text: item.section.name }
    }
    if (item.kind === 'paragraph') {
      return {
        ...carry(byId.get(item.paragraph.id)),
        kind: 'paragraph',
        position,
        text: item.paragraph.text,
      }
    }
    if (item.kind === 'image') {
      return {
        ...carry(item.blockId === undefined ? undefined : byId.get(item.blockId)),
        kind: 'image',
        position,
        file_id: item.image.id === '' ? null : item.image.id,
        text: item.image.caption === '' ? null : item.image.caption,
        width_pct: item.image.width ?? null,
      }
    }
    return {
      ...carry(byFolder.get(item.folder.id)),
      kind: 'folder_ref',
      position,
      ref_folder_id: item.folder.id,
    }
  })
}
