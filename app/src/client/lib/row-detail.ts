/*
What an expanded row reads that its list never carried.

A list is drawn from 7.10's cards, which carry a step count and not the
steps, and `components/task-row.tsx`'s own mapper invents "Step 1, Step 2"
from that count as a lab fallback. The dialog reads 7.6's detail and shows the
real ones, so the chevron and the title disagreed about one task (the
adversarial round of 2026-08-30, taskcard F8; and F2 of the row file, the
inline card reading a missing folder as Desk). This hook is the one read that
closes both: while a row is open it asks for the task's detail and hands back
the same `ConceptTask` the surface host builds, through the same mapper, so
the two cannot drift.

Nothing is read while the row is shut, which is what keeps a list of two
hundred rows from making two hundred requests.
*/
import { useFolders, useTask } from '../api/queries.js'
import { presenterToday } from '../parts/presenters.js'
import { toConceptTask } from './task-concept.js'
import type { ConceptTask } from './task-model.js'
import { useTimeFormat } from './time-format.js'

export function useExpandedDetail(
  id: string | undefined,
  open: boolean,
): ConceptTask | undefined {
  const task = useTask(open && id !== undefined ? id : null)
  const folders = useFolders()
  const clock = useTimeFormat()
  if (task.data === undefined || folders.data === undefined) return undefined
  return toConceptTask(task.data, { today: presenterToday(), folders: folders.data, clock })
}
