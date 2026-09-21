/*
POST /workflows/import against the file DES-206's own serialiser writes.

**Why a contract test rather than a criterion.** AC-201, AC-237, AC-272 and
AC-273 own this endpoint's behaviour and pass; every rule they assert is
asserted against the canonical `folders: [...]` arrangement, and none of them
is repeated here. What is asserted here is the thing no criterion covers and
the thing the reported defect actually was: the arrangement of the file. The
schema read one arrangement, and the serialiser at
`docs/design/prototype-v2/src/lib/workflow.ts` wrote another (that prototype
is deleted, `a7886df` on 2026-09-01, and is in git history before that
commit), one folder with its page and its work at the top level; so a file the
product handed a person was refused with "folders: expected array, received
undefined" and the Import
control answered "this is not a Dana workflow file". The route is unchanged
and `shared/workflows.ts` folds the arrangements into one before validation,
so what has to be proven on the wire is that the fold reaches the endpoint
intact: the whole keep-set of 7.16 arrives, and everything 7.16 excludes still
reaches nothing.

**And since #185, the same question asked of the file the product writes
*today*.** The two cases above are about a file an older Dana handed somebody;
the case at the foot of this file is about the current one — the bytes
`folderToWorkflowFile` produces, sent to the endpoint over the wire and read
back, with no object passed from one half to the other inside this process. The
arrangement is still what is being proven; it is just that the arrangement has
moved on, and "the endpoint reads what the writer writes" is a claim that has to
be re-made every time the format does.

Spec: 7.16 as amended (RFC 0005 change control item 44 B3, and #185's ordered
page), 10.2, 10.3, DES-206.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../../../tests/support/auth-harness.js'
import type { AuthTestApp } from '../../../tests/support/auth-harness.js'
import { Cast, expectStatus } from '../../../tests/support/folders-harness.js'
import type { Actor } from '../../../tests/support/folders-harness.js'
import { folderToWorkflowFile } from '../../shared/workflows.js'
import type { PageView } from '../../shared/pages.js'
import type { TaskDetail } from '../../shared/tasks.js'

let app: AuthTestApp
const cast = new Cast(['importer', 'other'], 'wfimport')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Detail extends Record<string, unknown> {
  notes?: unknown
  important?: unknown
  status?: unknown
  due_date?: unknown
  reminder?: { time_of_day?: unknown } | null
  steps?: Array<{ title?: unknown; done?: unknown }>
  assignee?: { id?: unknown } | null
}

describe('POST /workflows/import reads the file DES-206 writes', () => {
  test('the one-folder file imports whole, and imports nothing it must not', async () => {
    const [importer, other] = (await cast.of(app)) as [Actor, Actor]

    /* The serialiser's own shape, decorated with everything 7.16 excludes in
       the spellings an honest older export uses. */
    const response = await importer.browser.json(
      '/workflows/import?tz=UTC',
      'POST',
      {
        dana: 'workflow',
        version: 1,
        name: 'wfimport launch',
        glyph: 'rocket',
        color: '#123456',
        description: 'how we ship',
        items: [
          { kind: 'section', section: { id: 's1', name: 'wfimport before the day' } },
          { kind: 'paragraph', paragraph: { text: 'wfimport read this first' } },
          { kind: 'image', image: { id: 'i1', ratio: 1.7, data: 'AAAA' } },
        ],
        tasks: [
          {
            title: 'wfimport book the room',
            section: 's1',
            notes: 'wfimport ask for the big one',
            important: true,
            reminder: '08:30',
            steps: [
              { title: 'wfimport check the calendar', done: true },
              'wfimport send the invite',
            ],
            status: 'completed',
            due_date: '2026-01-01',
            assignee_id: other.id,
            comments: [{ body: 'wfimport what was said' }],
          },
        ],
      },
    )
    expectStatus(response, 201, 'the file the product writes imports (7.16)')
    const created = response.json() as { folders?: Array<{ id?: unknown; name?: unknown }> }
    const folderId = String(created.folders?.[0]?.id)
    expect(created.folders, 'the top-level file makes one folder').toHaveLength(1)
    expect(created.folders?.[0]?.name, 'named by the file').toBe('wfimport launch')

    const page = await importer.browser.json(`/folders/${folderId}/page`, 'GET')
    expectStatus(page, 200, 'the imported folder has a page (7.16)')
    const blocks = (page.json() as { blocks?: Array<{ kind?: unknown; text?: unknown }> })
      .blocks
    expect(
      blocks?.map((block) => [block.kind, block.text]),
      'the sections and paragraphs arrive in order and the image does not (7.16)',
    ).toEqual([
      ['section', 'wfimport before the day'],
      ['paragraph', 'wfimport read this first'],
    ])

    const listed = await importer.browser.json(
      `/folders/${folderId}/tasks?tz=UTC`,
      'GET',
    )
    expectStatus(listed, 200, 'the imported folder reads (Q7)')
    const cards = listed.json() as {
      scheduled?: Array<{ id?: unknown }>
      unscheduled?: Array<{ id?: unknown }>
    }
    const taskId = String(cards.scheduled?.[0]?.id ?? cards.unscheduled?.[0]?.id)
    expect(taskId, 'the file made exactly one task').not.toBe('undefined')

    const read = await importer.browser.json(`/tasks/${taskId}`, 'GET')
    expectStatus(read, 200, 'the imported task reads (7.6)')
    const detail = read.json() as Detail

    expect(detail.notes, 'the notes travel').toBe('wfimport ask for the big one')
    expect(detail.important, 'the star travels').toBe(true)
    expect(detail.reminder?.time_of_day, 'a HH:MM reminder travels').toBe('08:30')
    expect(
      (detail.steps ?? []).map((step) => String(step.title)),
      'the real step titles travel, in the file’s order, however each was written',
    ).toEqual(['wfimport check the calendar', 'wfimport send the invite'])

    expect(
      (detail.steps ?? []).map((step) => step.done),
      'every step arrives unticked',
    ).toEqual([false, false])
    expect(detail.status, 'every imported task stays pending').toBe('pending')
    expect(
      detail.assignee?.id,
      'assignments to other people do not travel: the task is the importer’s',
    ).toBe(importer.id)
    expect(
      detail.due_date,
      'the file’s own date does not travel; a reminder is anchored on the import day (7.16, AC-273)',
    ).not.toBe('2026-01-01')

    const thread = await importer.browser.json(
      `/folders/${folderId}/comments?task=${taskId}`,
      'GET',
    )
    expectStatus(thread, 200, 'the imported task has a thread to read (7.14)')
    expect(
      (thread.json() as { comments?: unknown[] }).comments,
      'conversations are not imported',
    ).toEqual([])
  })

  test('a bare-string step and a foreign reminder label do not refuse the file', async () => {
    const [importer] = (await cast.of(app)) as [Actor, Actor]

    const response = await importer.browser.json('/workflows/import', 'POST', {
      dana: 'workflow',
      version: 1,
      name: 'wfimport older export',
      tasks: [
        {
          title: 'wfimport older task',
          steps: ['wfimport step one', 'wfimport step two'],
          reminder: '1 hour before',
        },
      ],
    })
    expectStatus(
      response,
      201,
      'an older honest export is imported rather than refused (AC-201’s rule)',
    )
    const folderId = String(
      (response.json() as { folders?: Array<{ id?: unknown }> }).folders?.[0]?.id,
    )
    const listed = await importer.browser.json(
      `/folders/${folderId}/tasks?tz=UTC`,
      'GET',
    )
    const cards = listed.json() as { unscheduled?: Array<{ id?: unknown }> }
    const read = await importer.browser.json(
      `/tasks/${String(cards.unscheduled?.[0]?.id)}`,
      'GET',
    )
    const detail = read.json() as Detail
    expect(
      (detail.steps ?? []).map((step) => String(step.title)),
      'a step given as its title is a step with that title',
    ).toEqual(['wfimport step one', 'wfimport step two'])
    expect(
      detail.reminder,
      'a label 4.8 has no mode for is dropped, and the zone it would have needed is not demanded',
    ).toBeNull()
  })

  /*
  The round trip against the exact file the product exports (#185).

  **Nothing here builds a file.** `folderToWorkflowFile` is called with the
  three things `FolderPage.tsx` hands it, the result is serialised to JSON as
  the download is, and the JSON is posted. What is being proven is the
  arrangement on the wire, which is this file's whole subject: a file the
  product writes and the endpoint cannot read is the defect that opened this
  file in the first place, and it has now happened twice — once at #204, which
  bumped the version past a client check nobody had tied to the contract.
  */
  test('the file the product writes today is read by the endpoint, whole', async () => {
    const [importer] = (await cast.of(app)) as [Actor, Actor]

    const source = await importer.browser.json('/folders', 'POST', {
      name: 'wfimport composed',
    })
    expectStatus(source, 201, 'the source folder must stage (7.4)')
    const sourceId = String((source.json() as { id?: unknown }).id)

    const heading = randomUUID()
    const note = randomUUID()
    const work = randomUUID()
    const page = await importer.browser.json(`/folders/${sourceId}/page`, 'GET')
    expectStatus(page, 200, 'the empty page must read (7.16)')
    expectStatus(
      await importer.browser.json(`/folders/${sourceId}/page/actions`, 'POST', {
        action: 'document_transaction',
        mutation_id: randomUUID(),
        base_revision: (page.json() as { revision: string }).revision,
        operations: [
          {
            op: 'put_block',
            id: heading,
            block_kind: 'section',
            text: 'wfimport before the day',
            rich_content: null,
            file_id: null,
            ref_folder_id: null,
            width_pct: null,
            checked: null,
          },
          {
            op: 'put_block',
            id: note,
            block_kind: 'paragraph',
            text: 'wfimport read this first',
            rich_content: null,
            file_id: null,
            ref_folder_id: null,
            width_pct: null,
            checked: null,
          },
          { op: 'create_task', id: work, title: 'wfimport book the room' },
          {
            op: 'set_outline',
            items: [
              { kind: 'block', id: heading, section_block_id: null, list_parent_block_id: null },
              { kind: 'block', id: note, section_block_id: heading, list_parent_block_id: null },
              { kind: 'task', id: work, section_block_id: heading, list_parent_block_id: null },
            ],
          },
        ],
      }),
      200,
      'the composed page must save (7.16)',
    )

    const read = await importer.browser.json(`/folders/${sourceId}/page`, 'GET')
    expectStatus(read, 200, 'the composed page must read back (7.16)')
    const view = read.json() as PageView
    const detail = await importer.browser.json(`/tasks/${work}`, 'GET')
    expectStatus(detail, 200, 'the task detail must read (7.6)')
    const saved = folderToWorkflowFile(
      'wfimport composed',
      [detail.json() as TaskDetail],
      view.blocks,
      view,
      [],
    )

    /* Over the wire as bytes, because that is what a download is. */
    const imported = await importer.browser.json(
      '/workflows/import?tz=UTC',
      'POST',
      JSON.parse(JSON.stringify(saved.file)) as unknown,
    )
    expectStatus(
      imported,
      201,
      'the endpoint reads the file the product writes; a version the picker or the schema does not know is how this broke at #204 (7.16, #185)',
    )
    const madeId = String(
      (imported.json() as { folders: { id: string }[] }).folders[0]?.id,
    )

    const madePage = await importer.browser.json(`/folders/${madeId}/page`, 'GET')
    expectStatus(madePage, 200, 'the imported page reads (7.16)')
    const made = madePage.json() as PageView
    const madeHeading = made.blocks.find((block) => block.kind === 'section')
    expect(
      made.blocks.map((block) => [block.kind, block.text]),
      'the writing arrives in the file’s order',
    ).toEqual([
      ['section', 'wfimport before the day'],
      ['paragraph', 'wfimport read this first'],
    ])
    expect(
      made.blocks.find((block) => block.kind === 'paragraph')?.section_block_id,
      'under the heading it was under, on an id this import minted',
    ).toBe(madeHeading?.id)
    expect(
      made.task_placements?.map((place) => place.section_block_id),
      'and so is the work, which is the relationship the file could not carry before #185',
    ).toEqual([madeHeading?.id])
    expect(
      made.items.map((item) => item.kind),
      'in one page sequence, the Task at its own position among the writing (4.17)',
    ).toEqual(['block', 'block', 'task'])
  })

  /*
  The zone, asked for wherever the Task is written (#185).

  **This is the arrangement question again and it is the one that would have
  gone quiet.** 7.16 requires tz exactly when the file carries a Task with a
  repeat or a reminder, because 4.5 and 8.6 admit neither without a date. That
  test reads the file's own Tasks — and format 4 moved where a Task is written.
  A reader that kept looking only at `folders[].tasks` would find none, ask for
  no zone, and hand the insert a repeat with a null date; what a caller would
  see is not a helpful 422 but whatever the database says about the row.

  Kept here rather than as a criterion because the rule is AC-273's and has not
  moved; what is proven is that the new arrangement reaches it.
  */
  test('a repeat written as a page block asks for a zone exactly as one in a collection does', async () => {
    const [importer] = (await cast.of(app)) as [Actor, Actor]
    const file = {
      dana: 'workflow',
      version: 4,
      name: 'wfimport weekly',
      folders: [
        {
          name: 'wfimport weekly',
          page: {
            blocks: [
              {
                kind: 'task',
                title: 'wfimport water the plants',
                recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
              },
            ],
          },
        },
      ],
    }

    const refused = await importer.browser.json('/workflows/import', 'POST', file)
    expectStatus(
      refused,
      422,
      'a repeat on the page needs 4.5’s anchor, so the zone is required (7.16, AC-273)',
    )
    expect(refused.body, 'and the caller is told which parameter').toContain('tz')

    const accepted = await importer.browser.json(
      '/workflows/import?tz=UTC',
      'POST',
      file,
    )
    expectStatus(accepted, 201, 'and with a zone it imports (7.16)')
    const madeId = String(
      (accepted.json() as { folders: { id: string }[] }).folders[0]?.id,
    )
    const listed = await importer.browser.json(
      `/folders/${madeId}/tasks?tz=UTC`,
      'GET',
    )
    expectStatus(listed, 200, 'the imported folder reads (Q7)')
    const cards = listed.json() as {
      scheduled?: { id: string }[]
      unscheduled?: { id: string }[]
    }
    const read = await importer.browser.json(
      `/tasks/${String(cards.scheduled?.[0]?.id ?? cards.unscheduled?.[0]?.id)}`,
      'GET',
    )
    expectStatus(read, 200, 'and the task reads (7.6)')
    expect(
      (read.json() as { recurrence_rule?: unknown }).recurrence_rule,
      'with its repeat, anchored on the import day in the zone the request named',
    ).toBe('FREQ=WEEKLY;BYDAY=MO')
  })

  /*
  A page the schema reads and `applyDocument` refuses, and where the caller is
  told it came from (#185, and the adversarial review of it).

  **Two validators answer this endpoint and only one of them used to name a
  field.** `readWorkflowPage` does the index arithmetic and reports through zod,
  so its refusals arrive addressed from the root — `folders.0.page.blocks.1.kind`
  — which is what AC-824 asserts. The structural rules are the document
  transaction's, deliberately: contiguous Sections, three heading levels, a
  nested list item in its list parent's Section. Those are the rules a person's
  own save is refused by and there is one implementation of them, which is the
  whole argument of this branch. But `applyDocument` works in minted ids and
  knows nothing about a file, so its refusal reached the caller as a rule with
  no address, and a file with two folders in it was answered "A nested list item
  belongs to its list parent's Section." with no way to tell which page.

  The importer now attaches `folders.<n>.page` on the way out and the route
  sends it through the one field formatter, so a structural refusal reads like a
  schema one. **Two folders on purpose**, with the fault in the second: an index
  that is always zero would pass a one-folder case and say nothing.

  Kept here rather than in AC-824 because the criterion pins "a version 4 page
  cannot claim what the import discards" and this refusal is not one of its
  claims — the file is arithmetically sound and structurally impossible. What is
  proven here is the wire shape, which is this file's subject.
  */
  test('a page the document transaction refuses is answered with the folder it came from', async () => {
    const [importer] = (await cast.of(app)) as [Actor, Actor]

    const bullet = 'wfimport open the cupboard'
    const refused = await importer.browser.json('/workflows/import', 'POST', {
      dana: 'workflow',
      version: 4,
      name: 'wfimport two folders',
      folders: [
        {
          name: 'wfimport the sound one',
          page: { blocks: [{ kind: 'paragraph', text: 'wfimport read this first' }] },
        },
        {
          name: 'wfimport the impossible one',
          page: {
            blocks: [
              /* A list at the page root, a heading after it, and an item under
                 the first that the heading has swallowed. Every index resolves,
                 so the schema is content; the list is in two Sections at once,
                 which #219 refuses and nothing in the file can see. */
              { kind: 'bullet', text: bullet },
              { kind: 'section', text: 'wfimport the room' },
              { kind: 'bullet', text: 'wfimport unlock it', list_parent: 0 },
            ],
          },
        },
      ],
    })
    expectStatus(
      refused,
      422,
      'the structural rules are applyDocument’s and it refuses this page (#219, 7.16)',
    )
    expect(
      refused.body,
      'and the caller is told which folder’s page, addressed from the root like every other field of this body (7.0)',
    ).toContain('folders.1.page')

    const folders = await importer.browser.json('/folders', 'GET')
    expectStatus(folders, 200, 'the folder list reads (7.4)')
    /* 7.4 answers a bare array, no wrapper. */
    expect(
      (folders.json() as { name?: unknown }[]).filter((folder) =>
        String(folder.name).startsWith('wfimport the '),
      ),
      'and neither folder was created — the refusal leaves by the path that rolls back',
    ).toEqual([])
  })
})
