/*
AC-404: given the Settings page, then its Account section carries a "Download
my data" row under the line "Everything Dana holds about you, as one JSON
file.", whose control is an anchor whose href is exactly /api/v1/me/export and
which carries the download attribute; and given no session, when /privacy is
read, then it carries the sentence "You can download everything Dana holds
about you at any time, as a single JSON file, from your Settings page."

Taken from the tail on 2026-09-04 for issue #162, the number assigned rather
than chosen; section 12's README carries the bullet and says why 401 to 403
are not listed free.

**The two clauses are one criterion, and that is the point of the file rather
than a convenience.** 9.2 forbids copy on a public page that promises a
capability Dana does not ship, and the Privacy sentence is the one sentence on
those pages that claims one. It is admissible only while the control exists,
so a page carrying the promise with nothing behind it is precisely the failure
worth catching, and two criteria in two files could not catch it: each would
be green while the other was red.

**The anchor is asserted rather than the download, and the distinction is the
whole of what this criterion can honestly hold.** AC-390 and AC-393 already
assert what GET /api/v1/me/export answers and that it answers it as an
attachment named for the day. What is not asserted anywhere until here is that
a person can reach it, which 10.9 records as the half still owed on the day
7.22 landed: "the clause is met by an endpoint a person can be given the URL of
rather than by something they can find". So this reads the address and the
attribute off the control and stops. Downloading the file in a browser test
would re-assert the endpoint through a slower transport and would tie this case
to Playwright's download plumbing, which is not what 9.7 promises.

**Why the element matters and not only the href.** 9.7 fixes that this is an
anchor and a navigation rather than a call through `api/http.ts`, because a
navigation carries the session cookie on its own and hands the response to the
browser, which is what makes the Content-Disposition filename mean anything. A
button with a fetch behind it would satisfy any assertion that only looked for
the string "Download my data", would pull the whole document through a zod
schema into memory, and would then need a second step to turn an object back
into a file. So this case reads the element's tag name as well as its href.

**The control is addressed by the role the page gives it, which is `button`,
and the tag name is asserted separately.** That is not a contradiction and it
is worth spelling out, because the obvious reading of "it is an anchor" is that
it announces itself as a link. It does not: `components/ui/button.tsx` renders
through Base UI's Button primitive, which sets `role="button"` on whatever
element `render` substitutes, so every anchor-rendered control in this client
announces itself the same way. The Support row below it is one and the
landing's "Continue with Google" is another, and 9.2 records that AC-159
"admits either role deliberately". What issue #162 asks for is the transport
rather than the announcement, so the transport is what is asserted: an `A`
element, that href, that attribute. **Changing the announcement is a change to
every anchor-rendered control in this client and is nobody's to make from one
Settings row.**

**The Privacy clause runs with no session**, which is the state that matters:
these are the pages a visitor meets before there is anything to sign into, and
AC-240 records the same reasoning for the same two pages. The sentence is
compared character for character against 9.2, this suite's standing rule for
normative copy, and it is restated here rather than imported from
`src/client/pages/LegalPage.tsx`, which would measure nothing.

Spec: 9.7 as amended 2026-09-04 (the Account section's export row), 9.2 as
amended 2026-09-04 (the Privacy sentence and the capability rule it is admitted
under), 7.22 (the endpoint and its headers), 10.9 (the obligation and the half
this closes), 9.1 (addressing a control by role and normative name), AC-240,
AC-390, AC-393; issue #162.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 7.22's address, exactly, which is what a navigation has to carry. */
const EXPORT_PATH = '/api/v1/me/export'

/** 9.7's help line under the row, restated rather than imported. */
const HELP = 'Everything Dana holds about you, as one JSON file.'

/** 9.2's sentence, restated rather than imported. */
const PRIVACY_SENTENCE =
  'You can download everything Dana holds about you at any time, as a single JSON file, ' +
  'from your Settings page.'

test.describe('AC-404: the export is reachable, and the Privacy page says so', () => {
  test('AC-404: Settings carries the export as an anchor with the download attribute', async ({
    page,
  }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.settings)

    /* Exact, because "Deleting your account" is a region of this page too and
       9.7 names both: a loose match resolves two. */
    const account = page.getByRole('region', { name: 'Account', exact: true })
    await expect(
      account,
      'spec 9.7: Settings sections are named regions, and the export row is the Account ' +
        "section's, beside the identity, the picture and the timezone",
    ).toBeVisible()

    await expect(
      account.getByText('Download my data', { exact: true }),
      'spec 9.7 as amended for issue #162: the row is titled "Download my data"',
    ).toBeVisible()
    await expect(
      account.getByText(HELP, { exact: true }),
      'spec 9.7 as amended: the line under the row says what the file is, so a person ' +
        'pressing the control knows what they are about to be handed',
    ).toBeVisible()

    /* Addressed by the role the page gives it, which the header explains is
       `button` for every anchor-rendered control in this client. */
    const control = account.getByRole('button', { name: 'Download', exact: true })
    await expect(
      control,
      "spec 9.7: the Account section carries one control for this row, and 9.1's addressing " +
        'rule reaches it by role and name',
    ).toBeVisible()

    expect(
      await control.evaluate((element) => element.tagName),
      'spec 9.7 as amended for issue #162: the control is an anchor and the download is a ' +
        'navigation. A BUTTON here is the build this refuses: routed through api/http.ts the ' +
        'document would be parsed through a zod schema into memory and then need a second ' +
        'step to become a file, and the row would satisfy every assertion that only looked ' +
        'for its title',
    ).toBe('A')

    await expect(
      control,
      `spec 7.22: the address is exactly ${EXPORT_PATH}, same origin, no parameters, so the ` +
        'session cookie rides the navigation and the endpoint needs no token in the URL',
    ).toHaveAttribute('href', EXPORT_PATH)

    /* Read rather than matched against a value: React renders a boolean
       attribute as download="" and a filename-bearing one as download="x",
       and 9.7 asks for the attribute rather than for either spelling. */
    expect(
      await control.getAttribute('download'),
      "spec 9.7 as amended: the anchor carries the download attribute, so the browser saves " +
        "the response under the name 7.22's Content-Disposition gives it rather than " +
        'navigating away from the application to render JSON',
    ).not.toBeNull()
  })

  test('AC-404: the Privacy page says the data can be taken away, with no session', async ({
    page,
  }) => {
    await page.goto(routesV2.privacy)

    expect(
      new URL(page.url()).pathname,
      "spec 9.1: /privacy is public and outside /app, so AC-239's redirect does not reach it",
    ).toBe(routesV2.privacy)

    await expect(
      page.getByRole('heading', { name: 'Taking your data with you', exact: true }),
      'spec 9.2 as amended for issue #162: the sentence is a section of its own rather than a ' +
        'clause inside "Deleting your data", the two being one pair in the order a person ' +
        'does them and portability not being erasure (10.9)',
    ).toBeVisible()

    await expect(
      page.getByText(PRIVACY_SENTENCE, { exact: true }),
      'spec 9.2 as amended: compared character for character, which is this suite\'s rule for ' +
        'normative copy. It names Settings rather than the endpoint, an address being no use ' +
        'to somebody reading a privacy policy, and it is admitted under 9.2\'s ' +
        'no-capability-claim rule only because the control asserted above ships with it',
    ).toBeVisible()
  })
})
