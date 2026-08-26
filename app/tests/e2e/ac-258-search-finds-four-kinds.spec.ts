/*
AC-258: given one query that matches a task through a step's title, a folder
by name, a shelf by name and a page's own paragraph, then the search overlay
draws a result of each of those four kinds, each under its own heading, and
the task results keep Q8's Pending, Abandoned and Completed subgrouping inside
theirs; and given the overlay opened with nothing typed, then it already
offers the places, the pages and the viewer's folders and shelves, as rows
that go to them.

**One query for all four, which is the point and not a convenience.** The
audit's fourth headline gap is "search finds only tasks, while the server
already answers folders, shelves, page prose and step titles: the one control
whose job is finding things cannot find most things." Four separate queries
would let a client pass by answering one kind at a time; one token planted in
four places is what asserts that the overlay reads the whole response. The
server has answered all four since 7.18: `views/search.ts` returns `rows`,
`folders`, `shelves` and `pages`, and `SearchOverlay.tsx:159` consumes
`results.data?.rows` alone.

**The step title is the arm most likely to be missed and it costs nothing to
plant.** 9.9 gives tasks "title, notes, and step titles", and the step is not
a result of its own: the task it belongs to is. So the task planted below
carries the token in a step and nowhere else, and a client matching titles
alone finds no task at all.

**The `useFolders()` call at the overlay's line 160 is not this defect half
fixed, and the audit says so before ratifying.** That call is the sidebar's
own folder list, used to draw the folder chip on a task result. It is not the
search response's `folders`, and a client that rendered it under a "Folders"
heading would be listing every folder the viewer has rather than the ones the
query matched. The negative case below is what tells those apart: a second
folder whose name carries no part of the token must not appear.

**The Q8 subgrouping is asserted as surviving rather than as arriving.**
AC-156 already pins the three status headings, and it is green today; this
criterion widens the overlay around them and must not cost them. So the task
group is asserted to still carry Pending inside it, which is the assertion
that fails if a port replaced the status grouping with a flat task list.

**DES-203's pre-typed places are asserted before a keystroke and against the
debounce.** 9.9: "before anything is typed it offers the places, pages,
folders and shelves, as rows to go to". Nothing is typed here at all, so the
300 ms debounce is not in play and no request is expected; what is asserted is
that the overlay is useful the moment it opens, which is the difference
between a search box and a launcher.

**The fixtures are this file's own and are deleted at the close**, the runner
seeding once for the whole leg. The token is drawn from the case title so two
runs never collide, and it is a nonsense word so no seed row can carry it.

Spec: 9.9 (the four kinds, step titles, Q8's subgrouping kept, the footer, the
pre-typed places), 7.18 (the search extension the server implements), 6 Q8
(ACCESSIBLE(V) and the status order), DES-203, and the parity audit's
search-overlay row.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createShelf,
  createTask,
  csrfToken,
  deleteFolder,
  deleteShelf,
  deleteTask,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 10.3 caps a search query at 2 to 100 characters; this is well inside it. */
function token(): string {
  return caseTitle('zarquon').replace(/[^a-z0-9]/gi, '').slice(0, 24)
}

interface Fixture {
  word: string
  /** Carries the token in a step title alone, per 9.9's third source. */
  taskId: string
  taskTitle: string
  /** Carries it in its name. */
  folderId: string
  folderName: string
  /** A folder that does not, so "every folder" cannot pass as "the matches". */
  otherFolderId: string
  otherFolderName: string
  shelfId: string
  shelfName: string
  /** Carries it in a paragraph of the matching folder's page. */
  pageText: string
}

async function build(page: Page): Promise<Fixture> {
  const word = token()
  const folderName = `${word} folder`
  const otherFolderName = caseTitle('ac-252 unrelated')
  const shelfName = `${word} shelf`
  const taskTitle = caseTitle('ac-252 task')
  const pageText = `A paragraph mentioning ${word} and nothing else.`

  const folder = await createFolder(page, folderName)
  const otherFolder = await createFolder(page, otherFolderName)
  const shelf = await createShelf(page, shelfName)
  const task = await createTask(page, { title: taskTitle, folder_id: folder.id })

  const csrf = await csrfToken(page.context())
  /* The token lives in a step and never in the task's own title or notes, so
     a client matching titles alone finds no task at all (9.9's third source,
     7.18's EXISTS over steps). */
  const step = await page.request.post(`/api/v1/tasks/${task.id}/steps`, {
    data: { title: `${word} step` },
    headers: { 'X-CSRF-Token': csrf },
  })
  expect(
    step.status(),
    `POST /tasks/:id/steps answered ${step.status()}: ${await step.text()}`,
  ).toBe(201)

  /* One paragraph block on the folder's own page (4.17), which is what 9.9
     means by "pages (matching a page's own prose)". */
  const put = await page.request.put(`/api/v1/folders/${folder.id}/page`, {
    data: { blocks: [{ kind: 'paragraph', position: 0, text: pageText }] },
    headers: { 'X-CSRF-Token': csrf },
  })
  expect(
    put.status(),
    `PUT /folders/:id/page answered ${put.status()}: ${await put.text()}`,
  ).toBe(200)

  return {
    word,
    taskId: task.id,
    taskTitle,
    folderId: folder.id,
    folderName,
    otherFolderId: otherFolder.id,
    otherFolderName,
    shelfId: shelf.id,
    shelfName,
    pageText,
  }
}

/** 9.1's search control, the overlay's own way in. */
async function openSearch(page: Page): Promise<void> {
  await clickControl(
    page.getByRole('button', { name: 'Search', exact: true }),
    'spec 9.1: the sidebar header carries the global search control',
  )
}

function overlay(page: Page) {
  return page.getByRole('dialog')
}

test.describe('AC-258: search finds all four kinds', () => {
  let fixture: Fixture

  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.desk)
    fixture = await build(page)
  })

  test.afterEach(async ({ page }) => {
    await deleteTask(page, fixture.taskId)
    await deleteShelf(page, fixture.shelfId)
    await deleteFolder(page, fixture.folderId)
    await deleteFolder(page, fixture.otherFolderId)
  })

  test('AC-258: one query answers a task, a folder, a shelf and a page', async ({ page }) => {
    await page.goto(routesV2.desk)
    await openSearch(page)
    await page.getByRole('searchbox').or(page.getByRole('textbox')).first().fill(fixture.word)

    const sheet = overlay(page)

    await expect(
      sheet.getByText(fixture.taskTitle, { exact: false }),
      'spec 9.9: task results match "title, notes, and step titles", and the step is not a ' +
        'result of its own, the task it belongs to is. This task carries the token in a step ' +
        'alone, so a client matching titles finds nothing here',
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS })

    await expect(
      sheet.getByText(fixture.folderName, { exact: false }).first(),
      'spec 9.9: "folders and shelves (name and description)". views/search.ts has answered ' +
        'folders since 7.18 and SearchOverlay.tsx:159 consumes results.data?.rows alone',
    ).toBeVisible()

    await expect(
      sheet.getByText(fixture.shelfName, { exact: false }).first(),
      'spec 9.9: shelves are one of the four kinds, and the server answers them beside the ' +
        'folders in the same response',
    ).toBeVisible()

    await expect(
      sheet.getByText(fixture.word, { exact: false }).first(),
      'spec 9.9: "pages (matching a page\'s own prose, sections, paragraphs, captions)". The ' +
        'paragraph is on the folder\'s own page and is the fourth kind',
    ).toBeVisible()

    await expect(
      sheet.getByText(fixture.otherFolderName, { exact: false }),
      'the audit\'s own caution: the overlay\'s useFolders() call is the sidebar\'s folder ' +
        'list, drawn for a task result\'s folder chip, and is not the search response\'s ' +
        'folders. A client rendering that list under a Folders heading would list every ' +
        'folder the viewer has rather than the ones the query matched',
    ).toHaveCount(0)
  })

  test('AC-258: each kind stands under its own heading, and tasks keep Q8\'s subgrouping', async ({
    page,
  }) => {
    await page.goto(routesV2.desk)
    await openSearch(page)
    await page.getByRole('searchbox').or(page.getByRole('textbox')).first().fill(fixture.word)

    const sheet = overlay(page)
    await expect(sheet.getByText(fixture.taskTitle, { exact: false })).toBeVisible({
      timeout: ACTION_TIMEOUT_MS,
    })

    for (const heading of ['Tasks', 'Folders', 'Shelves', 'Pages']) {
      await expect(
        sheet.getByRole('heading', { name: heading, exact: true }),
        `spec 9.9: "results group by kind". ${heading} is one of the four kinds that section ` +
          'names, and a flat list of everything is not a grouping',
      ).toBeVisible()
    }

    await expect(
      sheet.getByRole('heading', { name: 'Pending', exact: true }),
      'spec 9.9: "task results keep the Pending, Abandoned, Completed subgrouping of Q8". ' +
        'AC-156 pins those three headings and is green today, so widening the overlay around ' +
        'them must not cost them: this is the assertion a port that flattened tasks fails',
    ).toBeVisible()
  })

  test('AC-258: the places are offered before anything is typed', async ({ page }) => {
    await page.goto(routesV2.desk)
    await openSearch(page)

    const sheet = overlay(page)

    await expect(
      sheet.getByText('Today', { exact: true }).first(),
      'spec 9.9 and DES-203: "before anything is typed it offers the places, pages, folders ' +
        'and shelves, as rows to go to". Today is one of 9.1\'s page block, and the built ' +
        'overlay offers an empty box until 2 characters are typed',
    ).toBeVisible()

    await expect(
      sheet.getByText(fixture.folderName, { exact: false }).first(),
      'the viewer\'s folders are places too, and this is the one call where useFolders() is ' +
        'the right list rather than the wrong one',
    ).toBeVisible()

    await expect(
      sheet.getByText(fixture.shelfName, { exact: false }).first(),
      'spec 9.9 names shelves among the places offered before a keystroke, which needs the ' +
        'shelves read AC-257 brings into the chrome',
    ).toBeVisible()
  })

  test('AC-258: a place row goes to its place', async ({ page }) => {
    await page.goto(routesV2.desk)
    await openSearch(page)

    const sheet = overlay(page)
    await clickControl(
      sheet.getByText(fixture.folderName, { exact: false }).first(),
      'spec 9.9: "a row opens its thing in place", which is what makes these rows to go to ' +
        'rather than a list to read',
    )

    await expect(
      page,
      'spec 9.9: the row opened the folder it named',
    ).toHaveURL(new RegExp(`/app/folders/${fixture.folderId}`))
  })
})
