/* AC-415's migration arm: stage legacy rows after 0015, then apply 0016 and
 * compare the resulting shared order with the page order the old client drew. */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { afterEach, describe, expect, test } from 'vitest'

let database: PGlite | undefined

afterEach(async () => {
  if (database !== undefined) await database.close()
  database = undefined
})

function migrations(): string[] {
  const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')
  return readdirSync(directory)
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort()
    .map((name) => path.join(directory, name))
}

describe('AC-415 migration 0016 preserves the legacy visible page', () => {
  test('loose tasks, Section intro, Section tasks, and following blocks backfill in that order', async () => {
    database = new PGlite({ extensions: { pg_trgm } })
    const files = migrations()
    for (const file of files.filter((name) => !name.endsWith('0016_compose_first_canvas.sql'))) {
      await database.exec(readFileSync(file, 'utf8'))
    }

    await database.exec(`
      INSERT INTO users (id, google_sub, email, display_name)
      VALUES ('00000000-0000-4000-8000-000000000001', 'ac415', 'ac415@example.test', 'AC 415');
      INSERT INTO folders (id, owner_id, name)
      VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Legacy');
      INSERT INTO folder_members (folder_id, user_id)
      VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001');
      INSERT INTO page_blocks (id, folder_id, kind, position, text) VALUES
        ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000002', 'section', 0, 'Section'),
        ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'paragraph', 1, 'Opening'),
        ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', 'image', 2, 'Image'),
        ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000002', 'section', 3, 'Next');
      INSERT INTO tasks (id, folder_id, title, created_by, section_block_id) VALUES
        ('00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000002', 'Loose', '00000000-0000-4000-8000-000000000001', NULL),
        ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000002', 'Inside', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010');
    `)

    await database.exec(readFileSync(files.find((name) => name.endsWith('0016_compose_first_canvas.sql')) as string, 'utf8'))
    const result = await database.query<{ kind: string; id: string }>(`
      SELECT kind, id FROM (
        SELECT 'block' AS kind, id, page_position FROM page_blocks
        UNION ALL
        SELECT 'task' AS kind, id, page_position FROM tasks
      ) items ORDER BY page_position, id
    `)
    expect(result.rows.map((row) => `${row.kind}:${row.id.slice(-2)}`)).toEqual([
      'task:20', 'block:10', 'block:11', 'task:21', 'block:12', 'block:13',
    ])
    const membership = await database.query<{ id: string; section_block_id: string | null }>(`
      SELECT id, section_block_id FROM page_blocks ORDER BY position
    `)
    expect(membership.rows.map((row) => row.section_block_id?.slice(-2) ?? null)).toEqual([
      null, '10', '10', null,
    ])
  })
})
