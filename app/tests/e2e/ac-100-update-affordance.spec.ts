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

**The new build is real rather than simulated, and that is a repair.** This
file first tried to fake the deploy on the wire, with `context.route()`
returning a modified body for the worker's own script URL. It does not work,
and the reason is not a detail of how it was written: Playwright's request
interception does not see the browser's fetch of a service worker script
during `registration.update()`, so the route never fired, the script came
back byte-identical, no new version existed, and the affordance correctly
never appeared. The suite was reporting a client defect that was not there.
Two sessions measured it independently, one by driving every clause of this
criterion green through the mechanism below, the other by watching the
failure move from the shared precondition to this file's own sentence once a
worker controlled the page, which is what the diagnosis predicts and a
coincidence does not produce.

So the deploy happens where a deploy happens: the served artifact changes on
disk. One comment is appended to the file the page's own registration was
made from, `registration.update()` is called, and the bytes are put back
afterwards. Three reasons this is better than the interception it replaces,
rather than merely available.

It is what the criterion says. "A new build is deployed" is an event in the
world, and a byte change to the file the server serves is that event; a
fulfilled route was a picture of it. It is also exactly the platform's own
definition of a new version: an update check refetches the registered script
and compares it byte for byte, so a changed byte is a new version by the only
rule the browser applies. And it names nothing: the page is asked for its own
`scriptURL` and the path is derived from it, so no filename, plugin or output
layout is written down here, and a client that registered its worker at some
other path would still be measured.

What it costs is one write to `dist/client`, which is build output rather
than anyone's source: gitignored, rebuilt by `npm run e2e:app` at the start
of every run, and restored in a `finally` here regardless of how the case
ends. It is a fixture action of the same kind as seeding rows, performed on
the running system rather than on the repository, and it touches no owned
path. Recorded plainly because a reader should be able to disagree with it.

**No forced reload is asserted with a mark the page cannot carry across
one.** A value is set on the window before the update is triggered and read
after the affordance has appeared; a reload of any kind clears it. The wait
between the two is the assertion rather than a flake guard, because "no
forced reload" is a claim about what does not happen next.

**The affordance is a control, not a notice.** 10.6 offers the person a
reload, so the copy has to be on something they can act on, which is 9.1's
addressing sentence applied to a string 10.6 spells out.

Spec: 10.6 (the update rule and its copy), 11.4 (the prompt-for-update
registration flow), 9.1's addressing sentence.
*/
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

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

/**
 * Where the built client is served from, resolved against this file rather
 * than against the working directory, so the case does not depend on where
 * the runner was invoked.
 */
const CLIENT_DIST = new URL('../../dist/client/', import.meta.url)

/**
 * The on-disk file behind a script URL the page reported.
 *
 * Derived rather than named: whatever the client registered is what gets a
 * new build. The containment check is not defensive programming for its own
 * sake, it is what keeps a page that reported something unexpected from
 * sending a write outside the build directory.
 */
function servedFile(scriptURL: string): string {
  const pathname = new URL(scriptURL).pathname.replace(/^\/+/, '')
  const resolved = new URL(pathname, CLIENT_DIST)
  expect(
    resolved.href.startsWith(CLIENT_DIST.href),
    `the registered worker resolved to ${resolved.href}, which is outside the built client`,
  ).toBe(true)
  return fileURLToPath(resolved)
}

test.describe('AC-100: a new build arrives mid-session', () => {
  test('AC-100: the reload affordance appears and nothing reloads', async ({ page }) => {
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
        "page with no registered worker, which is AC-091's sentence failing rather than this one",
    ).not.toBeNull()

    const file = servedFile(scriptURL as string)
    const original = await readFile(file, 'utf8')

    try {
      // The deploy. One appended comment is a different script, which is the
      // whole of what an update check compares, and the server reads the file
      // per request so the next fetch gets it.
      await writeFile(file, `${original}\n// a new build, deployed mid-session\n`, 'utf8')

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

      const affordance = page
        .getByRole('button', { name: copy.updateAvailable })
        .or(page.getByRole('link', { name: copy.updateAvailable }))
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
    } finally {
      // The build goes back however this case ended, so a later spec and a
      // later run see the artifact the runner produced.
      await writeFile(file, original, 'utf8')
    }
  })
})
