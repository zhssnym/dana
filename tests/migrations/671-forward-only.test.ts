// #671: exercise a real 0091 -> 0096 upgrade on a disposable populated DB.
// Fresh-schema tests alone cannot detect a faulty in-place Facet backfill.
import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { expect, test } from 'vitest'

const migrations = resolve('db/migrations')

interface Journal {
  version: string
  dialect: string
  entries: { idx: number; tag: string; when: number; version: string; breakpoints: boolean }[]
}

test('0092-0096 add Facet identities without replacing populated 0091 content', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dana-671-forward-'))
  const oldMigrations = join(temp, 'migrations')
  let pg: PGlite | null = null
  try {
    const journal = JSON.parse(await readFile(join(migrations, 'meta/_journal.json'), 'utf8')) as Journal
    const previous = journal.entries.filter((entry) => entry.idx <= 91)
    const added = journal.entries.filter((entry) => entry.idx > 91)
    expect(previous.at(-1)?.tag).toBe('0091_profile_legacy_migration')
    expect(added.map((entry) => entry.tag)).toEqual([
      '0092_page_facets_foundation', '0093_page_facet_writes',
      '0094_page_facet_content_association', '0095_facet_document_receipts',
      '0096_page_facet_trash',
    ])

    await mkdir(join(oldMigrations, 'meta'), { recursive: true })
    await writeFile(join(oldMigrations, 'meta/_journal.json'), JSON.stringify({
      ...journal, entries: previous,
    }))
    for (const entry of previous) {
      await cp(join(migrations, `${entry.tag}.sql`), join(oldMigrations, `${entry.tag}.sql`))
    }

    pg = await PGlite.create({ extensions: { pg_trgm } })
    await pg.exec("SET dana.step8 = 'on'")
    const db = drizzle(pg)
    await migrate(db, { migrationsFolder: oldMigrations })

    const ownerId = randomUUID()
    const rootId = randomUUID()
    const childId = randomUUID()
    const docId = randomUUID()
    const archivedId = randomUUID()
    const profileId = randomUUID()
    const taskId = randomUUID()
    const childTaskId = randomUUID()
    const blockId = randomUUID()
    const childBlockId = randomUUID()
    const fileId = randomUUID()
    const beforeMarker = 'writing preserved across the forward migration'

    await db.execute(sql`
      INSERT INTO users (id, google_sub, email, display_name, timezone)
      VALUES (${ownerId}::uuid, ${'legacy-671-' + ownerId}, ${'legacy-671-' + ownerId + '@example.invalid'}, 'Migration fixture', 'UTC')
    `)
    await db.execute(sql`
      INSERT INTO folders (id, owner_id, name, is_default, kind)
      VALUES (${rootId}::uuid, ${ownerId}::uuid, 'Original Work', false, 'work')
    `)
    await db.execute(sql`
      INSERT INTO folder_members (folder_id, user_id, access)
      VALUES (${rootId}::uuid, ${ownerId}::uuid, 'full_control')
    `)
    await db.execute(sql`
      INSERT INTO folders (id, owner_id, name, project_id, kind, tab_position)
      VALUES (${docId}::uuid, ${ownerId}::uuid, 'Original Doc',
              ${rootId}::uuid, 'doc', 'a1')
    `)
    await db.execute(sql`
      INSERT INTO folders (id, owner_id, name, parent_folder_id, project_id, kind, child_position)
      VALUES (${childId}::uuid, ${ownerId}::uuid, 'Original Child',
              ${rootId}::uuid, ${rootId}::uuid, 'doc', 'a1')
    `)
    await db.execute(sql`
      INSERT INTO folders (id, owner_id, name, is_default, kind)
      VALUES (${archivedId}::uuid, ${ownerId}::uuid, 'Old Archived Work', false, 'work'),
             (${profileId}::uuid, ${ownerId}::uuid, 'Old Profile Doc', false, 'doc')
    `)
    await db.execute(sql`
      INSERT INTO folder_members (folder_id, user_id, access)
      VALUES (${archivedId}::uuid, ${ownerId}::uuid, 'full_control'),
             (${profileId}::uuid, ${ownerId}::uuid, 'full_control')
    `)
    await db.execute(sql`
      INSERT INTO profile_doc_roots (root_folder_id, profile_user_id, tab_position)
      VALUES (${profileId}::uuid, ${ownerId}::uuid, 'a0')
    `)
    await db.execute(sql`
      INSERT INTO tasks (id, folder_id, title, created_by)
      VALUES (${taskId}::uuid, ${rootId}::uuid, 'Original Work Task', ${ownerId}::uuid),
             (${childTaskId}::uuid, ${childId}::uuid, 'Original Child Task', ${ownerId}::uuid)
    `)
    await db.execute(sql`
      INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes)
      VALUES (${fileId}::uuid, ${ownerId}::uuid, ${rootId}::uuid,
              'image', 'original.png', 'image/png', 20)
    `)
    await db.execute(sql`
      INSERT INTO page_blocks (id, folder_id, kind, position, text)
      VALUES (${blockId}::uuid, ${rootId}::uuid, 'paragraph', 1, ${beforeMarker}),
             (${childBlockId}::uuid, ${childId}::uuid, 'paragraph', 1, 'Child writing')
    `)
    await db.execute(sql`UPDATE folders SET archived_at = now() WHERE id = ${archivedId}::uuid`)

    // The projection removes *only* fields the migration introduces.
    const snapshot = async (): Promise<string[]> => {
      const tables = [
        ['folders', 'containing_facet_id'],
        ['tasks', 'page_facet_id'],
        ['page_blocks', 'page_facet_id'],
      ] as const
      const values: string[] = []
      for (const [table, addedColumn] of tables) {
        // Only these fixed, hard-coded identifiers may be used in raw SQL.
        const query = sql.raw(`SELECT md5(coalesce(string_agg(
          md5((to_jsonb(t) - '${addedColumn}')::text), '' ORDER BY t.id), '')) AS digest
          FROM ${table} t`)
        const answer = await db.execute(query)
        values.push(String(answer.rows[0]?.digest))
      }
      return values
    }
    const before = await snapshot()
    await migrate(db, { migrationsFolder: migrations })
    expect(await snapshot()).toEqual(before)

    const facets = await db.execute(sql`
      SELECT f.id AS folder_id, pf.id AS facet_id, pf.page_id, pf.content_folder_id
        FROM folders f
        LEFT JOIN page_facets pf ON pf.content_folder_id = f.id
       WHERE f.id IN (${rootId}::uuid, ${childId}::uuid, ${docId}::uuid,
                      ${archivedId}::uuid, ${profileId}::uuid)
    `)
    expect(facets.rows).toHaveLength(5)
    for (const row of facets.rows) {
      expect(row.facet_id).toBeTruthy()
      expect(row.content_folder_id).toBe(row.folder_id)
    }
    expect(facets.rows.find((row) => row.folder_id === docId)?.page_id).toBe(rootId)
    const childFacet = facets.rows.find((row) => row.folder_id === childId)?.facet_id
    const rootFacet = facets.rows.find((row) => row.folder_id === rootId)?.facet_id
    expect(childFacet).toBeTruthy()
    expect(rootFacet).toBeTruthy()

    const content = await db.execute(sql`
      SELECT 'task' AS kind, id, page_facet_id FROM tasks
       WHERE id IN (${taskId}::uuid, ${childTaskId}::uuid)
      UNION ALL
      SELECT 'block' AS kind, id, page_facet_id FROM page_blocks
       WHERE id IN (${blockId}::uuid, ${childBlockId}::uuid)
    `)
    expect(content.rows).toHaveLength(4)
    for (const row of content.rows) {
      expect(row.page_facet_id).toBe(
        row.id === childBlockId || row.id === childTaskId ? childFacet : rootFacet,
      )
    }
    const originalChild = await db.execute(sql`
      SELECT parent_folder_id, containing_facet_id FROM folders WHERE id = ${childId}::uuid
    `)
    expect(originalChild.rows[0]).toMatchObject({
      parent_folder_id: rootId, containing_facet_id: rootFacet,
    })
    const archived = await db.execute(sql`
      SELECT archived_at IS NOT NULL AS archived FROM folders WHERE id = ${archivedId}::uuid
    `)
    expect(archived.rows[0]?.archived).toBe(true)
    const attachment = await db.execute(sql`SELECT id FROM files WHERE id = ${fileId}::uuid`)
    expect(attachment.rows).toHaveLength(1)
    const profile = await db.execute(sql`
      SELECT root_folder_id, profile_user_id FROM profile_doc_roots
       WHERE root_folder_id = ${profileId}::uuid
    `)
    expect(profile.rows[0]).toMatchObject({ root_folder_id: profileId, profile_user_id: ownerId })
  } finally {
    if (pg !== null) await pg.close()
    await rm(temp, { recursive: true, force: true })
  }
}, 180_000)
