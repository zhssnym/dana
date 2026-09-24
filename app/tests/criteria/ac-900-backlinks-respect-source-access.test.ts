/*
AC-900..AC-902: "Referenced from" (issue #214) answers only the referencing
documents the reader can open, refuses a target the reader cannot open as a
missing one, and reads names live rather than from a copy.

**Why these exist.** A backlink scan reads other people's documents by
construction: its query runs over every stored rich-content block that names
the target. A scan whose source scope slipped would disclose the name of a
Folder the reader was never in, with a 200 on it, and nothing structural would
notice. The ac-397 sweep covers the target gate's stranger 404; these cover
the source scope, which no sweep can see.

Spec: 7.24 ("Referenced from"), 7.0, 10.2.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { GetBacklinksResponse } from '../../src/shared/backlinks.js'
import type { DocumentTransaction, PageView } from '../../src/shared/pages.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  countRows,
  createFolder,
  expectStatus,
  seedMembership,
  seedTask,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac900')

const PRIVATE_NAME = 'ac900 owner only notes'
const SHARED_NAME = 'ac900 shared plan'

interface Stage {
  owner: Actor
  member: Actor
  stranger: Actor
  targetFolder: string
  taskId: string
  privateFolder: string
  sharedFolder: string
  sharedBlock: string
}
let staged: Stage | undefined

async function linkFrom(owner: Actor, folderId: string, href: string): Promise<string> {
  const page = await owner.browser.json(`/folders/${folderId}/page`, 'GET')
  expectStatus(page, 200, 'the owner reads the page before writing it (spec 7.16)')
  const blockId = randomUUID()
  const body: DocumentTransaction = {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: (page.json() as PageView).revision!,
    operations: [
      {
        op: 'put_block',
        id: blockId,
        block_kind: 'paragraph',
        text: 'see the task',
        rich_content: { version: 1, runs: [{ text: 'see the task', href }] },
        file_id: null,
        ref_folder_id: null,
        width_pct: null,
        checked: null,
      },
      {
        op: 'set_outline',
        items: [
          { kind: 'block', id: blockId, section_block_id: null, list_parent_block_id: null },
        ],
      },
    ],
  }
  const written = await owner.browser.json(`/folders/${folderId}/page/actions`, 'POST', body)
  expectStatus(written, 200, 'the owner writes a Dana Link into a page (spec 7.16, 7.24)')
  return blockId
}

async function stage(): Promise<Stage> {
  if (staged !== undefined) return staged
  const [owner, member, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
  const targetFolder = await createFolder(owner, 'ac900 target folder')
  await seedMembership(app.db, targetFolder, member.id)
  const taskId = await seedTask(app.db, {
    folderId: targetFolder,
    createdBy: owner.id,
    title: 'ac900 the task',
  })
  const privateFolder = await createFolder(owner, PRIVATE_NAME)
  const sharedFolder = await createFolder(owner, SHARED_NAME)
  await seedMembership(app.db, sharedFolder, member.id)
  await linkFrom(owner, privateFolder, `/app/tasks/${taskId}`)
  const sharedBlock = await linkFrom(owner, sharedFolder, `/app/tasks/${taskId}?from=page`)
  staged = {
    owner,
    member,
    stranger,
    targetFolder,
    taskId,
    privateFolder,
    sharedFolder,
    sharedBlock,
  }
  return staged
}

async function backlinks(actor: Actor, path: string): Promise<GetBacklinksResponse> {
  const response = await actor.browser.json(path, 'GET')
  expectStatus(response, 200, `${path} answers the reader's backlinks (spec 7.24)`)
  return response.json() as GetBacklinksResponse
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-900..902 referenced-from respects source access', () => {
  test('AC-900: a reader sees only the referencing documents they can open', async () => {
    const { owner, member, taskId, privateFolder, sharedFolder, sharedBlock } = await stage()

    /* The private source really holds the link, so the member's empty answer
       for it is a refusal and not an absence. */
    const stored = await countRows(
      app.db,
      sql`SELECT count(*)::int AS n FROM page_blocks
           WHERE folder_id = ${privateFolder}::uuid
             AND rich_content::text LIKE ${`%/app/tasks/${taskId}%`}`,
    )
    expect(stored).toBe(1)

    const mine = await backlinks(owner, `/tasks/${taskId}/backlinks`)
    expect(mine.results.map((row) => row.home_id).sort()).toEqual(
      [privateFolder, sharedFolder].sort(),
    )

    const theirs = await backlinks(member, `/tasks/${taskId}/backlinks`)
    expect(theirs.truncated).toBe(false)
    expect(theirs.results).toEqual([
      {
        surface: 'page',
        home: 'folder',
        home_id: sharedFolder,
        folder_id: sharedFolder,
        member_id: null,
        label: SHARED_NAME,
        block_ids: [sharedBlock],
      },
    ])
    expect(JSON.stringify(theirs)).not.toContain(PRIVATE_NAME)
    expect(JSON.stringify(theirs)).not.toContain(privateFolder)
  })

  test('AC-901: a reader who cannot open the target gets the 404 a missing id gets', async () => {
    const { stranger, taskId, targetFolder } = await stage()
    const missing = await stranger.browser.json(`/tasks/${randomUUID()}/backlinks`, 'GET')
    expectStatus(missing, 404, 'a missing target is 404 (spec 7.0)')
    for (const path of [`/tasks/${taskId}/backlinks`, `/folders/${targetFolder}/backlinks`]) {
      const refused = await stranger.browser.json(path, 'GET')
      expectStatus(refused, 404, `${path} must read as nonexistent to a stranger (spec 10.2)`)
      expect(refused.body).toBe(missing.body)
      expect(refused.body).not.toContain(SHARED_NAME)
    }
  })

  test('AC-902: the source label is read live, never copied', async () => {
    const { owner, member, taskId, sharedFolder } = await stage()
    const renamed = 'ac900 shared plan renamed'
    const patch = await owner.browser.json(`/folders/${sharedFolder}`, 'PATCH', { name: renamed })
    expectStatus(patch, 200, 'the owner renames the source folder (spec 7.4)')
    const after = await backlinks(member, `/tasks/${taskId}/backlinks`)
    expect(after.results.map((row) => row.label)).toEqual([renamed])
  })

  /* A Task document (#221) is a source too, scoped by the reader's access to
     that Task: a link in a Task document in a Folder the reader is not in is
     absent, and the one in a shared Folder answers with `home: 'task'`. */
  test('AC-900: a Task document source is filtered by access to its Task', async () => {
    const { owner, member, targetFolder, privateFolder, sharedFolder } = await stage()
    const target = await seedTask(app.db, {
      folderId: targetFolder,
      createdBy: owner.id,
      title: 'ac900 task-doc target',
    })
    const hiddenTitle = 'ac900 owner only task'
    const hiddenTask = await seedTask(app.db, {
      folderId: privateFolder,
      createdBy: owner.id,
      title: hiddenTitle,
    })
    const sharedTask = await seedTask(app.db, {
      folderId: sharedFolder,
      createdBy: owner.id,
      title: 'ac900 shared task',
    })
    const linkInTask = async (taskId: string): Promise<string> => {
      const read = await owner.browser.json(`/tasks/${taskId}/document`, 'GET')
      expectStatus(read, 200, 'the owner reads the Task document (spec 7.6)')
      const blockId = randomUUID()
      const href = `/app/tasks/${target}`
      const written = await owner.browser.json(`/tasks/${taskId}/document`, 'PUT', {
        action: 'document_transaction',
        mutation_id: randomUUID(),
        base_revision: (read.json() as PageView).revision,
        operations: [
          {
            op: 'put_block',
            id: blockId,
            block_kind: 'paragraph',
            text: 'depends on',
            rich_content: { version: 1, runs: [{ text: 'depends on', href }] },
            file_id: null,
            ref_folder_id: null,
            width_pct: null,
            checked: null,
          },
          {
            op: 'set_outline',
            items: [{ kind: 'block', id: blockId, section_block_id: null, list_parent_block_id: null }],
          },
        ],
      })
      expectStatus(written, 200, 'the owner links from a Task document (spec 7.6, 7.24)')
      return blockId
    }
    const hiddenBlock = await linkInTask(hiddenTask)
    const sharedBlock = await linkInTask(sharedTask)

    const stored = await countRows(
      app.db,
      sql`SELECT count(*)::int AS n FROM page_blocks
           WHERE id = ${hiddenBlock}::uuid AND task_id = ${hiddenTask}::uuid
             AND rich_content::text LIKE ${`%/app/tasks/${target}%`}`,
    )
    expect(stored).toBe(1)

    const mine = await backlinks(owner, `/tasks/${target}/backlinks`)
    expect(mine.results.map((row) => row.home_id).sort()).toEqual([hiddenTask, sharedTask].sort())

    const theirs = await backlinks(member, `/tasks/${target}/backlinks`)
    expect(theirs.results).toEqual([
      {
        surface: 'page',
        home: 'task',
        home_id: sharedTask,
        folder_id: sharedFolder,
        member_id: null,
        label: 'ac900 shared task',
        block_ids: [sharedBlock],
      },
    ])
    expect(JSON.stringify(theirs)).not.toContain(hiddenTitle)
    expect(JSON.stringify(theirs)).not.toContain(hiddenTask)

    // A trashed Task's document stops being a source, as its own read does.
    await app.db.execute(sql`UPDATE tasks SET deleted_at = now() WHERE id = ${sharedTask}::uuid`)
    expect((await backlinks(member, `/tasks/${target}/backlinks`)).results).toEqual([])
  })
})
