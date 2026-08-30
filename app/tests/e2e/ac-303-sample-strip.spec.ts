/*
AC-303: given a brand-new account, when it opens Desk, then the sample
strip stands above the page with the sample's folders in the sidebar; when
"Remove sample data" is pressed and the confirmation continued, then
DELETE /api/v1/sample is on the wire, the strip and the sample folders are
gone, the undo bar says so, and Settings offers Restore.

RFC 0005 change control item 60. Numbered additively at the delegated
sample-workspace row of 2026-08-30 after AC-302, the vitest half.

This spec is the one browser file that signs in with the sample on: the
harness declines it for every other, so the empty account those criteria
count on is what they get.
*/
import { expect, test } from '@playwright/test'

import { routesV2, signIn, waitForApiIdle, watchWire } from './harness.js'

const SUB = `ac303-sample-${Date.now()}`

test.describe('AC-303: the sample strip and its Remove flow', () => {
  test('AC-303: Remove takes the sample out from the strip in two presses', async ({ page }) => {
    await signIn(page, SUB, 'Ac303 Sample', undefined, { sample: true })
    const wire = watchWire(page)
    await page.goto(routesV2.desk)

    const strip = page.getByTestId('sample-strip')
    await expect(
      strip,
      'spec 9.13 as amended by item 60: the strip stands above Desk while the sample is present',
    ).toBeVisible()
    await expect(strip).toContainText('This is a sample workspace to show you around.')

    const nav = page.getByRole('navigation').first()
    await expect(
      nav.getByRole('link', { name: /Apartment move/ }),
      'the sample folders are in the sidebar (9.1)',
    ).toBeVisible()

    await strip.getByRole('button', { name: 'Remove sample data', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()

    await expect(
      page.getByRole('status').filter({ hasText: 'Sample workspace removed' }),
      'spec 9.1: the undo bar names the act it can take back',
    ).toBeVisible()
    await waitForApiIdle(page, 'the removal and the refetch it triggers have settled')

    expect(
      wire.mutations().some((call) => call.method === 'DELETE' && call.url.endsWith('/api/v1/sample')),
      'item 60: the strip removes through DELETE /api/v1/sample and nothing else',
    ).toBe(true)
    await expect(strip).toHaveCount(0)
    await expect(nav.getByRole('link', { name: /Apartment move/ })).toHaveCount(0)

    await page.goto(routesV2.settings)
    await expect(
      page.getByRole('button', { name: 'Restore sample data', exact: true }),
      'spec 9.7 as amended by item 60: the Settings row offers Restore once the sample is gone',
    ).toBeVisible()
  })
})
