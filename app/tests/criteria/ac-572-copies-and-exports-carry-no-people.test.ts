/*
AC-572: duplicating a Folder and importing a reusable workflow carry no roster,
no Access, no Responsibility and no self-edit grant; the account export carries
the exporting person's own Responsibility and nobody else's; and a permanent
Folder purge takes the Responsibility record with it.

Issue #230 required proofs 18, 19, 20 and 21. Product authority: #209 R10
"Export / duplication / workflows" and "Retention / purge".

## Four proofs, one question

All four ask "when work moves or is copied, do the people move with it", and
R10's answer is no in three directions and a narrow yes in the fourth:

- **duplication** makes the duplicator owner and Full control of a new Folder,
  and copies no member standing of any kind;
- **reusable workflows** are people-neutral: a file carries structure and
  nothing about who was in the Folder it came from;
- **account export** preserves the exporting person's own current and
  historical Responsibility, within the existing privacy boundary and no
  further;
- **purge** removes the Responsibility record under the Folder's own deletion
  lifecycle, which is the one place this data is destroyed on purpose.

## Why the negatives are asserted against the database and not only the wire

A duplicate that carried somebody's Responsibility would most likely show it in
a row rather than in a response -- the duplicate's own read would then look
perfectly ordinary. So the three negatives count rows in the two tables for the
new Folder and require zero, which is an assertion a response shape cannot
make.

## The export's boundary, stated as the thing it must not do

Two members of one Folder each write a Responsibility. Each exports. Each
document must appear in exactly one of the two files. And a Folder the exporter
has **left** must appear in neither, although its rows survive -- #230 names
that case exactly: "inaccessible former-Folder data merely because a historical
row exists".

Spec: 7.16, 7.18, 7.22, 7.13; #209 R10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder } from '../support/folder-access-harness.js'
import {
  Cast,
  countRows,
  expectStatus,
  removeMember,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  commitOk,
  documentRows,
  paragraph,
  recordOf,
  setSelfEditGrantOk,
  storedGrant,
} from '../support/responsibility-harness.js'
import { sql } from 'drizzle-orm'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac572')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Stage {
  owner: Actor
  member: Actor
  folderId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, member] = (await cast.of(app)) as [Actor, Actor]
  const folderId = await sharedFolder(app, owner, name, [
    [member, 'can_view'],
  ])
  await setSelfEditGrantOk(owner, folderId, member.id, true)
  await commitOk(
    owner,
    folderId,
    member.id,
    paragraph('Runs the Saturday inventory'),
  )
  await commitOk(owner, folderId, owner.id, paragraph('Holds the lease'))
  return { owner, member, folderId }
}

interface ExportDoc {
  version: number
  folders: { id: string; name: string; members: string[] }[]
  responsibilities: {
    folder: { id: string; name: string }
    content: unknown
    revisions: { revision_no: number }[]
  }[]
}

async function exportOf(actor: Actor): Promise<ExportDoc> {
  const response = await actor.browser.json('/me/export', 'GET')
  expectStatus(response, 200, '7.22: the account exports its own data')
  return response.json() as ExportDoc
}

describe('AC-572 copies and exports carry no other people', () => {
  test('AC-572 proof 18: a duplicated Folder has no roster, no Access standing, no Responsibility and no grant from its source', async () => {
    const { owner, folderId } = await stage('AC-572 duplicate')

    const duplicated = await owner.browser.json(
      `/folders/${folderId}/duplicate`,
      'POST',
      {},
    )
    expectStatus(duplicated, 201, '7.16: the folder is duplicated')
    const copyId = (duplicated.json() as { id: string }).id

    const members = await rows(
      app.db,
      sql`SELECT user_id FROM folder_members WHERE folder_id = ${copyId}::uuid`,
    )
    expect(
      members.map((row) => String(row.user_id)),
      'R10: "Folder duplication does not copy the member roster". The duplicator is the only member of their own new folder',
    ).toEqual([owner.id])
    expect(
      await storedGrant(app.db, copyId, owner.id),
      'and no self-edit grant travelled either',
    ).toBe(false)
    expect(
      await documentRows(app.db, copyId),
      '#230 proof 18: no source member Responsibility appears in the duplicate merely because the Work content was copied',
    ).toEqual([])
    expect(
      await recordOf(app.db, copyId),
      'and no member history',
    ).toEqual([])
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM folder_access_history
             WHERE folder_id = ${copyId}::uuid AND member_id <> ${owner.id}::uuid`,
      ),
      "nor anybody else's Access standing",
    ).toBe(0)

    // And the source is untouched by having been copied.
    expect(
      (await documentRows(app.db, folderId)).length,
      'the source folder still holds both documents',
    ).toBe(2)
  })

  test('AC-572 proof 19: a reusable workflow file declares no person, and importing one creates a people-neutral folder', async () => {
    const { owner, folderId } = await stage('AC-572 workflow')

    /* The file the importer accepts is the contract, so the strongest
       available assertion is against the schema rather than against one
       sample: a body naming members, access or responsibilities has those keys
       stripped by `z.object` and reaches nothing, which is what "carries no
       member identities" means on this surface. */
    const imported = await owner.browser.json('/workflows/import', 'POST', {
      dana: 'workflow',
      version: 2,
      folders: [
        {
          name: 'AC-572 imported',
          tasks: [{ title: 'AC-572 a step of the workflow' }],
          members: ['someone@example.test'],
          access: { 'someone@example.test': 'full_control' },
          responsibilities: [
            { member: 'someone@example.test', content: 'runs everything' },
          ],
        },
      ],
    })
    expectStatus(
      imported,
      201,
      'the file imports, and the three people-shaped keys are simply not part of the contract',
    )
    const created = (imported.json() as { folders: { id: string }[] }).folders
    const importedId = created[0]?.id
    expect(importedId, 'the import created a folder').toBeDefined()

    const members = await rows(
      app.db,
      sql`SELECT user_id FROM folder_members WHERE folder_id = ${String(importedId)}::uuid`,
    )
    expect(
      members.map((row) => String(row.user_id)),
      'R10: "reusable workflow export/import carries no member identities, Access or Responsibility documents"',
    ).toEqual([owner.id])
    expect(
      await documentRows(app.db, String(importedId)),
      '#230 proof 19: reusable Work is people-neutral in M1',
    ).toEqual([])
    expect(
      await recordOf(app.db, String(importedId)),
      'and carries no member history',
    ).toEqual([])
    void folderId
  })

  test("AC-572 proof 20: the export carries the exporting person's own Responsibility and nobody else's", async () => {
    const { owner, member, folderId } = await stage('AC-572 export')

    const ownersFile = await exportOf(owner)
    expect(
      ownersFile.version,
      "the document says which shape it is, so a reader refuses a version it does not know rather than guessing. The literal is written out rather than compared against `EXPORT_VERSION`, which would agree with the constant whatever the constant said. 5 and not 4 because 3 is #226's and 4 is #227's; `shared/export.ts` carries the chain",
    ).toBe(5)
    const ownersEntries = ownersFile.responsibilities.filter(
      (entry) => entry.folder.id === folderId,
    )
    expect(
      ownersEntries.length,
      'one entry for this folder: their own',
    ).toBe(1)
    expect(
      ownersEntries[0]?.content,
      'and it is what they wrote about themselves',
    ).toEqual(paragraph('Holds the lease'))

    const membersFile = await exportOf(member)
    const membersEntries = membersFile.responsibilities.filter(
      (entry) => entry.folder.id === folderId,
    )
    expect(
      membersEntries[0]?.content,
      "the member's own file carries their own document",
    ).toEqual(paragraph('Runs the Saturday inventory'))

    /* The boundary. Each document appears in exactly one of the two files,
       although both people can read both documents inside the application.
       An export is a file that leaves Dana, and #230 forbids carrying
       "confidential personnel information" out in somebody else's copy. */
    const ownersJson = JSON.stringify(ownersFile.responsibilities)
    const membersJson = JSON.stringify(membersFile.responsibilities)
    expect(
      ownersJson.includes('Runs the Saturday inventory'),
      "#230 proof 20: the owner's export does not carry another member's Responsibility, although the owner may read it in the application",
    ).toBe(false)
    expect(
      membersJson.includes('Holds the lease'),
      "and the member's export does not carry the owner's",
    ).toBe(false)
  })

  test('AC-572 proof 20: a folder the exporter has left appears in no export, although its rows survive', async () => {
    const { owner, member, folderId } = await stage('AC-572 export former')
    /* A phrase that exists nowhere else in this file's fixtures, so the
       whole-document search below means what it says. The cast is shared
       across cases here, and the same person holds a Responsibility in other
       folders of this file; a search for ordinary text would find one of
       those and read as a leak. */
    const SECRET = 'AC-572 only in the folder this person has left'
    await commitOk(owner, folderId, member.id, paragraph(SECRET))
    expectStatus(
      await removeMember(owner, folderId, member.id),
      204,
      'the member is removed',
    )

    const file = await exportOf(member)
    expect(
      file.responsibilities.filter((entry) => entry.folder.id === folderId),
      '#230 proof 20: "do not expose inaccessible former-Folder data merely because a historical row exists"',
    ).toEqual([])
    expect(
      JSON.stringify(file).includes(SECRET),
      'and the content does not reach the file by any other road either -- not through `folders[]`, not through a revision list',
    ).toBe(false)
    expect(
      (await documentRows(app.db, folderId, member.id)).length,
      'while the row is still on the folder, for the people who are still in it',
    ).toBe(1)
  })

  test('AC-572 proof 21: a permanent Folder purge removes its Responsibility documents and its record', async () => {
    const { owner, folderId } = await stage('AC-572 purge')
    expect(
      (await documentRows(app.db, folderId)).length,
      'two documents before the purge',
    ).toBe(2)

    expectStatus(
      await owner.browser.json(`/folders/${folderId}`, 'DELETE'),
      200,
      '7.13: the folder goes to Trash, which is recoverable and destroys nothing',
    )
    expect(
      (await documentRows(app.db, folderId)).length,
      'R10: soft delete preserves history -- a folder in Trash still holds its Responsibilities',
    ).toBe(2)

    expectStatus(
      await owner.browser.json(`/trash/folders/${folderId}`, 'DELETE'),
      204,
      '7.13: the owner permanently destroys it',
    )
    expect(
      await documentRows(app.db, folderId),
      'R10 "Retention / purge": permanent Folder purge removes its Responsibility documents under the Folder deletion lifecycle',
    ).toEqual([])
    expect(
      await recordOf(app.db, folderId),
      'and the record with them, which is what the folder_id cascade is for',
    ).toEqual([])
  })
})
