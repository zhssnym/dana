/*
Q7, GET /folders/:id/tasks: lists.ts's open halves narrowed to one folder, and
done.ts for Completed. No order or predicate is written here. The route gates
access with accessOf.
*/
import type {
  CompletedCursor,
  GetFolderTasksCompletedResponse,
  GetFolderTasksOpenResponse,
} from '../../shared/views.js'
import { takeCapped } from '../../shared/views.js'
import type { Executor } from '../database.js'

import { completedPage } from './done.js'
import { folderScheduled, folderUnscheduled } from './lists.js'

/** Sections 1 and 2, capped together in 7.10's order. */
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

/** Section 3: Q6 for one folder, sharing its cursor kind. */
export function folderCompletedView(
  executor: Executor,
  viewerId: string,
  folderId: string,
  tz: string,
  cursor: CompletedCursor | undefined,
): Promise<GetFolderTasksCompletedResponse> {
  return completedPage(executor, viewerId, tz, cursor, folderId)
}
