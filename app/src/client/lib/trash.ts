// The Trash list from `GET /trash`, one list newest first. The server keeps the 30-day
// window and purges. Permanent delete differs by kind: a task needs Full control, a folder
// Full control and ownership; `purgeable` is answered per row.
import { useMemo } from 'react'

import { useDestroyTrashedDiscussion } from '../api/consultation.js'
import {
  useDestroyTrashedFolder,
  useDestroyTrashedTask,
} from '../api/mutations.js'
import { useTrash as useTrashRead } from '../api/queries.js'
import { folderGates, mayDraw } from './folder-authority.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'

// A tab is a page, so a trashed tab is a `folder` row.
export type TrashKind = 'task' | 'folder' | 'discussion'

export interface TrashItem {
  id: string
  kind: TrashKind
  // The object's own id.
  subject: string
  name: string
  at: number
  actor?: string
  // Where it was, in a person's words; restoring puts it back there.
  from?: string
  // Not one rule for every kind, so computed per row.
  purgeable: boolean
  // False only where the server said this viewer may not restore it; absent means yes.
  restorable?: boolean
}

export const TRASH_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

// Rounded up: under a day reads "1d left". The purge runs on the instant, not this number.
export function daysLeft(item: TrashItem, now = Date.now()) {
  return Math.max(0, Math.ceil((item.at + TRASH_DAYS * DAY - now) / DAY))
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

const EMPTY: TrashItem[] = []

/**
 * From the server's table, never a ladder here (AC-790). `isDefault: false` is wrong for
 * some rows but neither gate reads it; `folder-authority.test.ts` asserts that.
 */
export function mayPurge(
  row: { readonly my_access: FolderAccessPreset; readonly is_owner: boolean },
  kind: TrashKind,
): boolean {
  const gates = folderGates({
    access: row.my_access,
    isOwner: row.is_owner,
    isDefault: false,
  })
  // Asked by name so the table stays the one answer.
  if (kind === 'discussion') {
    return mayDraw(
      { access: row.my_access, isOwner: row.is_owner, isDefault: false },
      'discussion.purge',
    )
  }
  return kind === 'folder' ? gates.destroyFolder : gates.destroyTask
}

export function useTrash(): TrashItem[] {
  const read = useTrashRead()
  const data = read.data
  return useMemo(() => {
    if (data === undefined) return EMPTY
    const items: TrashItem[] = [
      ...data.tasks.map(
        (task): TrashItem => ({
          id: `task-${task.id}`,
          kind: 'task',
          subject: task.id,
          name: task.title,
          at: Date.parse(task.deleted_at),
          from: task.folder_name,
          purgeable: mayPurge(task, 'task'),
        }),
      ),
      ...data.folders.map(
        (folder): TrashItem => ({
          id: `folder-${folder.id}`,
          kind: 'folder',
          subject: folder.id,
          name: folder.name,
          at: Date.parse(folder.deleted_at),
          // A tab or sub-page names its project; a zero task count says nothing.
          from:
            folder.project_name === null
              ? plural(folder.task_count, 'task', 'tasks')
              : folder.task_count === 0
                ? folder.project_name
                : `${folder.project_name}, ${plural(folder.task_count, 'task', 'tasks')}`,
          purgeable: mayPurge(folder, 'folder'),
        }),
      ),
      ...data.discussions.map(
        (discussion): TrashItem => ({
          id: `discussion-${discussion.id}`,
          kind: 'discussion',
          subject: discussion.id,
          name: discussion.title,
          at: Date.parse(discussion.deleted_at),
          from: discussion.folder_name,
          purgeable: mayPurge(discussion, 'discussion'),
          ...(discussion.restorable === false ? { restorable: false } : {}),
        }),
      ),
    ]
    return items.sort((a, b) => b.at - a.at)
  }, [data])
}

/** The read's own state, for the screen's loading and failed lines. */
export function useTrashState(): { pending: boolean; failed: boolean; retry: () => void } {
  const read = useTrashRead()
  return {
    pending: read.isPending,
    failed: read.isError,
    retry: () => void read.refetch(),
  }
}

/**
 * Each press is one request. `emptyTrash` sends rows in sequence to avoid a burst, and
 * stops at the first refusal.
 */
export function usePurge(): {
  purge: (item: TrashItem) => Promise<void>
  emptyTrash: (items: readonly TrashItem[]) => Promise<void>
  pending: boolean
} {
  const task = useDestroyTrashedTask()
  const folder = useDestroyTrashedFolder()
  const discussion = useDestroyTrashedDiscussion()
  const purge = async (item: TrashItem): Promise<void> => {
    if (item.kind === 'task') await task.mutateAsync(item.subject)
    else if (item.kind === 'folder') await folder.mutateAsync(item.subject)
    else await discussion.mutateAsync(item.subject)
  }
  return {
    purge: (item) => purge(item).catch(() => undefined),
    emptyTrash: async (items) => {
      try {
        for (const item of items) if (item.purgeable) await purge(item)
      } catch {
        // The mutation cache shows the toast; the list refetches as it stands.
      }
    },
    pending: task.isPending || folder.isPending || discussion.isPending,
  }
}
