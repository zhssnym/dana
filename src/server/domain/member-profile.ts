/* #620: one project-scoped content document per teammate area.
 * Project context is written by Full control; Shared by teammate is written by the member.
 * Neither surface grants private document access or changes the source's permissions.
 */
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import {
  EMPTY_PROFILE_CONTENT,
  PROFILE_AREAS,
  profileContent,
} from '../../shared/member-profile.js'
import type { ProfileArea, ProfileContent, ProfileStanding } from '../../shared/member-profile.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

export interface ProfileSections {
  project: ProfileStanding
  shared: ProfileStanding
  /** Only filenames of files that still belong to this project. */
  file_names: Record<string, string>
}

const empty = (mayEdit: boolean): ProfileStanding => ({
  content: EMPTY_PROFILE_CONTENT,
  revision: 0,
  updated_at: null,
  updated_by: null,
  may_edit: mayEdit,
})

/** Caller has already gated membership and verified the target is a current member. */
export async function profileSectionsOf(
  db: Executor,
  projectId: string,
  memberId: string,
  viewerId: string,
  viewerFullControl: boolean,
): Promise<ProfileSections> {
  const result: ProfileSections = {
    project: empty(viewerFullControl),
    shared: empty(memberId === viewerId),
    file_names: {},
  }
  const rows = await rowsOf(db, sql`
    SELECT s.area, s.content, s.revision, s.updated_at,
           u.id AS editor_id, u.display_name AS editor_name, u.avatar_url AS editor_avatar
      FROM member_profile_sections s
      LEFT JOIN users u ON u.id = s.updated_by
     WHERE s.project_id = ${projectId}::uuid AND s.member_id = ${memberId}::uuid
  `)
  const files = new Set<string>()
  for (const row of rows) {
    if (!PROFILE_AREAS.includes(row.area as ProfileArea)) throw new Error('Unknown profile content area.')
    const area = row.area as ProfileArea
    const content = profileContent.parse(row.content)
    for (const block of content.blocks) {
      if (block.kind === 'file' || block.kind === 'image') files.add(block.file_id)
    }
    result[area] = {
      content,
      revision: Number(row.revision),
      updated_at: row.updated_at === null ? null : iso(row.updated_at),
      updated_by: row.editor_id === null ? null : {
        id: String(row.editor_id),
        display_name: row.editor_name === null ? null : String(row.editor_name),
        avatar_url: row.editor_avatar === null ? null : String(row.editor_avatar),
      },
      may_edit: area === 'project' ? viewerFullControl : viewerId === memberId,
    }
  }
  if (files.size) {
    const ids = JSON.stringify([...files])
    const fileRows = await rowsOf(db, sql`
      SELECT f.id, f.name FROM files f
      JOIN jsonb_array_elements_text(${ids}::jsonb) x(value) ON f.id = x.value::uuid
      JOIN folders home ON home.id = f.folder_id
      WHERE home.project_id = ${projectId}::uuid
    `)
    for (const file of fileRows) result.file_names[String(file.id)] = String(file.name)
  }
  return result
}

export type WriteProfileResult = 'written' | 'stale' | 'forbidden' | 'not_found' | 'invalid_file'

export async function writeProfileSection(
  db: Db,
  projectId: string,
  memberId: string,
  viewerId: string,
  area: ProfileArea,
  content: ProfileContent,
  baseRevision: number,
): Promise<WriteProfileResult> {
  return inTransaction(db, async (tx) => {
    // Serialize against membership and Access changes, including removing a member.
    const member = await rowsOf(tx, sql`
      SELECT user_id FROM folder_members
       WHERE folder_id = ${projectId}::uuid AND user_id = ${memberId}::uuid
       FOR UPDATE
    `)
    if (!member.length) return 'not_found'
    const viewer = await rowsOf(tx, sql`
      SELECT access FROM folder_members
       WHERE folder_id = ${projectId}::uuid AND user_id = ${viewerId}::uuid
       FOR UPDATE
    `)
    if (!viewer.length) return 'not_found'
    if (area === 'project' ? viewer[0]?.access !== 'full_control' : viewerId !== memberId)
      return 'forbidden'

    const linked = content.blocks.filter((block) => block.kind === 'file' || block.kind === 'image')
    if (linked.length) {
      const ids = JSON.stringify([...new Set(linked.map((block) => block.file_id))])
      const rows = await rowsOf(tx, sql`
        SELECT f.id, f.kind FROM files f
        JOIN jsonb_array_elements_text(${ids}::jsonb) x(value) ON f.id = x.value::uuid
        JOIN folders home ON home.id = f.folder_id
        WHERE home.project_id = ${projectId}::uuid
      `)
      const available = new Map(rows.map((row) => [String(row.id), String(row.kind)]))
      if (linked.some((block) => {
        const kind = available.get(block.file_id)
        return kind === undefined || (block.kind === 'image' ? kind !== 'image' && kind !== 'cover' : kind !== 'file')
      })) return 'invalid_file'
    }

    const previous = await rowsOf(tx, sql`
      SELECT revision FROM member_profile_sections
      WHERE project_id = ${projectId}::uuid AND member_id = ${memberId}::uuid
        AND area = ${area}
      FOR UPDATE
    `)
    if (previous.length ? Number(previous[0]?.revision) !== baseRevision : baseRevision !== 0)
      return 'stale'

    // Optimistic concurrency: two editors cannot silently overwrite one another.
    const payload = JSON.stringify(content)
    const stored = await rowsOf(tx, sql`
      INSERT INTO member_profile_sections
        (project_id, member_id, area, content, revision, updated_at, updated_by)
      VALUES (${projectId}::uuid, ${memberId}::uuid, ${area}, ${payload}::jsonb,
              1, now(), ${viewerId}::uuid)
      ON CONFLICT (project_id, member_id, area) DO UPDATE
        SET content = EXCLUDED.content,
            revision = member_profile_sections.revision + 1,
            updated_at = now(),
            updated_by = EXCLUDED.updated_by
      WHERE member_profile_sections.revision = ${baseRevision}
      RETURNING revision
    `)
    if (!stored.length) return 'stale'
    return 'written'
  })
}
