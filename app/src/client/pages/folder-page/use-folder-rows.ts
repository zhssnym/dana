// The folder page's task rows: open ones in the page's order, then finished ones.
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
  /*
  The folder's own composed sequence, which is `GET /page`'s `items` and not
  Q7's two arrays.

  4.17's durable mixed order is the one the page stores (AC-176). The canvas
  draws from the document, and these rows are what it looks tasks up in. Q7's
  arrays would order `scheduled` by due date; this orders by the composed
  sequence (#234).

  A row the page has not composed yet keeps Q7's order behind the composed ones,
  which is what a task created a moment ago looks like until the page read
  catches up. `items` carries every undeleted task of the folder, so that window
  is the only time the fallback is reached.
  */
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

  /* Always read finished Tasks for Thread and Freeform. The first page
     replaces per-placement reads (#312); Freeform follows the cursor. */
  const completed = useFolderCompletedTasks(id, writes)
  useEffect(() => {
    // Freeform needs every placed finished Task to fill its Section disclosures.
    if (kind === 'work' && workView === 'freeform' && completed.hasNextPage && !completed.isFetchingNextPage) void completed.fetchNextPage()
  }, [kind, workView, completed.hasNextPage, completed.isFetchingNextPage, completed.fetchNextPage])
  /* The canvas waits for them, so no finished placement is read by id while
     the list is still on its way. */
  const completedReady = completed.data !== undefined || completed.isError
  const completedDays = mergeCompletedDays(completed.data?.pages)
  /* The finished Tasks the canvas draws in place, checked and muted. */
  const completedRows = useMemo(() => completedDays.flatMap((day) => day.rows), [completedDays])
  const filterRows = useMemo(() => [...openRows, ...completedRows], [openRows, completedRows])
  return { openRows, completedReady, completedRows, filterRows }
}
