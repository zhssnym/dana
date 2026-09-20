/*
Harness for the M1 Label criteria (AC-470 to AC-480), issue #226 and parent
#208.

Two decisions worth the words, both the folders harness's own read one model
over.

**Setup goes through the API, because the API is what this package is.** Every
Label below is created with the endpoint that creates Labels, every assignment
with the endpoint that assigns them. A broken create then fails every file
here on one attributable sentence, which is the correct verdict.

**Database assertions take explicit ids.** The Postgres leg gives each worker
its own database now, so a file cannot see another's rows, but a sweep over a
whole table would still see this file's earlier cases; every helper here names
what it is about.
*/
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import type { LabelDefinition, LabelRef } from '../../src/shared/labels.js'

import { expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'

/* ------------------------------------------------------------------ *
 * Definitions
 * ------------------------------------------------------------------ */

export interface LabelFields {
  name: string
  color?: string
  description?: string | null
}

/** The colour every fixture wears unless a case is about colour. Required on
 * every Label (#208 R5), so it cannot be left out of a create. */
export const FIXTURE_COLOR = '#3366AA'

export function postPersonalLabel(
  actor: Actor,
  fields: LabelFields,
): Promise<RawResponse> {
  return actor.browser.json('/labels/personal', 'POST', {
    name: fields.name,
    color: fields.color ?? FIXTURE_COLOR,
    ...(fields.description === undefined
      ? {}
      : { description: fields.description }),
  })
}

export async function createPersonalLabel(
  actor: Actor,
  fields: LabelFields,
): Promise<LabelDefinition> {
  const made = await postPersonalLabel(actor, fields)
  expectStatus(
    made,
    201,
    `POST /labels/personal must create ${JSON.stringify(fields.name)} (issue #226)`,
  )
  return made.json() as LabelDefinition
}

export function postFolderLabel(
  actor: Actor,
  folderId: string,
  fields: LabelFields,
): Promise<RawResponse> {
  return actor.browser.json(`/folders/${folderId}/labels`, 'POST', {
    name: fields.name,
    color: fields.color ?? FIXTURE_COLOR,
    ...(fields.description === undefined
      ? {}
      : { description: fields.description }),
  })
}

export async function createFolderLabel(
  actor: Actor,
  folderId: string,
  fields: LabelFields,
): Promise<LabelDefinition> {
  const made = await postFolderLabel(actor, folderId, fields)
  expectStatus(
    made,
    201,
    `POST /folders/:folderId/labels must create ${JSON.stringify(fields.name)} (issue #226)`,
  )
  return made.json() as LabelDefinition
}

export function patchPersonalLabel(
  actor: Actor,
  labelId: string,
  body: unknown,
): Promise<RawResponse> {
  return actor.browser.json(`/labels/personal/${labelId}`, 'PATCH', body)
}

export function patchFolderLabel(
  actor: Actor,
  folderId: string,
  labelId: string,
  body: unknown,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/labels/${labelId}`,
    'PATCH',
    body,
  )
}

export function archivePersonalLabel(
  actor: Actor,
  labelId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/labels/personal/${labelId}/archive`, 'POST')
}

export function restorePersonalLabel(
  actor: Actor,
  labelId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/labels/personal/${labelId}/restore`, 'POST')
}

export function archiveFolderLabel(
  actor: Actor,
  folderId: string,
  labelId: string,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/labels/${labelId}/archive`,
    'POST',
  )
}

export function restoreFolderLabel(
  actor: Actor,
  folderId: string,
  labelId: string,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/labels/${labelId}/restore`,
    'POST',
  )
}

/* ------------------------------------------------------------------ *
 * Listing
 * ------------------------------------------------------------------ */

export interface ListQuery {
  scope?: 'personal' | 'folder' | 'all'
  state?: 'active' | 'archived' | 'all'
  folder_id?: string
}

export function getLabels(
  actor: Actor,
  query: ListQuery = {},
): Promise<RawResponse> {
  const parts = Object.entries(query).map(
    ([key, value]) => `${key}=${encodeURIComponent(String(value))}`,
  )
  return actor.browser.api(
    `/labels${parts.length === 0 ? '' : `?${parts.join('&')}`}`,
  )
}

export async function listLabels(
  actor: Actor,
  query: ListQuery = {},
): Promise<LabelDefinition[]> {
  const answer = await getLabels(actor, query)
  expectStatus(answer, 200, 'GET /labels must answer the definitions')
  return answer.json() as LabelDefinition[]
}

/* ------------------------------------------------------------------ *
 * Assignment
 * ------------------------------------------------------------------ */

export function putTaskLabel(
  actor: Actor,
  taskId: string,
  labelId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${taskId}/labels/${labelId}`, 'PUT')
}

export function deleteTaskLabel(
  actor: Actor,
  taskId: string,
  labelId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${taskId}/labels/${labelId}`, 'DELETE')
}

export function putFolderLabel(
  actor: Actor,
  folderId: string,
  labelId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/folders/${folderId}/labels/${labelId}`, 'PUT')
}

export function deleteFolderLabel(
  actor: Actor,
  folderId: string,
  labelId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/folders/${folderId}/labels/${labelId}`, 'DELETE')
}

export interface TaskLabelsBody {
  personal: LabelRef[]
  folder: LabelRef[]
}

/* ------------------------------------------------------------------ *
 * Reading a projection back
 * ------------------------------------------------------------------ */

/** The Labels a task carries as one viewer sees them, read through the
 * single-task endpoint, which is the producer `taskView` owns. */
export async function taskLabelsOf(
  actor: Actor,
  taskId: string,
): Promise<TaskLabelsBody> {
  const answer = await actor.browser.api(`/tasks/${taskId}`)
  expectStatus(answer, 200, 'GET /tasks/:id must answer the TaskDetail')
  return (answer.json() as { labels: TaskLabelsBody }).labels
}

/** The same task as a list endpoint projects it, which is the other producer,
 * `readCards`. Every criterion that asserts a projection asserts both, because
 * two producers is the standing risk this contract carries. */
export async function cardLabelsOf(
  actor: Actor,
  folderId: string,
  taskId: string,
): Promise<TaskLabelsBody> {
  /* `tz` is required by 7.10 on every view read: the Completed section groups
     by the viewer's day. The open sections do not evaluate a date, but the
     query schema is one, so a zone is supplied rather than the endpoint being
     asked for less than it takes. UTC, because nothing here turns on a day. */
  const answer = await actor.browser.api(
    `/folders/${folderId}/tasks?tz=UTC`,
  )
  expectStatus(answer, 200, 'GET /folders/:id/tasks must answer the sections')
  const body = answer.json() as {
    scheduled?: { id: string; labels: TaskLabelsBody }[]
    unscheduled?: { id: string; labels: TaskLabelsBody }[]
  }
  const rows = [...(body.scheduled ?? []), ...(body.unscheduled ?? [])]
  const row = rows.find((candidate) => candidate.id === taskId)
  expect(row, `the folder read must carry task ${taskId}`).toBeDefined()
  return (row as { labels: TaskLabelsBody }).labels
}

/** The viewer's own Personal Labels on a folder, from the folder list. */
export async function folderLabelsOf(
  actor: Actor,
  folderId: string,
): Promise<LabelRef[]> {
  const answer = await actor.browser.api('/folders')
  expectStatus(answer, 200, 'GET /folders must answer the folder list')
  const rows = answer.json() as { id: string; personal_labels: LabelRef[] }[]
  const row = rows.find((candidate) => candidate.id === folderId)
  expect(row, `the folder list must carry folder ${folderId}`).toBeDefined()
  return (row as { personal_labels: LabelRef[] }).personal_labels
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

export async function countAssignments(
  db: Db,
  table: 'task_personal_labels' | 'task_folder_labels' | 'folder_personal_labels',
  labelId: string,
): Promise<number> {
  const found = (await db.execute(
    sql`SELECT count(*)::int AS n FROM ${sql.raw(table)}
        WHERE label_id = ${labelId}`,
  )) as unknown as { rows: { n: number }[] }
  return Number(found.rows[0]?.n ?? 0)
}

/** The names a listing answered, for an order assertion that reads as the
 * order rather than as a walk over objects. */
export function namesOf(labels: readonly { name: string }[]): string[] {
  return labels.map((label) => label.name)
}
