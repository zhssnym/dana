/*
AC-281: given an account whose theme is Dark, when the application is opened
again on a device that has drawn it before, then the document's theme
attribute is `dark` from the first value it is ever given rather than after
the settings bundle answers; given the same account choosing System, then the
device keeps `system` and not the value it resolved to; and given a sign-out,
then the device keeps nothing.

Numbered at S27 by the Adversarial Test Engineer, the first free number after
AC-273 at the row's opening, and appended to section 12 beside the sentence
9.7 gained: "the theme is applied before first paint from a copy mirrored into
the browser, the 4.19 column staying the record".

**Why the first value written is the measurement.** RFC 0005 change control
item 43 recorded the flash: a fresh document paints 4.19's default while the
bundle read is in flight and takes the stored value when it answers, and
AC-261 deliberately asks "does it end up dark" rather than "is it dark on the
first frame", its own comment saying so. Item 43 ruled the inline pre-paint
script reading a `localStorage` mirror, the pattern Tailwind's dark mode
documentation prescribes and what GitHub does while also storing the theme on
the account. So this criterion asks the question AC-261 could not: an init
script watches the root element from before any page script runs and keeps
the first value `data-theme` is ever set to. Without the mirror that value is
what `shell/appearance.ts` writes for `system` on a light device, `light`,
and the bundle corrects it a moment later; with the mirror it is `dark`
before the bundle is even requested.

**The three constraints of item 43 are the three cases.** The column is the
truth and the mirror is a cache, which the first case reads by having the
mirror written by a visit rather than by the test. `system` mirrors as
`system`, which the second case reads off storage directly, because a device
that stored `light` for a person who chose to follow it has converted their
choice. And the mirror is cleared at sign-out, which the third case reads the
same way.

**The browser's own colour scheme is pinned light**, so `system` resolves to
`light` and a mirror that resolved before storing would be caught; and so
the first case's `dark` cannot be the device's opinion.

Spec: 9.7 (the sentence), 4.19 (the column), 11.4 (`data-theme` as what the
token file answers), RFC 0005 change control item 43 and item 52.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  patchBundle,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({
  timezoneId: 'UTC',
  actionTimeout: ACTION_TIMEOUT_MS,
  colorScheme: 'light',
})
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const MIRROR_KEY = 'dana:theme'

/** What the root's theme attribute was first set to, watched from before
 *  any page script runs. */
async function watchFirstTheme(page: Page): Promise<void> {
  await page.addInitScript(() => {
    /* At document start the root element does not exist yet, so the
       observer watches the document itself and reads the attribute off
       whichever element it changed on. */
    const view = globalThis as unknown as {
      document: unknown
      MutationObserver: new (
        callback: (records: { target: { getAttribute: (name: string) => string | null } }[]) => void,
      ) => {
        observe: (target: unknown, options: Record<string, unknown>) => void
      }
      __firstTheme?: string | null
    }
    /* Chromium can run this after the parser has executed the head's inline
       script, so the attribute may already be set: that value is the first
       one, and the observer catches every later write. */
    const root = (view.document as { documentElement?: { getAttribute: (name: string) => string | null } })
      .documentElement
    const already = root?.getAttribute('data-theme') ?? null
    if (already !== null) view.__firstTheme = already
    new view.MutationObserver((records) => {
      const first = records[0]
      if (view.__firstTheme === undefined && first !== undefined) {
        view.__firstTheme = first.target.getAttribute('data-theme')
      }
    }).observe(view.document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-theme'],
    })
  })
}

async function firstTheme(page: Page): Promise<string | null | undefined> {
  return page.evaluate(
    () => (globalThis as unknown as { __firstTheme?: string | null }).__firstTheme,
  )
}

async function mirror(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(key),
    MIRROR_KEY,
  )
}

test.describe('AC-281: the theme is on the document before first paint', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
  })

  test.afterEach(async ({ page }) => {
    await patchBundle(page, { theme: 'system' })
  })

  test('AC-281: a device that has drawn Dark paints Dark first', async ({ page }) => {
    await patchBundle(page, { theme: 'dark' })
    /* One visit, which is what writes the mirror: item 43's write-through
       happens "wherever the 4.19 bundle is read", not in a test's own
       storage write. */
    await page.goto(routesV2.desk)
    await expect
      .poll(() => mirror(page), {
        message:
          'RFC 0005 change control item 43: the mirror is write-through, so a visit that ' +
          'read the bundle has left the choice in the browser',
      })
      .toBe('dark')

    await watchFirstTheme(page)
    await page.goto(routesV2.today)
    expect(
      await firstTheme(page),
      'spec 9.7: "the theme is applied before first paint from a copy mirrored into the ' +
        'browser". Without the inline script, the first value the root is given is what ' +
        'shell/appearance.ts resolves for the in-flight default, light on this device, and ' +
        'the person sees a white frame before the bundle answers',
    ).toBe('dark')
  })

  test('AC-281: System mirrors as System, never as what it resolved to', async ({ page }) => {
    await patchBundle(page, { theme: 'system' })
    await page.goto(routesV2.desk)
    await expect
      .poll(() => mirror(page), {
        message:
          'item 43: "system mirrors as system, not as what it resolved to, or a person whose ' +
          'choice is to follow their device is silently converted to a fixed theme by the ' +
          'first machine they sign in on"',
      })
      .toBe('system')
  })

  test('AC-281: a sign-out leaves nothing in the mirror', async ({ page }) => {
    await patchBundle(page, { theme: 'dark' })
    await page.goto(routesV2.settings)
    await expect.poll(() => mirror(page)).toBe('dark')

    await page
      .getByRole('region', { name: 'Account' })
      .getByRole('button', { name: 'Sign out', exact: true })
      .click()
    await page.waitForURL((url) => !url.pathname.startsWith('/app'))
    expect(
      await mirror(page),
      'item 43: the mirror is "cleared at sign-out so a shared device does not paint the ' +
        'previous person\'s theme"',
    ).toBeNull()
    /* Back in, so the afterEach can put the bundle back the way it found it. */
    await signIn(page, seedSubs.hassan)
  })
})
