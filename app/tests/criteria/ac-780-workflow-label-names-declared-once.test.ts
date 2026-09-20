/*
AC-780: **one fold, and it is the database's.** A version 3 workflow file that
declares one Folder Label name twice in one folder is refused 422 naming the
field rather than answering 500 — and a file whose two names only *JavaScript*
makes one is imported, because JavaScript is not what decides.

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

## The first fix was a second fold, and it broke the export

**This part is the criterion rather than a footnote to it**, which is why the
fourth case exists. The first fix refused the file in
`canonicalWorkflowBody.superRefine`, folding with JavaScript `toLowerCase()`,
and argued that the two folds' disagreements all ran in the safe direction —
this one being looser, so anything it let through still met the index.

**A single-string fold has no direction.** `toLowerCase` is idempotent, so for
any `x` whose two folds disagree, the pair `(x, x.toLowerCase())` is one name
to JavaScript and two to Postgres: a **false 422** for a file the database
would have taken, built from the very character offered as proof of the
opposite. Swept over all 63487 non-surrogate BMP code points against a
database built with the test leg's own clause, **nine disagree** — U+0130,
U+1C89, U+A7CB, U+A7CC, U+A7CE, U+A7D2, U+A7D4, U+A7DA, U+A7DC — plus Greek
final sigma, which is context-sensitive and is the one an ordinary file meets.
That is ten pairs, and every one of them is stricter in JavaScript than at the
index; none runs the other way.

And it reached the product, not only the theory. Two Folder Labels `ΦΩΣ` and
`φως` are both accepted live and sit in one folder, `lower()` answering `φωσ`
and `φως`; `folderToWorkflowFile` writes both; re-importing that file met
`422 folders.0.labels: … the name "ΦΩΣ" is declared twice`. **Dana could not
import its own export** — the same class as this branch's own commit 593b22e.

So the fold was deleted and the SQLSTATE is mapped instead:
`createWorkflowFolderLabels` turns 23505 on `labels_folder_name_idx` into
`WorkflowLabelNameConflict`, and the route answers the same 422, with the same
`folders.<n>.labels` path and the same sentence the refinement wrote. A caller
cannot tell which mechanism refused them, and there is nothing left that can
drift out of step with the index.

**The mapping is gone and the fold is not (2026-09-20, issue #279), and this
criterion did not move with it.** That paragraph describes the mechanism as it
stood for a day: one INSERT per definition, and a catch around it. The
vocabulary is written by one multi-row INSERT now, because 250 definitions per
folder and 50 folders per file was 12,500 awaited round trips inside the
import's write transaction — and a multi-row INSERT raises its 23505 once for
the statement, naming the constraint and not the row, so a catch can no longer
say *which* definition. What refuses the file is the same `lower()`, run over
the file's own rows one statement ahead of the write and therefore in the same
session, under the same collation and ctype as the index: still one fold, still
the database's, which is the whole finding above. Nothing a caller can see
moved, which is why every case below is unchanged — they pin the answer and
this pins which statement produced it. The index is still underneath, where a
23505 now means the folder's catalog was not empty, which this path cannot
reach and a future caller could. `src/server/domain/workflow-label-writes.test.ts`
asserts the two things the cases below cannot: which of the two spellings the
message carries, and the folder index the importer handed over.

## Why a genuine collision is still reachable

`folderToWorkflowFile` reads a live vocabulary the index has already made
unique — **under Postgres's fold**, which is the fold the import now uses too.
So no file this product writes can carry a real collision, which is exactly why
no criterion saw the 500. It arrives from the cases the writer's own comment
names, **two files merged by hand and one folder renamed after the other was
written**, and from any hand-edited or third-party version 3 file. That is the
same population every other refusal in this schema is written for.

## 422 rather than 409, and it is not only taxonomy

7.16 says an import "validates name, colour and description by the same rules
a live create uses", so the rule is the ratified text's rather than this
criterion's; what was missing was the code.

**The status is 422 and deliberately not the live create's 409.** Those two
answer different questions. A 409 is a collision with a catalog that was
already there and that the caller could go and look at; this is one file
disagreeing with itself, which is precisely what an undeclared key is, and
AC-548 already fixes 422 for that. It shows at the screen as well:
`mutationFailureMessage` in `client/api/queryClient.ts` surfaces the server's
own sentence only for a 422 on a mutation carrying
`VALIDATION_ERROR_TOAST_META`, which `useImportWorkflowFile` carries, so a 409
would throw this sentence away and show a generic toast.

## And the refusal is per folder, which the last case is here to hold

Scope is part of identity: two folders in one file may each hold an "Urgent"
and they are two Labels, exactly as two live folders may. A fix that folded
the names across the file would pass the first three cases and break a
legitimate template, so the last drives it and asserts both folders were
created with their own. The index agrees, being on `(folder_id, lower(name))`
rather than on the name alone.

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
  taskFolderLabelIds,
  taskNamed,
  tasksByTitle,
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

/** Every Folder Label definition in the database carrying a name, whatever
 * folder holds it. `folderLabelRows` takes a folder id, and the folder whose
 * vocabulary a rolled-back import wrote no longer has one — so this is the
 * only way to ask whether the definitions the transaction *did* write before
 * it threw are still there. Names in this file are prefixed `ac780` so the
 * question stays about this file's rows. */
async function labelsNamed(name: string): Promise<string[]> {
  const found = (await app.db.execute(
    sql`SELECT id FROM labels
         WHERE scope = 'folder' AND name = ${name}`,
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
      'a file naming one folder’s Label twice is told so: the second INSERT raises 23505 on 0022’s labels_folder_name_idx, and until createWorkflowFolderLabels mapped it the raw error escaped and the answer was 500 with a stack in the log (spec 7.16; issue #227 area 4)',
    ).toBe(422)
    expect(
      messageOf(refused),
      'and the answer names the folder’s vocabulary, so its owner can find the two definitions rather than being told "Something went wrong" — the field path the schema’s own refusals use, because a caller should not be able to tell which mechanism refused them',
    ).toContain('folders.0.labels')
    expect(
      messageOf(refused),
      'in the same voice the live create uses for the same collision',
    ).toContain('without regard to case')
    expect(
      await foldersNamed(importer.id, 'ac780 the template'),
      'and nothing was created: the folder was made three statements before the vocabulary, and the throw out of the import transaction takes it back — a 422 that nonetheless left a half-made folder behind would be a worse defect than the 500',
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
      'labels_folder_name_idx is on (folder_id, lower(name)), so the index folds these two into one row and the mapping turns its 23505 into the same 422 (spec 7.16, 10.3)',
    ).toBe(422)
    expect(messageOf(refused), 'naming the same field').toContain(
      'folders.0.labels',
    )
  })

  /* Killed by the same mutation as the first case: `labelName` trims before
     the value ever reaches the INSERT, so both spellings are already the same
     string by the time the index sees either. What this case holds is that
     the trim stays upstream of the write — the value compared is the value
     stored, so a file that spells one of the two with space around it is one
     collision rather than a new hole. */
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

  /*
  The regression test for this whole finding, and the reason there is one fold
  rather than two.

  `lower('ΦΩΣ')` is `φωσ` with a medial sigma and `lower('φως')` is `φως` with
  a final one, so `labels_folder_name_idx` holds two rows and both Labels are
  live. JavaScript applies the final-sigma rule, so `'ΦΩΣ'.toLowerCase()` is
  `'φως'` — identical to the other, and the JS fold that stood here for a day
  refused this file at 422. `folderToWorkflowFile` writes exactly this file
  from exactly this folder, so the product could not import its own export.

  Driven through the endpoint rather than asserted about `lower()`, because
  what is pinned is the answer: 201, two definitions, each keeping its own
  colour, and a task wearing both.
  */
  test('two names only JavaScript folds together are two Labels, because the index is the only fold', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const made = await importWorkflowOk(importer, {
      dana: 'workflow',
      version: 3,
      name: 'ac780 the greek template',
      folders: [
        {
          name: 'ac780 the greek template',
          labels: [
            { key: 'l1', name: 'ΦΩΣ', color: '#AA1122' },
            { key: 'l2', name: 'φως', color: '#112233' },
          ],
          tasks: [{ title: 'ac780 light the room', labels: ['l1', 'l2'] }],
        },
      ],
    })
    expect(
      made.map((folder) => folder.name),
      'the file imports: lower() keeps ΦΩΣ and φως apart — φωσ against φως — so the index took both rows and nothing in front of it may say otherwise (spec 7.16; issue #227 area 4)',
    ).toEqual(['ac780 the greek template'])

    /* Sorted here rather than read in the order the table answered: that
       order is `lower(name)` under the leg's collation, which puts the final
       sigma first, and it is the database's business rather than this
       criterion's. Uppercase Greek precedes lowercase in code-unit order. */
    const labels = [...(await folderLabelRows(app.db, String(made[0]?.id)))]
    labels.sort((a, b) => (a.name < b.name ? -1 : 1))
    expect(
      labels.map((label) => [label.name, label.color]),
      'both definitions are there, spelled as the file spelled them, as two rows rather than one, each keeping the colour its own declaration carried',
    ).toEqual([
      ['ΦΩΣ', '#AA1122'],
      ['φως', '#112233'],
    ])

    const tasks = await tasksByTitle(app.db, String(made[0]?.id))
    expect(
      (await taskFolderLabelIds(
        app.db,
        taskNamed(tasks, 'ac780 light the room'),
      )).length,
      'and the task wears both keys, which is what a vocabulary of two is for',
    ).toBe(2)
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
      'both folders are created: one Folder’s "Urgent" and another’s are two Labels, and a refusal folded across the file — or an index on lower(name) alone — would break a legitimate template (spec 4.15; issue #227 area 4)',
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

  /*
  The path is the folder's own, and every other assertion of it in the suite
  is blind to that. Cases one to three above and AC-782's fourth all import a
  **one-folder** file and all assert `folders.0.labels`, so a `folderIndex`
  hard-wired to `0` — or a later refactor hoisting `createWorkflowFolderLabels`
  out of the indexed loop, which is the likelier way it goes — passes every one
  of them while telling the owner of a twenty-folder file to go and look at the
  wrong folder. This is the only case in the suite where the two differ.

  The first folder is clean and is imported before the second is refused, so
  its folder row, its Label and its task all exist when the throw happens: the
  row assertions below are about what the rollback takes back rather than about
  what was never written, which is the half a reading of the response alone
  cannot see.
  */
  test('the 422 names the folder the collision is in, not the first folder of the file', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const refused = await importWorkflow(importer, {
      dana: 'workflow',
      version: 3,
      name: 'ac780 the second folder',
      folders: [
        {
          name: 'ac780 clean first',
          labels: [{ key: 'l1', name: 'ac780 Someday', color: '#AA1122' }],
          tasks: [{ title: 'ac780 first work', labels: ['l1'] }],
        },
        {
          name: 'ac780 colliding second',
          labels: [
            { key: 'l1', name: 'ac780 Urgent', color: '#112233' },
            { key: 'l2', name: 'ac780 URGENT', color: '#334455' },
          ],
          tasks: [{ title: 'ac780 second work', labels: ['l1'] }],
        },
      ],
    })
    expect(
      refused.status,
      'the collision is in the second folder and is refused the same way the first would have been: labels_folder_name_idx raises 23505 on the second INSERT of that folder’s vocabulary, and createWorkflowFolderLabels maps it (spec 7.16, 10.3; issue #227 area 4)',
    ).toBe(422)
    expect(
      messageOf(refused),
      'and the field path is the index of the folder the two definitions are in rather than the first folder of the file: WorkflowLabelNameConflict is thrown with the folderIndex importWorkflow is iterating, and a hard-wired 0 — or a createWorkflowFolderLabels hoisted out of that loop — would send the file’s owner to a folder that has nothing wrong with it',
    ).toMatch(/^folders\.1\.labels: /)
    expect(
      messageOf(refused),
      'in the same voice as every other arrangement of this collision',
    ).toContain('without regard to case')

    expect(
      await foldersNamed(importer.id, 'ac780 clean first'),
      'and the folder the import had already finished is gone with the one it refused: the whole file is one transaction, so a first folder left standing would be half an import that the 422 says did not happen',
    ).toEqual([])
    expect(
      await foldersNamed(importer.id, 'ac780 colliding second'),
      'the refused folder no more than the clean one, it having been created three statements before its vocabulary was',
    ).toEqual([])
    expect(
      [
        ...(await labelsNamed('ac780 Someday')),
        ...(await labelsNamed('ac780 Urgent')),
      ],
      'and no definition survives either — the first folder’s was written and committed to nothing, and the second folder’s first name reached the table before its partner collided with it',
    ).toEqual([])
  })
})
