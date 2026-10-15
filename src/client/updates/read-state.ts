import type { ProductUpdate } from './index.js'

/** Historical backfill must never appear as an unread release. */
export function unreadUpdateIds(
  items: readonly ProductUpdate[],
  seenIds: readonly string[],
): string[] {
  const seen = new Set(seenIds)
  return items.filter((item) => !item.historical && !seen.has(item.id)).map((item) => item.id)
}
