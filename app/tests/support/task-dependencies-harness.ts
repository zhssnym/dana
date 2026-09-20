/*
Harness for the M1-C2 dependency criteria, AC-440 to AC-446 (issue #224).

It is built on the P2 folder layer and the P3 tasks harness, and it follows
that harness's two standing rules rather than inventing any of its own.

**Setup goes through the API wherever the API exists.** Folders, memberships
and tasks arrive through their own endpoints, and so do dependencies: a broken
create then fails every file here on one attributable sentence instead of
seven files each failing on their own staging.

**The wire shapes are restated here rather than imported from
`app/src/shared/`.** This suite measures that surface and cannot borrow its
definition of correct. The keys are asserted exactly, because a key that
appears on a dependency edge without anybody deciding to put it there is how a
redaction stops being one: the whole protection on an inaccessible far end is
that the object carries nothing about it, and "nothing" is a claim about the
key set rather than about any value.
*/
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import type { Actor } from './folders-harness.js'
import { expectStatus } from './folders-harness.js'
import type { RawResponse } from './http-client.js'
import { asRecord, expectExactKeys } from './tasks-harness.js'
import { rows } from './helpers.js'

/** The four keys one edge carries, and no more. The endpoints are not among
 * them: an edge is named by its own id precisely so that the far task's id
 * never has to ride the wire. */
export const EDGE_KEYS = ['created_at', 'id', 'state', 'task'] as const

/** The safe summary of the far task. The folder chip is 7.0's. */
export const SUMMARY_KEYS = ['folder', 'id', 'status', 'title'] as const

export const DEPENDENCY_STATES = [
  'active',
  'satisfied',
  'unresolved',
  'unknown',
] as const

/** The far task as the wire carries it, once the shape judge has agreed that
 * it is that shape. */
export interface SummaryBody extends Record<string, unknown> {
  id: string
  title: string
  status: string
  folder: { id: string; name: string; is_default: boolean }
}

export interface EdgeBody extends Record<string, unknown> {
  id: string
  state: string
  created_at: string
  task: SummaryBody | null
}

/** One edge, shape-judged. Returns it so a caller can read the values it is
 * actually about. */
export function expectEdgeShape(value: unknown, source: string): EdgeBody {
  const edge = asRecord(value, source)
  expectExactKeys(edge, EDGE_KEYS, source)
  expect(typeof edge.id, `${source}.id must be a string`).toBe('string')
  expect(
    DEPENDENCY_STATES as readonly string[],
    `${source}.state must be one of the four states; got ${JSON.stringify(edge.state)}`,
  ).toContain(edge.state)
  expect(
    typeof edge.created_at === 'string' && !Number.isNaN(Date.parse(String(edge.created_at))),
    `${source}.created_at must be a parseable instant; got ${JSON.stringify(edge.created_at)}`,
  ).toBe(true)

  if (edge.task !== null) {
    const summary = asRecord(edge.task, `${source}.task`)
    expectExactKeys(summary, SUMMARY_KEYS, `${source}.task`)
    expect(typeof summary.id, `${source}.task.id must be a string`).toBe('string')
    expect(typeof summary.title, `${source}.task.title must be a string`).toBe(
      'string',
    )
    expect(
      ['pending', 'completed', 'abandoned'],
      `${source}.task.status must be one of 4.5's three`,
    ).toContain(summary.status)
    const folder = asRecord(summary.folder, `${source}.task.folder`)
    expectExactKeys(
      folder,
      ['id', 'is_default', 'name'],
      `${source}.task.folder`,
    )
  }

  return edge as EdgeBody
}

export interface DependenciesBody {
  depends_on: EdgeBody[]
  blocks: EdgeBody[]
}

/** The whole `GET /tasks/:id/dependencies` body, shape-judged. */
export function expectDependenciesShape(
  value: unknown,
  source: string,
): DependenciesBody {
  const body = asRecord(value, source)
  expectExactKeys(body, ['blocks', 'depends_on'], source)
  const side = (key: 'depends_on' | 'blocks'): EdgeBody[] => {
    expect(Array.isArray(body[key]), `${source}.${key} must be an array`).toBe(
      true,
    )
    return (body[key] as unknown[]).map((edge, index) =>
      expectEdgeShape(edge, `${source}.${key}[${String(index)}]`),
    )
  }
  return { depends_on: side('depends_on'), blocks: side('blocks') }
}

/* ------------------------------------------------------------------ *
 * The surface
 * ------------------------------------------------------------------ */

export function postDependency(
  actor: Actor,
  dependentTaskId: string,
  blockingTaskId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${dependentTaskId}/dependencies`, 'POST', {
    blocking_task_id: blockingTaskId,
  })
}

/** POST asserted at 201: the edge was created rather than already there. */
export async function createDependencyOk(
  actor: Actor,
  dependentTaskId: string,
  blockingTaskId: string,
  why: string,
): Promise<EdgeBody> {
  const response = await postDependency(actor, dependentTaskId, blockingTaskId)
  expectStatus(response, 201, why)
  return expectEdgeShape(response.json(), 'the POST dependencies body')
}

export function getDependencies(
  actor: Actor,
  taskId: string,
): Promise<RawResponse> {
  return actor.browser.api(`/tasks/${taskId}/dependencies`)
}

/** GET asserted at 200 with the two projections. */
export async function readDependencies(
  actor: Actor,
  taskId: string,
): Promise<DependenciesBody> {
  const response = await getDependencies(actor, taskId)
  expectStatus(
    response,
    200,
    `GET /tasks/${taskId}/dependencies must answer the two projections to a member`,
  )
  return expectDependenciesShape(
    response.json(),
    `the GET /tasks/${taskId}/dependencies body`,
  )
}

export function deleteDependency(
  actor: Actor,
  taskId: string,
  dependencyId: string,
): Promise<RawResponse> {
  return actor.browser.api(`/tasks/${taskId}/dependencies/${dependencyId}`, {
    method: 'DELETE',
  })
}

/* ------------------------------------------------------------------ *
 * Reading the rows themselves
 * ------------------------------------------------------------------ */

/**
 * The stored edges as `dependent -> blocker` pairs, which is the form every
 * assertion about duplication wants: the question there is which ids a copied
 * relation names, and the wire deliberately does not say.
 */
export async function storedEdges(
  db: Db,
  taskIds: readonly string[],
): Promise<{ dependent: string; blocking: string }[]> {
  if (taskIds.length === 0) return []
  const found = await rows(
    db,
    sql`SELECT dependent_task_id, blocking_task_id FROM task_dependencies
        ORDER BY created_at ASC, id ASC`,
  )
  const wanted = new Set(taskIds)
  return found
    .map((row) => ({
      dependent: String(row.dependent_task_id),
      blocking: String(row.blocking_task_id),
    }))
    .filter((edge) => wanted.has(edge.dependent) || wanted.has(edge.blocking))
}

/** Every stored edge touching one task, in either direction. */
export async function countEdgesTouching(
  db: Db,
  taskId: string,
): Promise<number> {
  const found = await rows(
    db,
    sql`SELECT count(*)::int AS n FROM task_dependencies
        WHERE dependent_task_id = ${taskId}::uuid
           OR blocking_task_id = ${taskId}::uuid`,
  )
  return Number(found[0]?.n ?? 0)
}

/** The tasks of one folder, id by title, for reading a duplicated folder's
 * work without depending on the order anything came back in. */
export async function tasksByTitle(
  db: Db,
  folderId: string,
): Promise<Map<string, string>> {
  const found = await rows(
    db,
    sql`SELECT id, title FROM tasks
        WHERE folder_id = ${folderId}::uuid AND deleted_at IS NULL`,
  )
  return new Map(found.map((row) => [String(row.title), String(row.id)]))
}
