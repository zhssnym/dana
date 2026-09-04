/*
AC-393: the export arrives as a file, and a collection past 10.3's cap is cut
out loud.

Given a signed-in person, when they GET /api/v1/me/export, then the response
carries `Content-Type: application/json` and `Content-Disposition:
attachment; filename="dana-export-YYYY-MM-DD.json"`, the date being the one
the document reports as `exported_at`, so a browser saves it as a file rather
than rendering it. And given a folder holding one task more than 10.3's
1000-row cap, then that folder's `tasks` list is exactly 1000 long and
`truncated` names `folders.tasks`, rather than the list being silently short.

**The 1001st row is planted rather than asserted about.** The instruction
allowed asserting the constant instead if the fixture were expensive; it is
not. One INSERT with `generate_series` writes the whole thousand-and-one, so
this measures the cap being applied to real rows by real SQL — which is the
half a constant cannot prove, the window function in `domain/export.ts`
having been the likeliest thing to be wrong.

**Two requests, and no more.** 7.22's limiter is five per hour and is not
raised under test; `ac-392` records why.

Spec: 7.22, 10.3.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { EXPORT_ROW_CAP } from '../src/shared/export.js'
import {
  Cast,
  createTask,
  expectStatus,
  folderIn,
  requestExport,
  seedBulkTasks,
  startAuthTestApp,
} from './export-harness.js'
import type { Actor, AuthTestApp, ExportDocument } from './export-harness.js'
import { createFolder } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['saver', 'hoarder'], 'ac393')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
}, 60_000)

describe('AC-393 the export is an attachment and says what it cut', () => {
  test('it answers JSON with a dated attachment filename', async () => {
    const [saver] = (await cast.of(app)) as [Actor, Actor]
    const response = await requestExport(saver)

    expectStatus(response, 200, 'the export answers 200 (spec 7.22)')
    expect(
      response.contentType,
      'the document is JSON, whatever the browser is about to do with it',
    ).toContain('application/json')

    const document = response.json() as ExportDocument
    const day = document.exported_at.slice(0, 10)
    expect(
      /^\d{4}-\d{2}-\d{2}$/.test(day),
      'the filename\'s date comes from the document\'s own exported_at, so the two cannot disagree',
    ).toBe(true)
    expect(
      response.headers['content-disposition'],
      '7.22: a browser saves this rather than rendering it',
    ).toBe(`attachment; filename="dana-export-${day}.json"`)
  })

  test('a folder past the 1000-row cap is cut to it and named in truncated', async () => {
    const [, hoarder] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await createFolder(hoarder, 'Too many tasks')
    // One task through the API so the fixture is not made entirely of rows
    // no endpoint would produce, and the rest in one statement.
    await createTask(hoarder, folderId, 'the one written by hand')
    await seedBulkTasks(app.db, folderId, hoarder.id, EXPORT_ROW_CAP)

    const response = await requestExport(hoarder)
    expectStatus(response, 200, 'an account past the cap still exports')
    const document = response.json() as ExportDocument
    const folder = folderIn(document, folderId)

    expect(
      folder.tasks.length,
      `10.3 caps a list at ${String(EXPORT_ROW_CAP)} rows, and the export honours it per collection (spec 7.22)`,
    ).toBe(EXPORT_ROW_CAP)
    expect(
      document.truncated,
      'a cut collection is named rather than silently short, which is 10.3\'s "with truncated flag" applied per collection',
    ).toContain('folders.tasks')
    expect(
      document.truncated,
      'nothing else in this account is near the cap, so nothing else is named',
    ).toEqual(['folders.tasks'])
  })
})
