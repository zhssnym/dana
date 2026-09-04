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

**The paragraph above described this file's measurement until 2026-09-04, and
it had stopped being true (issue #81).** It said that without the inline
script the first value the root is given is `light`. That was so when this was
written and is not so now: `useTheme()` in `lib/theme.ts` answers
`bundle.data?.theme ?? mirroredTheme()`, and `mirroredTheme()` reads the same
`localStorage` mirror the inline script reads, so `shell/appearance.ts` writes
`dark` too. Both paths reach the same value, and a value both paths reach is
not evidence about which one ran. **What that cost is on the record**: the
policy #34 fixed refused this very script in production, every person on Dark
saw a white frame on every cold load, and this criterion was green throughout.
It was a person who reported it.

**So the file measures the refusal directly, which is a timing property read
as one.** A `securitypolicyviolation` listener is installed through
`addInitScript`, before the document exists and therefore before the parser
reaches the head, and it keeps every violation the page reports; the case
fails if any of them is `script-src` against a blocked URI of `inline`. That
is the exact shape Chromium reports for a refused inline script, and it is
what #34 would have failed on the day the header was written. The listener
lives on `window` because the event is fired at the document and bubbles.

**The value assertion stays, on what it still says rather than on what it used
to say.** `dark` as the first value the root is ever given rules out a light
first frame from any path, inline script or bundle, and that is 9.7's promise
to the person. It no longer carries the claim that the inline script is what
produced it, because it cannot; the violation listener is what carries that.
Two assertions, each covering what the other cannot: one says nothing painted
light, the other says the thing that stops it painting light was allowed to
run.

**Two things the listener does not do**, said here so nobody reads more into
a green than is there. `sample` is recorded and is empty, this policy carrying
no `report-sample`, so the violation is identified by its directive and its
blocked URI and never by the script's text. And the listener is per
navigation, `addInitScript` re-running and re-emptying the array on each one,
so what it reports is the last `goto` and not the case as a whole; the
assertion sits directly after the navigation it is about.

Spec: 9.7 (the sentence), 4.19 (the column), 10.8 (the policy that refused
it), 11.4 (`data-theme` as what the token file answers), RFC 0005 change
control item 43 and item 52.
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

/** One refusal the page reported, in the fields this policy can fill. */
interface CspViolation {
  directive: string
  blockedURI: string
  sample: string
  sourceFile: string
}

/**
 * Keeps every Content-Security-Policy refusal the page reports, from before
 * the document exists.
 *
 * `securitypolicyviolation` is fired at the element that was refused and
 * bubbles, so one listener on the window catches an inline script in the head
 * as well as anything later. Installed through `addInitScript` for the same
 * reason `watchFirstTheme` is: a listener added after the navigation has begun
 * cannot hear about a script the parser has already reached.
 */
async function watchCspViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const view = globalThis as unknown as {
      __cspViolations?: CspViolation[]
      addEventListener: (type: string, listener: (event: unknown) => void) => void
    }
    const seen: CspViolation[] = []
    view.__cspViolations = seen
    view.addEventListener('securitypolicyviolation', (event: unknown) => {
      const report = event as {
        effectiveDirective?: string
        violatedDirective?: string
        blockedURI?: string
        sample?: string
        sourceFile?: string
      }
      seen.push({
        directive: report.effectiveDirective ?? report.violatedDirective ?? '',
        blockedURI: report.blockedURI ?? '',
        sample: report.sample ?? '',
        sourceFile: report.sourceFile ?? '',
      })
    })
  })
}

/** The refusals of an inline script, which is the one this document carries. */
async function inlineScriptRefusals(page: Page): Promise<CspViolation[]> {
  const reported = await page.evaluate(
    () => (globalThis as unknown as { __cspViolations?: CspViolation[] }).__cspViolations ?? [],
  )
  return reported.filter(
    (violation) =>
      violation.directive.startsWith('script-src') && violation.blockedURI === 'inline',
  )
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
    await watchCspViolations(page)
    await page.goto(routesV2.today)
    expect(
      await inlineScriptRefusals(page),
      'spec 9.7 and 10.8: the inline script that paints the mirror before the first frame ' +
        'is named by the policy through its sha256, so the page reports no script-src ' +
        'refusal of it. This is the assertion that measures the mechanism rather than its ' +
        'outcome: issue #34 was a policy that refused this script, every person on Dark saw ' +
        'a white frame on every cold load, and the value below stayed dark throughout',
    ).toEqual([])
    expect(
      await firstTheme(page),
      'spec 9.7: "the theme is applied before first paint from a copy mirrored into the ' +
        'browser", so no frame is ever drawn light for a person who chose Dark. Read as ' +
        'what it still says: the first value rules out a light first frame from either ' +
        'path, and the refusal assertion above is what says the fast one was allowed to run',
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

    /* polish: settings F5. Sign out lives in the account menu alone now;
       the Settings page's second copy is gone. */
    await page.getByRole('button', { name: 'Account', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
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
