// One-off: load a plain pg_dump into PGlite, then write each live project as a workflow file that Import reads.
// Usage: npx tsx db/export-workflows.ts <dump.sql> <pglite-dir> <out-dir>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { TransactionRollbackError, sql } from 'drizzle-orm'

import { createDbClient } from './client.js'
import type { Db } from './client.js'
import { rowsOf } from '../src/server/database.js'
import { listLabels } from '../src/server/domain/labels.js'
import { pageView } from '../src/server/domain/pages.js'
import { readFolderDependencies } from '../src/server/domain/task-dependencies.js'
import { taskView } from '../src/server/domain/tasks.js'
import { folderOpenView } from '../src/server/views/folder.js'
import { purposeTab } from '../src/shared/folders.js'
import type { TaskDetail } from '../src/shared/tasks.js'
import { folderToWorkflowFile, importWorkflowBody } from '../src/shared/workflows.js'

const [dumpPath, dataDir, outDir] = process.argv.slice(2)
if (dumpPath === undefined || dataDir === undefined || outDir === undefined) {
  throw new Error('Usage: npx tsx db/export-workflows.ts <dump.sql> <pglite-dir> <out-dir>')
}

if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
  // psql meta-commands (\restrict) are not SQL. The dump sets search_path to '', so load on its own connection.
  const dump = readFileSync(dumpPath, 'utf8').replace(/^\\.*$/gm, '')
  const loader = await PGlite.create(dataDir, { extensions: { pg_trgm } })
  await loader.exec(dump)
  await loader.close()
}

delete process.env.TEST_DATABASE_URL
const client = await createDbClient({ dataDir })
await client.runMigrations()
const db = client.db
const transactional = db as unknown as { transaction<T>(run: (tx: Db & { rollback(): never }) => Promise<T>): Promise<T> }

// A project is its root row. The owner reads it, so every access check passes as in the product.
const projects = await rowsOf(
  db,
  sql`SELECT f.id, f.name, f.owner_id, f.archived_at IS NOT NULL AS archived,
             COALESCE(u.email, u.id::text) AS owner_email
      FROM folders f JOIN users u ON u.id = f.owner_id
      WHERE f.project_id = f.id AND f.deleted_at IS NULL
      ORDER BY u.email, f.name`,
)

const safe = (name: string): string => name.replace(/[<>:"/\\|?*\p{Cc}]/gu, '_').trim().slice(0, 80) || 'untitled'
const report: string[] = []
for (const project of projects) {
  const id = String(project.id)
  const owner = String(project.owner_email)
  const name = String(project.name)
  const viewerId = String(project.owner_id)
  // The product hides archived pages from every read. Show them only inside this transaction, then roll back.
  let saved: ReturnType<typeof folderToWorkflowFile> | undefined
  let pageItems = 0
  let openTasks = 0
  await transactional.transaction(async (db) => {
  await db.execute(sql`UPDATE folders SET archived_at = NULL, archived_by = NULL, archived_with_folder_id = NULL
                       WHERE project_id = ${id}::uuid AND archived_at IS NOT NULL`)
  const tabs = await rowsOf(
    db,
    sql`SELECT id, project_id, tab_position, kind, name FROM folders
        WHERE project_id = ${id}::uuid AND tab_position IS NOT NULL AND deleted_at IS NULL
        ORDER BY tab_position, id`,
  )
  const purpose = purposeTab(
    tabs.map((tab) => ({
      id: String(tab.id),
      project_id: String(tab.project_id),
      tab_position: String(tab.tab_position),
      kind: tab.kind as 'doc' | 'work' | 'discussion' | null,
      name: String(tab.name),
    })),
  )
  const open = await folderOpenView(db, viewerId, id)
  const pending = [...open.scheduled, ...open.unscheduled].filter((task) => task.status === 'pending')
  const tasks = (await Promise.all(pending.map((task) => taskView(db, viewerId, task.id)))).filter(
    (task): task is TaskDetail => task !== null,
  )
  const labels = await listLabels(db, viewerId, { scope: 'folder', state: 'active', folder_id: id })
  const page = await pageView(db, viewerId, { folderId: id, shelfId: null })
  saved = folderToWorkflowFile(
    name,
    tasks,
    page.blocks,
    page,
    labels.kind === 'folder_not_found' ? [] : labels.labels,
    purpose === undefined
      ? undefined
      : { display_name: purpose.name, page: await pageView(db, viewerId, { folderId: purpose.id, shelfId: null }) },
    await readFolderDependencies(db, id),
  )
  pageItems = page.items.length
  openTasks = tasks.length
  db.rollback()
  }).catch((error: unknown) => {
    if (!(error instanceof TransactionRollbackError)) throw error
  })
  if (saved === undefined) throw new Error(`no file for project ${id}`)
  const valid = importWorkflowBody.safeParse(saved.file)
  const dir = path.join(outDir, safe(owner))
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${safe(name)}-${id.slice(0, 8)}.dana.json`), JSON.stringify(saved.file, null, 2))
  report.push(
    [owner, name, project.archived === true ? 'archived' : 'live', pageItems, openTasks, saved.withheldTasks, saved.omitted, valid.success ? 'ok' : valid.error.issues[0]?.message].join('\t'),
  )
}
writeFileSync(path.join(outDir, 'report.tsv'), ['owner\tproject\tstate\tpage_items\topen_tasks\twithheld_tasks\tomitted_blocks\timport_check', ...report].join('\n'))
process.stdout.write(`${String(projects.length)} projects written to ${outDir}\n`)
await client.close()
