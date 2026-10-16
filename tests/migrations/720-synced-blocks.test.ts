// #720: a real 0096 -> 0097 upgrade. Connected work becomes synced blocks, and no
// placement, edge or authored link loses its content.
import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { expect, test } from 'vitest'

const migrations = resolve('db/migrations')

interface Journal { entries: { idx: number; tag: string }[] }

function rich(runs: { text: string; href?: string }[]): string {
  return JSON.stringify({ version: 1, runs })
}

test('0097 turns placements and facet edges into synced blocks and keeps content on delete', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dana-720-forward-'))
  const oldMigrations = join(temp, 'migrations')
  let pg: PGlite | null = null
  try {
    const journal = JSON.parse(await readFile(join(migrations, 'meta/_journal.json'), 'utf8')) as Journal
    const previous = journal.entries.filter((entry) => entry.idx <= 96)
    await mkdir(join(oldMigrations, 'meta'), { recursive: true })
    await writeFile(join(oldMigrations, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: previous }))
    for (const entry of previous) await cp(join(migrations, `${entry.tag}.sql`), join(oldMigrations, `${entry.tag}.sql`))

    pg = await PGlite.create({ extensions: { pg_trgm } })
    await pg.exec("SET dana.step8 = 'on'")
    const db = drizzle(pg)
    await migrate(db, { migrationsFolder: oldMigrations })

    const owner = randomUUID()
    const root = randomUUID()
    const tab = randomUUID()
    const source = randomUUID()
    const edgeOnly = randomUUID()
    const placement = randomUUID()
    const promoted = randomUUID()
    await db.execute(sql`INSERT INTO users (id, google_sub, email, display_name, timezone)
      VALUES (${owner}::uuid, ${'m720-' + owner}, ${'m720-' + owner + '@example.invalid'}, 'Fixture', 'UTC')`)
    await db.execute(sql`INSERT INTO folders (id, owner_id, name, is_default, kind)
      VALUES (${root}::uuid, ${owner}::uuid, 'Work', false, 'work')`)
    await db.execute(sql`INSERT INTO folder_members (folder_id, user_id, access)
      VALUES (${root}::uuid, ${owner}::uuid, 'full_control')`)
    await db.execute(sql`INSERT INTO folders (id, owner_id, name, project_id, kind, tab_position)
      VALUES (${tab}::uuid, ${owner}::uuid, 'Research', ${root}::uuid, 'doc', 'a1')`)

    const marker = `/app/folders/${root}?connected-work=k&connected-facet=${tab}`
    await db.execute(sql`INSERT INTO page_blocks (id, folder_id, kind, position, text, rich_content) VALUES
      (${source}::uuid, ${root}::uuid, 'paragraph', 0, 'Plan', ${rich([{ text: 'Plan' }])}::jsonb),
      (${edgeOnly}::uuid, ${root}::uuid, 'paragraph', 1, 'Second', ${rich([{ text: 'Second' }])}::jsonb),
      (${placement}::uuid, ${tab}::uuid, 'paragraph', 0, 'Work',
        ${rich([{ text: 'Work', href: `${marker}&connected-source=${source}#block-${source}` }])}::jsonb),
      (${promoted}::uuid, ${tab}::uuid, 'paragraph', 1, 'Plan Work',
        ${rich([{ text: 'Plan ' }, { text: 'Work', href: `${marker}&connected-source=${source}&promoted-source=${source}#block-${source}` }])}::jsonb)`)
    await db.execute(sql`INSERT INTO page_block_facets (block_id, facet_id) VALUES
      (${source}::uuid, ${tab}::uuid), (${edgeOnly}::uuid, ${tab}::uuid)`)

    await migrate(db, { migrationsFolder: migrations })

    const rows = await db.execute(sql`SELECT id, kind, text, rich_content FROM page_blocks
      WHERE folder_id = ${tab}::uuid ORDER BY position, id`)
    const byId = new Map(rows.rows.map((row) => [String(row.id), row]))
    expect(byId.get(placement)).toMatchObject({ kind: 'synced', text: source, rich_content: null })
    expect(byId.get(promoted)).toMatchObject({
      kind: 'paragraph',
      rich_content: { version: 1, runs: [{ text: 'Plan ' }, { text: 'Work', href: `/app/folders/${root}#block-${source}` }] },
    })
    // The edge with a placement keeps one copy. The edge without one gets a copy.
    const copies = rows.rows.filter((row) => row.kind === 'synced').map((row) => String(row.text)).sort()
    expect(copies).toEqual([source, edgeOnly].sort())

    await db.execute(sql`DELETE FROM page_blocks WHERE id = ${source}::uuid`)
    const kept = await db.execute(sql`SELECT kind, text, rich_content FROM page_blocks WHERE id = ${placement}::uuid`)
    expect(kept.rows[0]).toMatchObject({ kind: 'paragraph', text: 'Plan', rich_content: { version: 1, runs: [{ text: 'Plan' }] } })
  } finally {
    if (pg !== null) await pg.close()
    await rm(temp, { recursive: true, force: true })
  }
}, 180_000)
