/*
AC-780: a version 3 workflow file that declares one Folder Label name twice in
one folder is refused 422 naming the field, rather than reaching the database
and answering 500.

## The defect this pins, measured before it was fixed

`0022_labels.sql` carries
`CREATE UNIQUE INDEX labels_folder_name_idx ON labels (folder_id, lower(name))
WHERE scope = 'folder'`. The live create path knows about it: `insertLabel`
catches the 23505, `isDuplicateName` matches the constraint by name, and
`routes/labels.ts` answers 409 with a sentence about names being compared
without regard to case. **`createWorkflowFolderLabels` had none of that** — a
raw `INSERT … RETURNING id` in a loop — so a file naming one folder's Label
twice went through `canonicalWorkflowBody` unchallenged, hit the index, and
came back as:

```
500 {"error":{"code":"internal_error","message":"Something went wrong."}}
```

with a stack in the request log. The transaction rolled back, so nothing was
corrupted and no half-made folder was left behind; what was wrong was the
answer. A file that contradicts itself was told "Something went wrong" instead
of what was wrong with it.

## Why it is reachable, given that Dana's own writer cannot emit one

`folderToWorkflowFile` reads a live vocabulary the index has already made
unique, so no file this product writes can carry the collision — which is
exactly why no criterion saw it. It arrives from the cases the writer's own
comment names, **two files merged by hand and one folder renamed after the
other was written**, and from any hand-edited or third-party version 3 file.
That is the same population every other refusal in this schema is written for.

## Refused by the schema, and 422 rather than 409

7.16 says an import "validates name, colour and description by the same rules
a live create uses", so the rule is the ratified text's rather than this
criterion's; what was missing was the code. It is refused **before the first
write**, beside the two rules it now stands with — a key declared twice, and a
task naming a key its folder does not declare — because that is what makes the
answer a sentence its owner can act on rather than a SQLSTATE mapped back into
one.

**The status is 422 and deliberately not the live create's 409.** Those two
answer different questions. A 409 is a collision with a catalog that was
already there and that the caller could go and look at; this is one file
disagreeing with itself, which is precisely what an undeclared key is, and
AC-548 already fixes 422 for that.

## And the refusal is per folder, which the third case is here to hold

Scope is part of identity: two folders in one file may each hold an "Urgent"
and they are two Labels, exactly as two live folders may. A fix that folded
the names across the file would pass the first two cases and break a legitimate
template, so the third drives it and asserts both folders were created with
their own.

Spec: 7.16, 10.3, 4.15. Issue #227 area 4, #208 R4.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  folderLabelRows,
  importWorkflow,
  importWorkflowOk,
} from '../support/label-lifecycle-harness.js'

let app: AuthTestApp
const cast = new Cast(['importer'], 'ac780')

/** The one folder of a version 3 file, with whatever vocabulary a case wants
 * to give it. Written out rather than derived, so the shape a reader sees is
 * the shape the endpoint is handed. */
function oneFolder(
  labels: { key: string; name: string; color: string }[],
  tasks: { title: string; labels?: string[] }[] = [],
): unknown {
  return {
    dana: 'workflow',
    version: 3,
    name: 'ac780 the template',
    folders: [{ name: 'ac780 the template', labels, tasks }],
  }
}

/** The 422's own sentence. `sendFieldValidationError` writes
 * `<field>: <message>.`, so the field path is in the message rather than in a
 * structured body, and asserting it is what separates "the file was refused"
 * from "the file was refused for the reason this criterion is about". */
function messageOf(response: { json(): unknown }): string {
  return String(
    (response.json() as { error?: { message?: unknown } }).error?.message ?? '',
  )
}

/** Every folder this account owns whose name a case wrote, read from the
 * table: a 422 that had nonetheless created the folder would be a worse
 * defect than the 500, and the response alone cannot see it. */
async function foldersNamed(ownerId: string, name: string): Promise<string[]> {
  const found = (await app.db.execute(
    sql`SELECT id FROM folders
         WHERE owner_id = ${ownerId}::uuid AND name = ${name}
           AND deleted_at IS NULL
         ORDER BY created_at ASC`,
  )) as unknown as { rows: { id: unknown }[] }
  return found.rows.map((row) => String(row.id))
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-780 one folder, one Label name', () => {
  test('two labels with the same name in one folder are 422 naming the field, not 500', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const refused = await importWorkflow(
      importer,
      oneFolder(
        [
          { key: 'l1', name: 'Urgent', color: '#AA1122' },
          { key: 'l2', name: 'Urgent', color: '#112233' },
        ],
        [{ title: 'ac780 book the room', labels: ['l1'] }],
      ),
    )
    expect(
      refused.status,
      'a file naming one folder’s Label twice is refused before the first write: it used to reach 0022’s labels_folder_name_idx through createWorkflowFolderLabels’ raw INSERT and answer 500 with a stack in the log (spec 7.16; issue #227 area 4)',
    ).toBe(422)
    expect(
      messageOf(refused),
      'and the answer names the folder’s vocabulary, so its owner can find the two definitions rather than being told "Something went wrong"',
    ).toContain('folders.0.labels')
    expect(
      messageOf(refused),
      'in the same voice the live create uses for the same collision',
    ).toContain('without regard to case')
    expect(
      await foldersNamed(importer.id, 'ac780 the template'),
      'and nothing was created: the refusal is before the transaction rather than a rollback after it',
    ).toEqual([])
  })

  test('names that differ only in case are the same name, because the index is on lower(name)', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const refused = await importWorkflow(
      importer,
      oneFolder([
        { key: 'l1', name: 'Urgent', color: '#AA1122' },
        { key: 'l2', name: 'urgent', color: '#112233' },
      ]),
    )
    expect(
      refused.status,
      'labels_folder_name_idx is on (folder_id, lower(name)), so a check comparing the spellings byte for byte would let this pair through to the same 500 (spec 7.16, 10.3)',
    ).toBe(422)
    expect(messageOf(refused), 'naming the same field').toContain(
      'folders.0.labels',
    )
  })

  /* Killed by the same mutation as the first case rather than by the fold:
     `labelName` trims before the refinement runs, so both spellings are
     already the same string by the time either is compared. What this case
     holds is that the trim stays upstream of the check — the value compared
     is the value the INSERT would carry, so a file that spells one of the two
     with space around it is one collision rather than a new hole. */
  test('and names that differ only in surrounding space, which the name rule has already trimmed away', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const refused = await importWorkflow(
      importer,
      oneFolder([
        { key: 'l1', name: 'Urgent', color: '#AA1122' },
        { key: 'l2', name: '  Urgent  ', color: '#112233' },
      ]),
    )
    expect(
      refused.status,
      'the name the index sees is the trimmed one, so a file spelling one of the two with space around it is the same collision and meets the same 422 (spec 10.3)',
    ).toBe(422)
  })

  test('two folders of one file may each declare the same name, because scope is part of identity', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const made = await importWorkflowOk(importer, {
      dana: 'workflow',
      version: 3,
      name: 'ac780 two folders',
      folders: [
        {
          name: 'ac780 left',
          labels: [{ key: 'l1', name: 'Urgent', color: '#AA1122' }],
          tasks: [{ title: 'ac780 left work', labels: ['l1'] }],
        },
        {
          name: 'ac780 right',
          labels: [{ key: 'l1', name: 'Urgent', color: '#112233' }],
          tasks: [{ title: 'ac780 right work', labels: ['l1'] }],
        },
      ],
    })
    expect(
      made.map((folder) => folder.name),
      'both folders are created: one Folder’s "Urgent" and another’s are two Labels, and a refusal folded across the file would break a legitimate template (spec 4.15; issue #227 area 4)',
    ).toEqual(['ac780 left', 'ac780 right'])

    for (const folder of made) {
      expect(
        (await folderLabelRows(app.db, folder.id)).map((label) => label.name),
        `${folder.name} holds its own Urgent`,
      ).toEqual(['Urgent'])
    }
    const [left, right] = made
    const leftLabel = (await folderLabelRows(app.db, String(left?.id)))[0]
    const rightLabel = (await folderLabelRows(app.db, String(right?.id)))[0]
    expect(
      leftLabel?.id === rightLabel?.id,
      'and they are two rows rather than one shared between the folders',
    ).toBe(false)
    expect(
      [leftLabel?.color, rightLabel?.color],
      'each keeping the colour its own folder declared, which is what "not merged by name" looks like from the table',
    ).toEqual(['#AA1122', '#112233'])
  })
})
