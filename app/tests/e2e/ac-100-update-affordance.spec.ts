/*
AC-100: given a new build is deployed mid-session, then the reload affordance
appears and no forced reload occurs.

10.6 states the rule in three clauses and the criterion carries two of them:
new versions activate on next load, an unobtrusive "Update available, reload"
affordance appears when one is detected mid-session, and there is no forced
reload. The second half is the one worth a criterion. A service worker that
calls skipWaiting and reloads the page is one line shorter than one that
does not, and it takes the page out from under whatever the person was
typing.

**A new build is simulated at the only place a browser looks for one.** An
update check refetches the registered service worker script and compares it
byte for byte; anything different is a new version. So this spec asks the
page which script its own registration was made from, serves that URL a body
with one comment appended, and asks the registration to update. Nothing here
names a filename or a plugin: the page names its own worker, which is what
keeps this a statement about 10.6 rather than about vite-plugin-pwa.

**No forced reload is asserted with a mark the page cannot carry across
one.** A value is set on the window before the update is triggered and read
after the affordance has appeared; a reload of any kind clears it. The wait
between the two is the assertion rather than a flake guard, because "no
forced reload" is a claim about what does not happen next.

**The affordance is a control, not a notice.** 10.6 offers the person a
reload, so the copy has to be on something they can act on, which is 9.1's
addressing sentence applied to a string 10.6 spells out.

If this leg cannot intercept the service worker script, the red lands on the
first assertion below with the script URL in its message rather than on the
criterion, which is the failure this file is arranged to distinguish.

Spec: 10.6 (the update rule and its copy), 11.4 (the prompt-for-update
registration flow), 9.1's addressing sentence.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  copy,
  expectServiceWorkerControl,
  routes,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const MARK = 'ac-100 session mark'

test.describe('AC-100: a new build arrives mid-session', () => {
  test('AC-100: the reload affordance appears and nothing reloads', async ({
    page,
    context,
  }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routes.myDay)
    await expectServiceWorkerControl(page)

    const scriptURL = await page.evaluate(async () => {
      const view = globalThis as unknown as {
        navigator: {
          serviceWorker: {
            getRegistration: () => Promise<
              { active: { scriptURL: string } | null } | undefined
            >
          }
        }
      }
      const registration = await view.navigator.serviceWorker.getRegistration()
      return registration?.active?.scriptURL ?? null
    })
    expect(
      scriptURL,
      'spec 10.6: the shell is precached by a service worker, and this spec asks the page ' +
        'which script its own registration holds rather than naming one. A null here is a ' +
        'page with no registered worker, which is AC-091\'s sentence failing rather than this one',
    ).not.toBeNull()

    // The deploy. One comment appended is a different script, which is the
    // whole of what an update check compares.
    await context.route(scriptURL as string, async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      await route.fulfill({
        response,
        body: `${body}\n// a new build, mid-session\n`,
      })
    })

    // The mark, set before the trigger and read after: a reload of any kind
    // takes it with it.
    await page.evaluate((mark: string) => {
      ;(globalThis as unknown as Record<string, unknown>)['__danaSessionMark'] = mark
    }, MARK)
    const before = page.url()

    await page.evaluate(async () => {
      const view = globalThis as unknown as {
        navigator: {
          serviceWorker: {
            getRegistration: () => Promise<{ update: () => Promise<unknown> } | undefined>
          }
        }
      }
      const registration = await view.navigator.serviceWorker.getRegistration()
      await registration?.update()
    })

    const affordance = page.getByRole('button', { name: copy.updateAvailable }).or(
      page.getByRole('link', { name: copy.updateAvailable }),
    )
    await expect(
      affordance,
      'spec 10.6: when a new version is detected mid-session an unobtrusive ' +
        `"${copy.updateAvailable}" affordance appears, and 11.4 names the registration flow ` +
        'that raises it. It is a control because the person is being offered a reload',
    ).toBeVisible({ timeout: 20_000 })

    // The waiting is the assertion. A worker that activates itself takes the
    // page with it, and it does so shortly after the update it just found.
    await page.waitForTimeout(3_000)
    const mark = await page.evaluate(
      () => (globalThis as unknown as Record<string, unknown>)['__danaSessionMark'] ?? null,
    )
    expect(
      mark,
      'spec 10.6: no forced reload. The mark set on this document before the update was ' +
        'detected is gone, which is what a reload does to it and what nothing else does',
    ).toBe(MARK)
    expect(
      page.url(),
      'spec 10.6: the person stays where they were until they choose otherwise',
    ).toBe(before)
    await expect(
      affordance,
      'the offer is still standing, which is what makes it an offer',
    ).toBeVisible()
  })
})
