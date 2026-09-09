/*
AC-422: the compose-first folder canvas is quiet at rest without making a
precise insertion position depend on hover. Structural boundaries expose one
contextual plus on pointer or keyboard intent; prose remains writing-first;
and an empty page keeps one explicit continuation at its foot.

Issue #192 refines the controls around #184's editor model. It does not move
the mixed ordering or collapsed-Section semantics pinned by AC-415 to AC-420.
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  createFolder,
  createTask,
  effectiveOpacity,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-422: one task boundary plus reveals on intent and its menu dismisses cleanly', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folderName = caseTitle('AC-422 calm boundary')
  const folder = await createFolder(page, folderName)
  const first = await createTask(page, {
    title: caseTitle('AC-422 first task'),
    folder_id: folder.id,
  })
  await createTask(page, {
    title: caseTitle('AC-422 second task'),
    folder_id: folder.id,
  })
  await page.goto(routesV2.folder(folder.id))

  const firstNode = page.locator(`[data-canvas-node-id="${first.id}"]`)
  const plus = firstNode.getByRole('button', { name: 'Add between items', exact: true })
  const writingTarget = firstNode.getByRole('button', { name: 'Write here', exact: true })
  await expect(plus, 'a gap between native task rows remains a valid structural boundary').toHaveCount(1)

  await page.mouse.move(4, 4)
  expect(
    await effectiveOpacity(plus),
    'at rest the repeated gutter mark does not compete with the two task rows',
  ).toBeLessThan(0.1)

  await writingTarget.hover()
  await expect.poll(
    async () => effectiveOpacity(plus),
    'moving into this exact gap reveals its one contextual structural affordance',
  ).toBeGreaterThan(0.3)

  await page.mouse.move(4, 4)
  await plus.focus()
  await expect.poll(
    async () => effectiveOpacity(plus),
    'keyboard focus reveals the same affordance; insertion is not hover-only',
  ).toBeGreaterThan(0.3)

  await plus.click()
  await expect(page.getByText('Add here', { exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /^Task/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /^Section/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /^Image/ })).toBeVisible()

  await page.getByRole('heading', { name: folderName, exact: true }).click()
  await expect(
    page.getByText('Add here', { exact: true }),
    'an outside press dismisses the menu rather than leaving detached structure chrome behind',
  ).toHaveCount(0)
})

test('AC-422: an empty folder has one explicit writing continuation and active prose has no plus', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-422 empty continuation'))
  await page.goto(routesV2.folder(folder.id))

  const continuation = page.getByRole('button', { name: 'Do or write something…', exact: true })
  await expect(
    continuation,
    'an empty folder presents its first writing action without requiring pointer discovery',
  ).toBeVisible()
  await continuation.click()

  await expect(page.getByRole('textbox', { name: 'Page paragraph', exact: true })).toBeFocused()
  await expect(
    page.getByRole('button', { name: /^(?:Add to page|Add between items)$/ }),
    'active prose carries no plus; slash is the structural entry while writing',
  ).toHaveCount(0)
})
