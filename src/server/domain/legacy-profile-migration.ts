import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { profileContent } from '../../shared/member-profile.js'
import type { ProfileArea } from '../../shared/member-profile.js'
import { inTransaction, rowsOf } from '../database.js'
import { initialKeys, keyBetween } from './fractional-index.js'
import { documentMetadata } from './page-document.js'

export interface LegacyProfileMigration {
  migrated: number
  retained: number
}

// Call at the profile UI cutover. The old writer refuses later edits to a
// migrated source, so a stale tab cannot overwrite a native Doc.
export async function migrateLegacyProfileWriting(
  db: Db,
  viewerId: string,
  projectId: string,
  memberId: string,
): Promise<LegacyProfileMigration> {
  return inTransaction(db, async (tx) => {
    const project = (await rowsOf(tx, sql`SELECT id, owner_id FROM folders
      WHERE id = ${projectId}::uuid AND project_id = id
        AND deleted_at IS NULL AND archived_at IS NULL FOR SHARE`))[0]
    if (project === undefined) return { migrated: 0, retained: 0 }
    const member = (await rowsOf(tx, sql`SELECT id FROM users
      WHERE id = ${memberId}::uuid AND deleted_at IS NULL FOR UPDATE`))[0]
    if (member === undefined) return { migrated: 0, retained: 0 }
    const access = await rowsOf(tx, sql`SELECT user_id FROM folder_members
      WHERE folder_id = ${projectId}::uuid
        AND user_id IN (${viewerId}::uuid, ${memberId}::uuid)`)
    if (!access.some((row) => String(row.user_id) === viewerId) ||
        !access.some((row) => String(row.user_id) === memberId))
      return { migrated: 0, retained: 0 }
    const sources = await rowsOf(tx, sql`SELECT area, content, revision, updated_at, updated_by
      FROM member_profile_sections
      WHERE project_id = ${projectId}::uuid AND member_id = ${memberId}::uuid
      ORDER BY area FOR UPDATE`)
    let migrated = 0
    let retained = 0
    for (const source of sources) {
      const area = source.area as ProfileArea
      const content = profileContent.parse(source.content)
      if (!content.blocks.length) continue
      const existing = await rowsOf(tx, sql`SELECT root_folder_id FROM profile_doc_migrations
        WHERE source_project_id = ${projectId}::uuid
          AND source_member_id = ${memberId}::uuid AND source_area = ${area}`)
      if (existing.length) continue
      // A legacy file belongs to the old project. Keep its whole area on the
      // attributed legacy surface until the files can move without widening access.
      if (content.blocks.some((block) => block.kind === 'file' || block.kind === 'image')) {
        retained += 1
        continue
      }
      const rootId = randomUUID()
      const last = (await rowsOf(tx, sql`SELECT max(tab_position) AS position
        FROM profile_doc_roots WHERE profile_user_id = ${memberId}::uuid`))[0]?.position
      const position = keyBetween(last == null ? null : String(last), null)
      const managed = area === 'project'
      const name = managed ? 'Project context' : 'Shared by teammate'
      const ownerId = managed ? String(project.owner_id) : memberId
      await tx.execute(sql`INSERT INTO folders
        (id, owner_id, name, project_id, kind, tab_position)
        VALUES (${rootId}::uuid, ${ownerId}::uuid, ${name}, ${rootId}::uuid, 'doc', 'a0')`)
      await tx.execute(sql`INSERT INTO profile_doc_roots
        (root_folder_id, profile_user_id, custody_project_id, audience_project_id,
         audience, tab_position)
        VALUES (${rootId}::uuid, ${memberId}::uuid,
          ${managed ? projectId : null}::uuid, ${projectId}::uuid,
          'project_members', ${position})`)
      const keys = initialKeys(content.blocks.length)
      for (const [index, block] of content.blocks.entries()) {
        if (block.kind === 'file' || block.kind === 'image') continue
        const text = block.content.runs.map((run) => run.text).join('')
        await tx.execute(sql`INSERT INTO page_blocks
          (id, folder_id, kind, position, page_position, text, rich_content, updated_at)
          VALUES (${randomUUID()}::uuid, ${rootId}::uuid, ${block.kind}, ${index},
            ${keys[index]}, ${text}, ${JSON.stringify(block.content)}::jsonb,
            COALESCE(${source.updated_at}::timestamptz, now()))`)
      }
      const metadata = await documentMetadata(tx, rootId)
      await tx.execute(sql`INSERT INTO page_document_receipts
        (actor_id, folder_id, mutation_id, payload_hash, committed_revision, created_task_ids)
        VALUES (${source.updated_by ?? ownerId}::uuid, ${rootId}::uuid,
          ${randomUUID()}::uuid, 'legacy-profile-migration', ${metadata.revision}, '[]'::jsonb)`)
      await tx.execute(sql`INSERT INTO profile_doc_migrations
        (source_project_id, source_member_id, source_area, root_folder_id,
         source_revision, source_content, source_updated_at, source_updated_by)
        VALUES (${projectId}::uuid, ${memberId}::uuid, ${area}, ${rootId}::uuid,
          ${Number(source.revision)}, ${JSON.stringify(content)}::jsonb,
          ${source.updated_at}::timestamptz, ${source.updated_by}::uuid)`)
      migrated += 1
    }
    return { migrated, retained }
  })
}
