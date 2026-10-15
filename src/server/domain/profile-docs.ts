import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { ProfileDocAudience, ProfileDocGrant, ProfileDocRoot } from '../../shared/profile-docs.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { keyBetween } from './fractional-index.js'

export type CreateProfileDocResult =
  | { kind: 'created'; id: string }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }

function liveProject(projectId: string) {
  return sql`SELECT id, owner_id FROM folders
    WHERE id = ${projectId}::uuid AND project_id = id
      AND deleted_at IS NULL AND archived_at IS NULL`
}

async function currentMembers(tx: Executor, projectId: string, viewerId: string, personId: string) {
  return rowsOf(tx, sql`SELECT user_id, access FROM folder_members
    WHERE folder_id = ${projectId}::uuid
      AND user_id IN (${viewerId}::uuid, ${personId}::uuid)
    ORDER BY user_id FOR SHARE`)
}

export async function createProfileDoc(
  db: Db,
  viewerId: string,
  projectId: string,
  personId: string,
  name: string,
  custody: 'person' | 'project',
): Promise<CreateProfileDocResult> {
  return inTransaction(db, async (tx) => {
    const project = (await rowsOf(tx, sql`${liveProject(projectId)} FOR SHARE`))[0]
    if (project === undefined) return { kind: 'not_found' }
    const members = await currentMembers(tx, projectId, viewerId, personId)
    const viewer = members.find((row) => String(row.user_id) === viewerId)
    if (viewer === undefined || !members.some((row) => String(row.user_id) === personId)) {
      return { kind: 'not_found' }
    }
    if (custody === 'person' ? viewerId !== personId : viewer.access !== 'full_control') {
      return { kind: 'forbidden' }
    }

    await tx.execute(sql`SELECT 1 FROM users WHERE id = ${personId}::uuid AND deleted_at IS NULL FOR UPDATE`)
    const last = (await rowsOf(tx, sql`SELECT max(tab_position) AS position FROM profile_doc_roots
      WHERE profile_user_id = ${personId}::uuid`))[0]?.position
    const position = keyBetween(last == null ? null : String(last), null)
    const id = randomUUID()
    const ownerId = custody === 'person' ? personId : String(project.owner_id)
    await tx.execute(sql`INSERT INTO folders (id, owner_id, name, project_id, kind, tab_position)
      VALUES (${id}::uuid, ${ownerId}::uuid, ${name}, ${id}::uuid, 'doc', 'a0')`)
    await tx.execute(sql`INSERT INTO profile_doc_roots
      (root_folder_id, profile_user_id, custody_project_id, audience_project_id, audience, tab_position)
      VALUES (${id}::uuid, ${personId}::uuid,
        ${custody === 'project' ? projectId : null}::uuid,
        ${custody === 'project' ? projectId : null}::uuid,
        ${custody === 'project' ? 'project_members' : 'only_me'}, ${position})`)
    await recordEvent(tx, {
      actorId: viewerId, verb: 'created', subjectKind: 'folder',
      subjectId: id, subjectName: name, folderId: id,
    })
    return { kind: 'created', id }
  })
}

export async function listProfileDocs(
  db: Db,
  viewerId: string,
  projectId: string,
  personId: string,
): Promise<ProfileDocRoot[] | null> {
  const project = await rowsOf(db, liveProject(projectId))
  if (!project.length) return null
  const members = await currentMembers(db, projectId, viewerId, personId)
  const viewer = members.find((row) => String(row.user_id) === viewerId)
  if (viewer === undefined) return null
  const personIsMember = members.some((row) => String(row.user_id) === personId)
  if (!personIsMember && viewer.access !== 'full_control') return null
  const rows = await rowsOf(db, sql`SELECT r.root_folder_id AS id, f.name, r.audience,
      r.tab_position, r.custody_project_id, g.access
    FROM profile_doc_roots r
    JOIN folders f ON f.id = r.root_folder_id AND f.deleted_at IS NULL AND f.archived_at IS NULL
    JOIN visible_folder_members g ON g.folder_id = r.root_folder_id AND g.user_id = ${viewerId}::uuid
    WHERE r.profile_user_id = ${personId}::uuid
      AND (r.custody_project_id IS NULL OR r.custody_project_id = ${projectId}::uuid)
      AND (${personIsMember} OR r.custody_project_id = ${projectId}::uuid)
    ORDER BY r.tab_position, r.root_folder_id`)
  return rows.map((row) => ({
    id: String(row.id), name: String(row.name),
    audience: row.audience as ProfileDocAudience,
    tab_position: String(row.tab_position),
    custody: row.custody_project_id === null ? 'person' : 'project',
    may_edit: row.access === 'can_edit' || row.access === 'full_control',
    may_manage: row.access === 'full_control',
  }))
}

export type ChangeProfileDocAudienceResult = 'changed' | 'not_found' | 'forbidden' | 'invalid_person'

export async function getProfileDocSharing(
  db: Db, viewerId: string, projectId: string, personId: string, rootId: string,
): Promise<{ grants: { user_id: string; may_edit: boolean; display_name: string | null }[] } | null> {
  const roots = await listProfileDocs(db, viewerId, projectId, personId)
  if (!roots?.some((root) => root.id === rootId && root.may_manage)) return null
  const rows = await rowsOf(db, sql`SELECT g.user_id, g.may_edit, u.display_name
    FROM profile_doc_grants g JOIN users u ON u.id = g.user_id AND u.deleted_at IS NULL
    WHERE g.root_folder_id = ${rootId}::uuid ORDER BY u.display_name, g.user_id`)
  return { grants: rows.map((row) => ({
    user_id: String(row.user_id), may_edit: row.may_edit === true,
    display_name: row.display_name === null ? null : String(row.display_name),
  })) }
}

export async function moveProfileDoc(
  db: Db,
  viewerId: string,
  projectId: string,
  personId: string,
  rootId: string,
  beforeId: string | null,
  afterId: string | null,
): Promise<'changed' | 'not_found' | 'forbidden' | 'invalid_order'> {
  return inTransaction(db, async (tx) => {
    const project = await rowsOf(tx, liveProject(projectId))
    if (!project.length) return 'not_found'
    const members = await currentMembers(tx, projectId, viewerId, personId)
    if (!members.some((row) => String(row.user_id) === viewerId) ||
        !members.some((row) => String(row.user_id) === personId)) return 'not_found'
    const ids = [rootId, beforeId, afterId].filter((id): id is string => id !== null)
    if (new Set(ids).size !== ids.length) return 'invalid_order'
    const roots = await rowsOf(tx, sql`SELECT r.root_folder_id, r.tab_position,
        r.custody_project_id, v.access
      FROM profile_doc_roots r
      JOIN folders f ON f.id = r.root_folder_id AND f.deleted_at IS NULL
      JOIN visible_folder_members v ON v.folder_id = r.root_folder_id
        AND v.user_id = ${viewerId}::uuid
      WHERE r.profile_user_id = ${personId}::uuid
        AND (r.custody_project_id IS NULL OR r.custody_project_id = ${projectId}::uuid)
        AND r.root_folder_id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
      ORDER BY r.root_folder_id FOR UPDATE OF f`)
    if (roots.length !== ids.length) return 'not_found'
    const root = roots.find((row) => String(row.root_folder_id) === rootId)
    if (root?.access !== 'full_control') return 'forbidden'
    const before = roots.find((row) => String(row.root_folder_id) === beforeId)
    const after = roots.find((row) => String(row.root_folder_id) === afterId)
    if (before !== undefined && after !== undefined &&
        String(before.tab_position) >= String(after.tab_position)) return 'invalid_order'
    const position = keyBetween(before === undefined ? null : String(before.tab_position),
      after === undefined ? null : String(after.tab_position))
    await tx.execute(sql`UPDATE profile_doc_roots SET tab_position = ${position}
      WHERE root_folder_id = ${rootId}::uuid`)
    return 'changed'
  })
}

export async function changeProfileDocAudience(
  db: Db,
  viewerId: string,
  projectId: string,
  personId: string,
  rootId: string,
  audience: ProfileDocAudience,
  grants: readonly ProfileDocGrant[],
): Promise<ChangeProfileDocAudienceResult> {
  return inTransaction(db, async (tx) => {
    const root = (await rowsOf(tx, sql`SELECT r.custody_project_id, r.profile_user_id
      FROM profile_doc_roots r JOIN folders f ON f.id = r.root_folder_id
      WHERE r.root_folder_id = ${rootId}::uuid
        AND f.deleted_at IS NULL AND f.archived_at IS NULL
      FOR UPDATE OF f`))[0]
    if (root === undefined || String(root.profile_user_id) !== personId) return 'not_found'
    const custody = root.custody_project_id === null ? null : String(root.custody_project_id)
    if (custody !== null && custody !== projectId) return 'not_found'
    if (custody !== null && audience === 'only_me') return 'forbidden'
    const project = await rowsOf(tx, liveProject(projectId))
    if (!project.length) return 'not_found'
    const members = await currentMembers(tx, projectId, viewerId, personId)
    const viewer = members.find((row) => String(row.user_id) === viewerId)
    if (viewer === undefined || (custody === null &&
        !members.some((row) => String(row.user_id) === personId))) return 'not_found'
    if (custody === null ? viewerId !== personId : viewer.access !== 'full_control') return 'forbidden'
    if (grants.length) {
      const ids = JSON.stringify(grants.map((grant) => grant.user_id))
      const people = await rowsOf(tx, sql`SELECT id FROM users
        WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(${ids}::jsonb))
          AND deleted_at IS NULL`)
      if (people.length !== grants.length) return 'invalid_person'
    }
    await tx.execute(sql`UPDATE profile_doc_roots
      SET audience = ${audience},
          audience_project_id = ${audience === 'project_members' ? projectId : null}::uuid
      WHERE root_folder_id = ${rootId}::uuid`)
    await tx.execute(sql`DELETE FROM profile_doc_grants WHERE root_folder_id = ${rootId}::uuid`)
    if (audience !== 'only_me') {
      for (const grant of grants) {
        await tx.execute(sql`INSERT INTO profile_doc_grants (root_folder_id, user_id, may_edit)
          VALUES (${rootId}::uuid, ${grant.user_id}::uuid, ${grant.may_edit})`)
      }
    }
    return 'changed'
  })
}
