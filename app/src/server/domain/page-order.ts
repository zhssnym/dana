import { sql } from 'drizzle-orm'

import type { PageItemRef } from '../../shared/pages.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { initialKeys, keyBetween } from './fractional-index.js'

export interface PositionedItem extends PageItemRef {
  pagePosition: string | null
  sectionBlockId: string | null
  blockKind: string | null
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

export function sameItem(left: PageItemRef, right: PageItemRef): boolean {
  return left.kind === right.kind && left.id === right.id
}

export async function positionedItems(
  tx: Executor,
  folderId: string,
): Promise<PositionedItem[]> {
  const rows = await rowsOf(
    tx,
    sql`SELECT item.kind, item.id, item.page_position,
               item.section_block_id, item.block_kind
          FROM (
            SELECT 'block'::text AS kind, b.id, b.page_position,
                   b.section_block_id, b.kind::text AS block_kind,
                   1 AS fallback_kind, b.position::bigint AS fallback_position,
                   b.updated_at AS fallback_time
              FROM page_blocks b
             WHERE b.folder_id = ${folderId}::uuid
            UNION ALL
            SELECT 'task'::text AS kind, t.id, t.page_position,
                   t.section_block_id, NULL::text AS block_kind,
                   0 AS fallback_kind, 0::bigint AS fallback_position,
                   t.created_at AS fallback_time
              FROM tasks t
             WHERE t.folder_id = ${folderId}::uuid
               AND t.deleted_at IS NULL
               AND t.status IN ('pending', 'abandoned')
          ) item
         ORDER BY item.page_position ASC NULLS LAST,
                  CASE WHEN item.page_position IS NULL THEN item.fallback_kind END,
                  CASE WHEN item.page_position IS NULL THEN item.fallback_position END,
                  CASE WHEN item.page_position IS NULL THEN item.fallback_time END,
                  item.kind, item.id`,
  )
  return rows.map((row) => ({
    kind: String(row.kind) as PageItemRef['kind'],
    id: String(row.id),
    pagePosition: nullableString(row.page_position),
    sectionBlockId: nullableString(row.section_block_id),
    blockKind: nullableString(row.block_kind),
  }))
}

export async function writeItemPosition(
  tx: Executor,
  item: PageItemRef,
  pagePosition: string,
): Promise<void> {
  await tx.execute(
    item.kind === 'block'
      ? sql`UPDATE page_blocks SET page_position = ${pagePosition}
            WHERE id = ${item.id}::uuid`
      : sql`UPDATE tasks SET page_position = ${pagePosition}
            WHERE id = ${item.id}::uuid`,
  )
}

export async function seededItems(tx: Executor, folderId: string): Promise<PositionedItem[]> {
  const items = await positionedItems(tx, folderId)
  if (items.every((item) => item.pagePosition !== null)) return items
  const keys = initialKeys(items.length)
  for (const [index, item] of items.entries()) {
    const key = keys[index] as string
    await writeItemPosition(tx, item, key)
    item.pagePosition = key
  }
  return items
}

export type PlacementResult =
  | { kind: 'key'; value: string; settled: boolean }
  | { kind: 'bad_anchor'; field: 'after' | 'before' }

export function placementKey(
  items: readonly PositionedItem[],
  moving: PageItemRef | null,
  after: PageItemRef | null,
  before: PageItemRef | null,
): PlacementResult {
  if (moving !== null && after !== null && sameItem(moving, after)) {
    return { kind: 'bad_anchor', field: 'after' }
  }
  if (moving !== null && before !== null && sameItem(moving, before)) {
    return { kind: 'bad_anchor', field: 'before' }
  }
  const without = moving === null ? [...items] : items.filter((item) => !sameItem(item, moving))
  const at = (wanted: PageItemRef | null): number | null => {
    if (wanted === null) return null
    const index = without.findIndex((item) => sameItem(item, wanted))
    return index < 0 ? -1 : index
  }
  const afterIndex = at(after)
  const beforeIndex = at(before)
  if (afterIndex === -1) return { kind: 'bad_anchor', field: 'after' }
  if (beforeIndex === -1) return { kind: 'bad_anchor', field: 'before' }
  if (without.length > 0 && after === null && before === null) {
    return { kind: 'bad_anchor', field: 'after' }
  }
  if (afterIndex !== null && beforeIndex !== null && afterIndex >= beforeIndex) {
    return { kind: 'bad_anchor', field: 'after' }
  }
  const lower = afterIndex === null ? null : without[afterIndex]?.pagePosition ?? null
  const upper = beforeIndex === null ? null : without[beforeIndex]?.pagePosition ?? null
  const current = moving === null
    ? null
    : items.find((item) => sameItem(item, moving))?.pagePosition ?? null
  return {
    kind: 'key',
    value: keyBetween(lower, upper),
    settled:
      current !== null &&
      (lower === null || lower < current) &&
      (upper === null || current < upper),
  }
}

function allowedSectionsAtGap(
  items: readonly PositionedItem[],
  index: number,
): ReadonlySet<string | null> {
  const previous = items[index - 1]
  const next = items[index]
  if (previous?.kind === 'block' && previous.blockKind === 'section') {
    const allowed = new Set<string | null>([previous.id])
    /* An empty Section has one physical gap serving two truthful gestures:
       expanded inserts its first member, while the approved collapsed-Section
       seam inserts after the complete (empty) span into No section. */
    if (next?.sectionBlockId !== previous.id) allowed.add(null)
    return allowed
  }
  if (previous?.sectionBlockId !== null && previous?.sectionBlockId !== undefined) {
    if (next?.sectionBlockId === previous.sectionBlockId) {
      return new Set([previous.sectionBlockId])
    }
    /* The gap after a Section's final member is likewise shared: an expanded
       seam appends another member, while the collapsed span seam inserts the
       first loose item after that complete span. */
    return new Set([previous.sectionBlockId, null])
  }
  return new Set([null])
}

/** Proves that an anchor interval is one semantic gap. Non-adjacent anchors
 * remain valid only for concurrent inserts that already received this exact
 * fractional key; every possible gap in that tie must accept the same Section.
 */
export function placementMatchesSection(
  items: readonly PositionedItem[],
  moving: PageItemRef | null,
  after: PageItemRef | null,
  before: PageItemRef | null,
  pagePosition: string,
  sectionBlockId: string | null,
): boolean {
  const without = moving === null ? [...items] : items.filter((item) => !sameItem(item, moving))
  const afterIndex = after === null
    ? null
    : without.findIndex((item) => sameItem(item, after))
  const beforeIndex = before === null
    ? null
    : without.findIndex((item) => sameItem(item, before))
  if (afterIndex === -1 || beforeIndex === -1) return false
  const start = afterIndex === null ? 0 : afterIndex + 1
  const end = beforeIndex === null ? without.length : beforeIndex
  if (start > end) return false
  const intervening = without.slice(start, end)
  if (intervening.some((item) => item.pagePosition !== pagePosition)) return false
  for (let index = start; index <= end; index += 1) {
    if (!allowedSectionsAtGap(without, index).has(sectionBlockId)) return false
  }
  return true
}

/** The deterministic placement used by legacy task PATCHes that change a
 * folder or Section but cannot name mixed neighbours. A Section receives the
 * task at the end of its contiguous span; No section receives it at page end.
 */
export function positionAtSectionEnd(
  items: readonly PositionedItem[],
  moving: PageItemRef | null,
  sectionBlockId: string | null,
): string | null {
  const without = moving === null ? [...items] : items.filter((item) => !sameItem(item, moving))
  if (sectionBlockId === null) {
    return keyBetween(without.at(-1)?.pagePosition ?? null, null)
  }
  const sectionIndex = without.findIndex(
    (item) => item.kind === 'block' && item.blockKind === 'section' && item.id === sectionBlockId,
  )
  if (sectionIndex < 0) return null
  let beforeIndex = sectionIndex + 1
  while (without[beforeIndex]?.sectionBlockId === sectionBlockId) beforeIndex += 1
  return keyBetween(
    without[beforeIndex - 1]?.pagePosition ?? null,
    without[beforeIndex]?.pagePosition ?? null,
  )
}
