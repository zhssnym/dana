/*
POST /workflows/import against the file DES-206's own serialiser writes.

**Why a contract test rather than a criterion.** AC-201, AC-237, AC-272 and
AC-273 own this endpoint's behaviour and pass; every rule they assert is
asserted against the canonical `folders: [...]` arrangement, and none of them
is repeated here. What is asserted here is the thing no criterion covers and
the thing the reported defect actually was: the arrangement of the file. The
schema read one arrangement, and the serialiser at
`docs/design/prototype-v2/src/lib/workflow.ts` writes another, one folder with
its page and its work at the top level; so a file the product handed a person
was refused with "folders: expected array, received undefined" and the Import
control answered "this is not a Dana workflow file". The route is unchanged
and `shared/workflows.ts` folds the arrangements into one before validation,
so what has to be proven on the wire is that the fold reaches the endpoint
intact: the whole keep-set of 7.16 arrives, and everything 7.16 excludes still
reaches nothing.

Spec: 7.16 as amended (RFC 0005 change control item 44 B3), 10.2, 10.3,
DES-206.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../../../tests/auth-harness.js'
import type { AuthTestApp } from '../../../tests/auth-harness.js'
import { Cast, expectStatus } from '../../../tests/folders-harness.js'
import type { Actor } from '../../../tests/folders-harness.js'

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
})
