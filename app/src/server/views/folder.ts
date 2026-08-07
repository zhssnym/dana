/*
Q7: GET /folders/:id/tasks, the folder page's three sections.

Section 6 defines all three by reference, and this file holds them by
reference too: Scheduled and Unscheduled are lists.ts's two open halves
narrowed to one folder, and Completed is done.ts entire. Nothing about an
order or a predicate is written here, because everything about them is
written once somewhere else.

The body was the one of 7.10's nine that the frozen text described without
enumerating, and it is enumerated now by owner ruling on 2026-08-07:
{ scheduled, unscheduled, truncated } on section=open, and
{ days, next_cursor } on section=completed. The cap covers the open sections,
because section 6's list includes folder open sections, and the enumeration
puts scheduled first.

Access is resolved through domain/folders.ts's accessOf rather than through a
membership predicate written here: Q7 opens with "member only, else 404", and
that is the 10.2 chokepoint the P2 package already owns. The route maps the
null to the 404 that an inaccessible folder and a nonexistent one both get.
*/
import type {
  CompletedCursor,
  GetFolderTasksCompletedResponse,
  GetFolderTasksOpenResponse,
} from '../../shared/views.js'
import { takeCapped } from '../../shared/views.js'
import type { Executor } from '../domain/db.js'

import { completedPage } from './done.js'
import { folderScheduled, folderUnscheduled } from './lists.js'

/** Sections 1 and 2 of Q7, capped together in the order 7.10 enumerates
 * them. */
export async function folderOpenView(
  executor: Executor,
  viewerId: string,
  folderId: string,
): Promise<GetFolderTasksOpenResponse> {
  const scheduled = await folderScheduled(executor, viewerId, folderId)
  const unscheduled = await folderUnscheduled(executor, viewerId, folderId)
  const capped = takeCapped([scheduled, unscheduled])
  return {
    scheduled: capped.sections[0] ?? [],
    unscheduled: capped.sections[1] ?? [],
    truncated: capped.truncated,
  }
}

/** Section 3 of Q7, which is Q6 with folder_id = F: same predicate, same
 * order, same page size, same cursor kind, so a cursor issued by either
 * decodes for the other and the two cannot page differently. */
export function folderCompletedView(
  executor: Executor,
  viewerId: string,
  folderId: string,
  tz: string,
  cursor: CompletedCursor | undefined,
): Promise<GetFolderTasksCompletedResponse> {
  return completedPage(executor, viewerId, tz, cursor, folderId)
}
