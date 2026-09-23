/*
The M1-C2 task dependency contract (issue #224): the request body both sides
send and the two projections both sides read.

**One directed relation, read from either end.** A row says that the dependent
task depends on the blocking task; `depends_on` is the set of rows where the
task being read is the dependent, and `blocks` is the set where it is the
blocker. The same row is the "Depends on…" of one task and the "Blocks…" of
the other, which is why the client reverses source and target rather than
asking for a second kind of row.

**The state is derived here, never stored.** 4.5 gives a task three statuses
and the relation reads them: a pending blocker leaves the dependency `active`,
a completed one makes it `satisfied`, and an abandoned one leaves it
`unresolved` — abandoned is not done, so a dependency on an abandoned task is
not satisfied by it. Reopening a completed blocker therefore makes the
dependency active again with no write to this table at all. There is no fourth
task status: nothing in 4.5 becomes `blocked`, because a derived fact stored
twice is a fact that eventually disagrees with itself.

**`unknown` is the fourth state and it is an authorization answer rather than
a lifecycle one.** A relation can outlive the viewer's access to one of its
ends: a cross-folder dependency is allowed wherever the person making it can
read both tasks (10.2), and a later unshare takes one end away without touching
the row. The edge still exists and the near end still has to render something,
so it is returned with `task` null and `state` unknown, which is the only
answer that neither invents a lifecycle nor reports the far task's status to
somebody who cannot read the far task.

**The edge carries its own id and never its endpoints', which is the same
rule seen from the write side.** An edge addressed by the pair of tasks it
joins could not be named for removal without handing back the id of the task
being withheld. The surrogate id is what lets the redaction be total: the near
end is the task the caller asked about and the far end is `task`, redacted or
not, and no other identifier rides the wire.
*/
import { z } from 'zod'

import type { TaskStatus } from './tasks.js'

/*
The one request field on this surface.

It is `blocking_task_id` rather than a pair because the dependent is the task
in the path: `POST /tasks/:id/dependencies` reads as "this task gains a
blocker", and a body naming both ends would let the two disagree, which is a
refusal to write rather than a field to validate. The client's "Blocks…"
control sends the same request against the other task.

The message carries no field name of its own: `sendValidationError` builds
every sentence as `${path}: ${message}` (10.3), and a message that repeated
the path would double it on the wire — `folders.ts`'s convention, and the
defect issue #39 measured.
*/
export const postTaskDependencyBody = z.object({
  blocking_task_id: z.uuid('must be the id of the task this one waits on'),
})

export type PostTaskDependencyBody = z.infer<typeof postTaskDependencyBody>

/** Active while the blocker is pending, satisfied when it is completed,
 * unresolved while it is abandoned, unknown where the viewer cannot read the
 * blocker and the server will not say (10.2). */
export type DependencyState = 'active' | 'satisfied' | 'unresolved' | 'unknown'

export const DEPENDENCY_STATES: readonly DependencyState[] = [
  'active',
  'satisfied',
  'unresolved',
  'unknown',
] as const

/**
 * The far end of an edge, for a caller who can read it: enough for a row or a
 * detail panel to render the other task and link to it, and nothing beyond
 * that. The folder chip is the one 7.0 gives TaskCard, because a dependency
 * may cross folders and "which folder is this in" is the first thing a reader
 * asks of a task that is not in front of them.
 */
export interface DependencyTaskSummary {
  id: string
  title: string
  status: TaskStatus
  folder: { id: string; name: string; is_default: boolean }
}

/**
 * One edge as one end of it sees it. `task` is the *other* end: the blocker
 * in a `depends_on` entry, the dependent in a `blocks` entry. Null means the
 * viewer cannot read that task — trashed, or in a folder they are not a member
 * of — and then `state` is `unknown` rather than the far task's real state.
 */
export interface TaskDependencyEdge {
  id: string
  task: DependencyTaskSummary | null
  state: DependencyState
  created_at: string
}

/** What `GET /tasks/:id/dependencies` answers: the two projections of one
 * table, each ordered by creation then id so a list is stable across reads. */
export interface TaskDependencies {
  depends_on: TaskDependencyEdge[]
  blocks: TaskDependencyEdge[]
}

/*
`GET /folders/:id/dependencies` (#207 follow-up): every edge whose **both**
ends are live Tasks of one Folder, as bare endpoint pairs.

It exists so "Save as workflow" reads a Folder's internal ordering in one
request rather than one per Task. The endpoint ids are safe on the wire here,
unlike in `TaskDependencies`, because the read is gated on membership of the
Folder and both ends are live Tasks of that Folder, each of which the member
can already read. An edge with either end in another Folder is never returned,
since its far end is exactly the id `TaskDependencies` withholds.

A zod schema rather than an interface because the client parses the response
through `getPlain`, and the server's answer is typed against the same schema,
so the two halves cannot drift.
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
