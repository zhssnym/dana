/*
AC-551: exporting does not widen the privacy boundary. A task in somebody
else's Folder brings only the Label definitions that describe it, never that
Folder's unrelated vocabulary and never another person's Personal Labels; and a
saved View's Label criteria are carried exactly as stored, without resolving
metadata the viewer may not read.

## Where the line is, and why "only what describes this task" is the whole rule

`tasks_elsewhere` is the one place the export reaches into a Folder the viewer
does not own: a task they wrote, or one assigned to them, living in a
colleague's Folder. It has to carry enough for that task to be readable, which
means the definitions of the Folder Labels it actually wears. It must not carry
one Label more, because a colleague's taxonomy is a description of how that
colleague organises their work, and forty categories arriving in somebody
else's export file is a disclosure nobody asked for.

The fixture therefore gives the foreign Folder **two** Labels: one on the
viewer's own task and one on a task that is not theirs. The first must appear;
the second must be absent from the entire document, by id and by name.

## And the saved View

#227 area 6 says the backend keeps `user_views.definition` as generic JSON and
does not build a Label filtering engine. Two things follow for the export and
both are here: the criterion's Label ids come back **byte-identical**, because
dropping one would silently broaden the saved View — "tasks in Research"
becoming "tasks" — and no definition is added for a Label the viewer cannot
read, because that would be the disclosure the paragraph above is about. The
fixture names an inaccessible Label id in a saved View and asserts both.

Spec: 7.22, 4.19, 10.2, 10.9. Issue #227 areas 5 and 6, #208 R4.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  Cast,
  exportOf,
  startAuthTestApp,
} from '../support/export-harness.js'
import type { Actor, AuthTestApp } from '../support/export-harness.js'
import {
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from '../support/folders-harness.js'
import {
  createFolderLabel,
  createPersonalLabel,
  putTaskLabel,
} from '../support/labels-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['host', 'guest'], 'ac531')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-551 an export is the viewer’s data and stops there', () => {
  test('a foreign folder contributes the definitions on the viewer’s own task and no others', async () => {
    const [host, guest] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, host.id, guest.id)
    const hostFolder = await createFolder(host, 'ac531 the host’s folder')
    await addMemberOk(host, hostFolder, guest.id)

    const onGuestWork = await createFolderLabel(host, hostFolder, {
      name: 'ac531 describes the guest task',
    })
    const elsewhereInTheFolder = await createFolderLabel(host, hostFolder, {
      name: 'ac531 the host’s other category',
      description: 'ac531 a sentence the guest should never read',
    })
    const hostsPrivate = await createPersonalLabel(host, {
      name: 'ac531 the host’s private axis',
    })

    /* The guest's own work inside the host's folder: assigned to them, so
       `tasks_elsewhere` carries it. */
    const guestTask = await createTaskOk(
      host,
      {
        title: 'ac531 the guest’s work',
        folder_id: hostFolder,
        assignee_id: guest.id,
      },
      'the guest’s task must stage (spec 7.6)',
    )
    /* And a task of the host's that the guest has nothing to do with. */
    const hostTask = await createTaskOk(
      host,
      { title: 'ac531 the host’s work', folder_id: hostFolder },
      'the host’s task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(host, guestTask.id, onGuestWork.id),
      200,
      'the first folder label attaches to the guest’s task (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(host, hostTask.id, elsewhereInTheFolder.id),
      200,
      'the second attaches to the host’s own task (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(host, guestTask.id, hostsPrivate.id),
      200,
      'and the host classifies the guest’s task privately too (spec 7.0)',
    )

    const document = await exportOf(guest)
    const bytes = JSON.stringify(document)

    const foreign = document.tasks_elsewhere.find(
      (row) => row.id === guestTask.id,
    )
    expect(
      foreign,
      'the guest’s own work inside the host’s folder is in their export (7.22)',
    ).toBeDefined()
    expect(
      foreign?.folder_label_ids,
      'wearing the Folder Label that describes it',
    ).toEqual([onGuestWork.id])
    expect(
      (foreign?.folder_labels ?? []).map((label) => label.name),
      'and carrying that definition, so the reference means something (#227 area 5)',
    ).toEqual(['ac531 describes the guest task'])

    expect(
      bytes.includes(elsewhereInTheFolder.id),
      'the host’s other category is nowhere in the document: "only the definitions necessary to describe the exported foreign Task" is a rule about the *other* rows, not about the ones that arrive (#227 area 5)',
    ).toBe(false)
    expect(
      bytes.includes('ac531 a sentence the guest should never read'),
      'nor its description',
    ).toBe(false)
    expect(
      bytes.includes(hostsPrivate.id),
      'and the host’s Personal Label is absent, on a task the guest can read: never another user’s Personal Labels (#227 area 5, #208 R4)',
    ).toBe(false)
    expect(
      bytes.includes('ac531 the host’s private axis'),
      'by name as well as by id',
    ).toBe(false)
    expect(
      foreign?.personal_label_ids,
      'the guest has applied none of their own, so the array is empty rather than the host’s',
    ).toEqual([])

    expect(
      document.folders.some((row) => row.id === hostFolder),
      'and the host’s folder itself is not in the guest’s export at all, which is 7.22 unchanged',
    ).toBe(false)
  })

  test('a saved view’s label criteria survive verbatim and resolve nothing', async () => {
    const [host, guest] = (await cast.of(app)) as [Actor, Actor]
    const hostFolder = await createFolder(host, 'ac531 unreachable folder')
    const unreachable = await createFolderLabel(host, hostFolder, {
      name: 'ac531 unreachable label',
    })
    const guestOwn = await createPersonalLabel(guest, {
      name: 'ac531 the guest’s own',
    })

    /* A saved View naming both: one Label the guest owns, one they can never
       read. 4.19's definition is generic JSON and the server does not
       interpret it — which is exactly why the export must not start. */
    const definition = {
      kind: 'labels',
      any_of: [guestOwn.id, unreachable.id],
      note: 'ac531 stored verbatim',
    }
    const saved = await guest.browser.json('/views', 'POST', {
      name: 'ac531 saved view',
      definition,
    })
    expectStatus(saved, 201, 'the saved view must be created (spec 7.23)')

    const document = await exportOf(guest)
    const view = document.views.find((row) => row.name === 'ac531 saved view')
    expect(view, 'the saved view is in the export (7.22)').toBeDefined()
    expect(
      view?.definition,
      'its definition comes back exactly as stored, the inaccessible Label id included: dropping it would silently broaden the saved View, which #227 area 6 forbids by name',
    ).toEqual(definition)

    const carried = new Set(
      document.personal_labels.map((label) => label.id),
    )
    expect(
      carried.has(guestOwn.id),
      'the Label the guest owns is in their own catalog, as it would be with no saved View at all',
    ).toBe(true)
    expect(
      JSON.stringify(document.personal_labels).includes(
        'ac531 unreachable label',
      ),
      'and naming an inaccessible Label in a View definition does not pull its metadata into the document: the export adds what the viewer may read and nothing a criterion happens to mention (#227 area 6)',
    ).toBe(false)
    expect(
      document.folders.some((row) => row.id === hostFolder),
      'nor the folder it lives in',
    ).toBe(false)
  })
})
