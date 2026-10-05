/*
Task dependencies: one directed relation (dependent waits on blocker), read as
`depends_on` from one end and `blocks` from the other. State is derived, never
stored: pending blocker = active, completed = satisfied, abandoned = unresolved.
`unknown` with `task: null` means the viewer cannot read the far end; edges
carry their own id, never the endpoints', so the redaction is total.
*/
import { z } from 'zod'

import { taskStatus } from './tasks.js'
import type { TaskStatus } from './tasks.js'

/*
The dependent is the path task, so the body names only the blocker. The message
omits the field name: sendValidationError prefixes the path.
*/
export const postTaskDependencyBody = z.object({
  blocking_task_id: z.uuid('must be the id of the task this one waits on'),
})

export type PostTaskDependencyBody = z.infer<typeof postTaskDependencyBody>

/** `unknown`: the viewer cannot read the blocker, so its state is withheld (10.2). */
export type DependencyState = 'active' | 'satisfied' | 'unresolved' | 'unknown'

export const DEPENDENCY_STATES: readonly DependencyState[] = [
  'active',
  'satisfied',
  'unresolved',
  'unknown',
] as const

/** The far task, with the folder chip because dependencies may cross folders. */
export interface DependencyTaskSummary {
  id: string
  title: string
  status: TaskStatus
  folder: { id: string; name: string; is_default: boolean }
}

/**
 * One edge seen from one end; `task` is the other end. Null when the viewer
 * cannot read it, and then `state` is `unknown`.
 */
export interface TaskDependencyEdge {
  id: string
  task: DependencyTaskSummary | null
  state: DependencyState
  created_at: string
  /** Null once that account is gone. */
  created_by: string | null
}

/** `GET /tasks/:id/dependencies`, each list ordered by creation then id. */
export interface TaskDependencies {
  depends_on: TaskDependencyEdge[]
  blocks: TaskDependencyEdge[]
}

/* The client's zod schema, checked equal to the interfaces above. */
export const taskDependencyEdge = z.object({
  id: z.string(),
  task: z
    .object({
      id: z.string(),
      title: z.string(),
      status: taskStatus,
      folder: z.object({ id: z.string(), name: z.string(), is_default: z.boolean() }),
    })
    .nullable(),
  state: z.enum(['active', 'satisfied', 'unresolved', 'unknown']),
  created_at: z.string(),
  created_by: z.string().nullable(),
})

export const getTaskDependenciesResponse = z.object({
  depends_on: z.array(taskDependencyEdge),
  blocks: z.array(taskDependencyEdge),
})

// Compile-time only: the schema and the server's interface describe one shape.
type _Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const _responseMatches: _Same<z.infer<typeof getTaskDependenciesResponse>, TaskDependencies> = true
void _responseMatches

/*
`GET /folders/:id/dependencies`: edges with both ends live in one Folder, as
id pairs, for "Save as workflow". Endpoint ids are safe here because a member
can read both ends; edges leaving the Folder are never returned.
*/
export const folderDependencyEdge = z.object({
  id: z.string(),
  dependent_task_id: z.string(),
  blocking_task_id: z.string(),
})

export const getFolderDependenciesResponse = z.object({
  dependencies: z.array(folderDependencyEdge),
})

export type FolderDependencyEdge = z.infer<typeof folderDependencyEdge>
export type GetFolderDependenciesResponse = z.infer<
  typeof getFolderDependenciesResponse
>
