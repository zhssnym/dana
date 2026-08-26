/*
AC-265: given the landing page, then every place Dana's mark appears is an
inline `<svg>` drawn in the document rather than an `<img>` fetching
`/dana-mark.svg`, that file staying where it is for the favicon, the manifest
icon and the transactional emails; and given the three marks that page draws,
then each carries a mask of its own with no two ids alike, so no mark can take
another's; and given no pointer has touched them, then each is already fully
drawn at rest, its sweep at zero offset, so a mark that never animates, or
animates with scripting off, is simply the logo; and given the sidebar signed
in, then its mark is drawn the same way and the link it sits in still reaches
Desk under its own accessible name; and given a viewer whose system asks for
reduced motion, then hovering the control a mark sits in starts no animation
on it.

**Why one number is spent on a thing no section carries.** Ledger entries
L-141 to L-145 record what `prototype-v2/src/components/dana-mark.tsx`
decides, and the ledger's own section column reads *unspecified* for every
one of them. That is 11.13's mechanism firing, not a defect against a
contract: five client files point at an SVG file because no numbered sentence
ever told them to draw one. The mark's section sentence is inside RFC 0005
change control item 41's Part D block and folds at S29. This criterion is
what makes the decision assertable before then.

**The pixel count is deliberately not asserted.** L-142's mask is verified in
the prototype's header to uncover 100.00% of the mark's 62,385 pixels, by
rasterising and counting. No browser assertion reaches that, and a criterion
that tried would pin itself to a geometry file rather than to a behaviour.
What is read here is the shape of the decision instead: inline rather than
fetched, a mask id per instance, a rest state already drawn, and an animation
that does not start when the operating system says not to.

**The landing page is the surface because it draws three marks.** The header
lockup, the closing block's mark and the footer lockup, at
`pages/LandingPage.tsx:749`, `:914` and `:927`. L-144's clause needs more than
one instance on one document to mean anything: the failure it exists to catch
is the second mark silently taking the first one's mask, so the first logo
disappears. A criterion reading a single mark could never see it.

**`public/dana-mark.svg` is asserted to survive, not to disappear.** The
favicon in `app/index.html`, a manifest icon and a real transactional email
all point at that file. So what is read is that no `<img>` on a page that
draws the mark fetches it, and nothing at all about the file. An
implementation that deleted the file would pass this criterion and break three
things it does not measure.

**The accessible name is read because an inline SVG is where it breaks.** The
`<img alt="">` these replace contributes nothing to its link's name. An
inline `<svg>` that forgets `aria-hidden` contributes whatever a `<title>` or
a stray text node says, and the sidebar's lockup would stop being reachable
under the name every other criterion addresses it by. That is the regression
this clause exists for, and it is the one a session lifting the component
would not think to look for.

Spec: 12 AC-265, 9.1 (the sidebar's lockup and the addressing rule its name
comes from), 9.2 (the landing page), 11.4 (tokens as the only home for the
mark's two colours), ledger L-141 to L-145 and L-251, RFC 0005 change control
items 37, 39 and 41.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  routesV2,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * Every drawn mark on the page, by the attribute the component puts on its
 * root rather than by a class or a size.
 *
 * Addressed by `data-dana-mark` because the alternative is addressing an
 * `<svg>` by what is inside it, and the icon family draws several dozen of
 * those on any given page. The attribute is the mark saying which one it is,
 * which is the same reason 9.1's names table exists one level up.
 */
function marks(scope: Page | Locator): Locator {
  return scope.locator('svg[data-dana-mark]')
}

/** The `<img>` these replace, wherever one still fetches the file. */
function fetchedMarks(scope: Page | Locator): Locator {
  return scope.locator('img[src="/dana-mark.svg"]')
}

test.describe('AC-265: Dana\'s mark is drawn rather than fetched', () => {
  test('AC-265: the landing page draws three marks and fetches none', async ({
    page,
  }) => {
    await page.goto(routesV2.landing)

    await expect(
      marks(page),
      'ledger L-141: the mark is drawn rather than fetched, "because a file cannot be ' +
        'animated and an <img> is opaque to the document". LandingPage.tsx draws it three ' +
        'times, at the header lockup, the closing block and the footer lockup',
    ).toHaveCount(3)

    await expect(
      fetchedMarks(page),
      'ledger L-141: no <img> fetches /dana-mark.svg on a page that draws the mark. The ' +
        'file itself stays where it is, for the favicon in app/index.html, the manifest ' +
        'icon and the transactional emails, and this reads the page rather than the file',
    ).toHaveCount(0)
  })

  test('AC-265: three marks on one page carry three masks', async ({ page }) => {
    await page.goto(routesV2.landing)
    await expect(marks(page).first()).toBeVisible()

    const ids = await marks(page).evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector('mask')?.getAttribute('id') ?? ''),
    )

    expect(
      ids.filter((id) => id !== '').length,
      'ledger L-142: the pen is a mask, so every mark has one to be drawn by',
    ).toBe(3)

    expect(
      new Set(ids).size,
      'ledger L-144: "the mask id must be unique per instance, because two marks on one ' +
        'page sharing an id means the second steals the first one\'s mask". Three marks ' +
        `and ${new Set(ids).size} distinct ids means at least two are sharing`,
    ).toBe(3)
  })

  test('AC-265: the rest state is the whole logo', async ({ page }) => {
    await page.goto(routesV2.landing)
    await expect(marks(page).first()).toBeVisible()

    /* Read off the mask's own stroke rather than off a screenshot: the
       property that matters is the dash offset, and a rendered comparison
       would be asserting the geometry this criterion deliberately does not. */
    const offsets = await marks(page).evaluateAll((nodes) =>
      nodes.map((node) => {
        const stroke = node.querySelector('mask path')
        if (stroke === null) return null
        return window.getComputedStyle(stroke).strokeDashoffset
      }),
    )

    expect(
      offsets,
      'ledger L-143: "the rest state is fully drawn", strokeDashoffset sitting at 0 and ' +
        'the animation running 1 to 0, "so a mark that never animates, or animates with ' +
        'scripting off, is simply the logo". A mark that starts hidden is a logo that ' +
        'arrives only for people who hover it',
    ).toEqual([...offsets].map(() => '0px'))
  })

  test('AC-265: reduced motion starts nothing', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(routesV2.landing)

    const lockup = page.getByRole('link', { name: /dana home/i }).first()
    await expect(
      lockup,
      'spec 9.2: the landing page carries the Dana lockup as a link home',
    ).toBeVisible()
    await lockup.hover()

    /* Given time to have started, had it been going to. The sweep runs 850ms,
       so a quarter of a second is well inside it and a running animation
       would be caught mid-flight rather than after it finished. */
    await page.waitForTimeout(250)

    const running = await marks(page)
      .first()
      .evaluate((node) => {
        const stroke = node.querySelector('mask path')
        return stroke === null ? -1 : stroke.getAnimations().length
      })

    expect(
      running,
      'ledger L-145: "prefers-reduced-motion turns it off entirely". Not slowed, not ' +
        'shortened: no animation is started at all, which is the only version of this a ' +
        'person who set that preference actually asked for',
    ).toBe(0)
  })

  test('AC-265: the sidebar lockup is drawn and keeps its name', async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.desk)

    await expect(
      marks(sidebar(page)),
      'ledger L-141: app-sidebar.tsx is the fifth of the five places the client drew an ' +
        '<img>, and it is the one a person looks at all day',
    ).toHaveCount(1)

    await expect(
      fetchedMarks(sidebar(page)),
      'ledger L-141: and it no longer fetches the file',
    ).toHaveCount(0)

    /* The regression an inline SVG causes and an <img alt=""> could not. A
       mark that forgets aria-hidden contributes whatever is inside it to the
       accessible name of the link it sits in, and that link is 9.1's way to
       Desk. */
    const home = sidebar(page).getByRole('link', { name: 'Dana', exact: true })
    await expect(
      home,
      'spec 9.1: the sidebar header is the Dana lockup and it goes to Desk. An inline ' +
        'mark without aria-hidden leaks into this name and the link stops being ' +
        'addressable under it',
    ).toBeVisible()

    await home.click()
    await expect(
      page,
      'spec 9.1: and it still reaches Desk, 10.6\'s start URL',
    ).toHaveURL(new RegExp(`${routesV2.desk}/?$`))
  })
})
