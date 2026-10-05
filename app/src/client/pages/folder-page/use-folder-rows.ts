import { useEffect, useMemo } from 'react'

import { mergeCompletedDays, useFolderCompletedTasks } from '../../api/queries.js'
import type { WorkView } from '../../views/work-view.js'
import type { PageView } from '../../../shared/pages.js'
import type { PageKind } from '../../../shared/folders.js'
import type { TaskCard } from '../../../shared/tasks.js'

export function useFolderRows({
  id,
  writes,
  kind,
  workView,
  scheduled,
  unscheduled,
  items,
}: {
  readonly id: string
  readonly writes: boolean
  readonly kind: PageKind | null
  readonly workView: WorkView
  readonly scheduled: readonly TaskCard[]
  readonly unscheduled: readonly TaskCard[]
  readonly items: PageView['items'] | undefined
}): {
  readonly openRows: TaskCard[]
  readonly completedReady: boolean
  readonly completedRows: TaskCard[]
  readonly filterRows: TaskCard[]
} {
  /* Order by the page's stored `items`, not the tasks read's due-date order. A task
     not in `items` yet (just created) sorts last until the page read catches up. */
  const openRows = useMemo(() => {
    const rows = [...scheduled, ...unscheduled]
    if (items === undefined) return rows
    const rank = new Map<string, number>()
    for (const item of items) if (item.kind === 'task') rank.set(item.id, rank.size)
    return rows
      .map((row, index) => ({ row, index, placed: rank.get(row.id) ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.placed - b.placed || a.index - b.index)
      .map((entry) => entry.row)
  }, [scheduled, unscheduled, items])

  /* The first page replaces per-task reads; Freeform follows the cursor. */
  const completed = useFolderCompletedTasks(id, writes)
  useEffect(() => {
    // Freeform needs every placed finished Task to fill its Section disclosures.
    if (kind === 'work' && workView === 'freeform' && completed.hasNextPage && !completed.isFetchingNextPage) void completed.fetchNextPage()
  }, [kind, workView, completed.hasNextPage, completed.isFetchingNextPage, completed.fetchNextPage])
  /* The canvas waits, so no finished task is read by id while the list loads. */
  const completedReady = completed.data !== undefined || completed.isError
  const completedDays = mergeCompletedDays(completed.data?.pages)
  const completedRows = useMemo(() => completedDays.flatMap((day) => day.rows), [completedDays])
  const filterRows = useMemo(() => [...openRows, ...completedRows], [openRows, completedRows])
  return { openRows, completedReady, completedRows, filterRows }
}
