/*
AC-240: given no session, when /privacy and /terms are visited, then each
renders its own page, headed by its title and carrying the copy DES-032
approved, rather than the not-found copy of 9.1; and the Privacy and Terms
links 9.2 puts in the landing footer resolve to those two pages.

**This criterion is written against the page, never against a status code,
and that is its whole design.** RFC 0005 change control item 22 checked the
production claim and corrected it: dana.so answers 200 for both paths today,
because the SPA fallback serves index.html and the client, defining neither
route, then renders its own not-found page. A criterion asserting a 404 would
call this healthy for ever, and a monitor written the same way already does.
So each case reads what a person reads.

**Signed out is the state that matters**, because these are the pages a
visitor meets before there is anything to sign into: the landing footer links
them, Google's OAuth consent configuration needs the privacy destination to
resolve, and 8.10's deletion text points at it. They sit outside /app and are
therefore outside AC-239's redirect, which fires on /app routes alone; the
first case asserts the path is still the one that was asked for, which is the
half that would fail if the redirect were ever widened to the whole origin.

**The copy is asserted by a section heading rather than by a paragraph.**
DES-032's approval is of the whole page, and its own header says the facts it
states are re-verified at the port, so a paragraph is the part most likely to
move for a good reason. A section heading is structure, which is what 11.13
gives a numbered section the last word on and what a port may not quietly
drop; asserting one per page proves the page rendered rather than that a
route merely resolved.

Spec: 9.2 (the landing's privacy and terms links, and AC-159 beside this
one), 9.1 (the not-found copy this must not be), DES-032, RFC 0005 change
control item 22.
*/
import { expect, test } from '@playwright/test'

import { ACTION_TIMEOUT_MS, clickControl, routesV2, TEST_TIMEOUT_MS } from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 9.1's not-found sentence, which is what both paths render today. */
const NOT_FOUND = 'That page does not exist. Everything Dana has is in the sidebar.'

/**
 * One section heading per page, from `public-legal-screen.tsx`.
 *
 * The first of each page's sections, so a client that renders the title and
 * nothing under it is red: a heading and a lone title are the difference
 * between a page and a placeholder wearing its name.
 */
const PAGES = [
  { title: 'Privacy', path: routesV2.privacy, heading: 'What Dana stores' },
  { title: 'Terms', path: routesV2.terms, heading: 'The deal' },
] as const

test.describe('AC-240: the two public pages the landing has always linked', () => {
  for (const legal of PAGES) {
    test(`AC-240: ${legal.path} renders its page with no session`, async ({ page }) => {
      await page.goto(legal.path)

      expect(
        new URL(page.url()).pathname,
        `spec 9.1: ${legal.path} is a public page outside /app, so AC-239's redirect does ` +
          'not reach it and a visitor stays where they asked to be',
      ).toBe(legal.path)

      await expect(
        page.getByRole('heading', { name: legal.title, exact: true }),
        `DES-032: ${legal.path} is headed ${legal.title}. Without a heading the route ` +
          'resolved and the page did not',
      ).toBeVisible()

      await expect(
        page.getByRole('heading', { name: legal.heading, exact: true }),
        `DES-032: the approved copy is sections under that title, and ${JSON.stringify(
          legal.heading,
        )} is the first of ${legal.title}'s. A title alone is a placeholder wearing the ` +
          'page name',
      ).toBeVisible()

      await expect(
        page.getByText(NOT_FOUND),
        `spec 9.1: what ${legal.path} renders today is Dana's own not-found page, which ` +
          'tells a visitor reading a privacy policy that the policy does not exist. This ' +
          'is the assertion that goes red against the client as it ships',
      ).toHaveCount(0)
    })
  }

  test('AC-240: the landing footer reaches both, with no session', async ({ page }) => {
    // 9.2 puts the two links in the footer and AC-159 asserts they are there;
    // this asserts they arrive somewhere, which is the half AC-159 cannot see.
    for (const legal of PAGES) {
      await page.goto(routesV2.landing)
      await clickControl(
        page.getByRole('link', { name: legal.title, exact: true }),
        `spec 9.2: the landing footer carries a ${legal.title} link, which AC-159 asserts. ` +
          'This case follows it',
      )
      await expect
        .poll(() => new URL(page.url()).pathname, {
          message:
            `spec 9.2 and DES-032: the ${legal.title} link lands on ${legal.path}, the ` +
            'destination the footer has claimed since S13 and production has never had',
        })
        .toBe(legal.path)
      await expect(
        page.getByRole('heading', { name: legal.title, exact: true }),
        'and the destination is the page rather than a route that merely resolved',
      ).toBeVisible()
    }
  })
})
