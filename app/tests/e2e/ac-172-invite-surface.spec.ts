/*
AC-172: given an account holding a pending invite, then the invite list
renders above everything else on My Day and again on the People screen, on an
ordinary load as well as on the one following callback; given every invite
answered, then neither page renders it.

Numbered by the Integration Steward at P8's second change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged. This is a ruling's own criterion, the AC-124, AC-141
and AC-154 shape, so its text was settled at the ruling and only its test is
this role's.

9.8 said the invite list renders before anything else after callback and 9.2
said the callback lands on My Day, which between them fixed the first load
and said nothing about the second. The ruling makes it a standing section of
My Day and of the People screen for as long as Q12 is non-empty. It is worth
a number because both wrong implementations are plausible and both are
silent: a surface rendered once after callback leaves anyone who reloads
before answering with no invite in front of them and no route back to it,
and a band above every page invents global chrome 9.1 does not name.

**"An ordinary load" is what this file can produce, and it is the half that
was unspecified.** 11.10 gives this leg its sessions from the development
login rather than from a callback, so every load here is the ordinary kind:
the case that would have passed under the old reading is the one this file
cannot reach, and the case that distinguishes the readings is the one it
runs. A reload is asserted beside the first load for the same reason, since a
one-shot surface survives the first and not the second.

**Above everything else is asserted as document order.** The list is a
section of the page rather than a banner over it, which is the distinction
the ruling drew when it declined the global-chrome reading, so what "above"
means here is that the section precedes the page's own content. A bounding
box would answer the same question about a fixed overlay that the ruling
rejected.

**The rows are addressed by their own sentence.** 9.8's invite list is a
region the same ruling deliberately left unnamed, because 9.1's sections rule
takes a name from a heading or from a generating datum and this list has
neither. Its rows carry "Hassan invited you to Groceries", which tells a
reader and a test which Accept belongs to which invite, and that is what the
sentence is for.

This file answers the seeded invite, which is a mutation of a seeded row and
the one place in this leg that makes one. It is safe because no other spec
reads that invite: rendered-halves invites a different address, AC-158 uses
an account of its own, and the invite is addressed to nobody who signs in
anywhere else. It is stated because the harness's rule is otherwise never to
touch a seeded row, and this is the exception with its reason.

Spec: 9.8 (the invite list, its rows, and where it lives), 6 Q12, 9.2 (where
the callback lands), 9.1's sections rule, frozen 7.5 (the decline).
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  routes,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * The address the seed sends its one pending invite to. 6 Q12 matches a
 * pending invite to the viewer's lowercased email, so an account provisioned
 * here at that address is an account holding an invite, which is the state
 * this criterion is about and which no endpoint can put a session into
 * directly.
 */
const INVITEE_SUB = 'ac-172-invitee'
const INVITEE_EMAIL = 'sana@example.com'
/** 9.8's row sentence, for the seed's inviter and folder. */
const ROW = 'Hassan invited you to Groceries'

/** Whether the first element precedes the second in the document. */
async function precedes(first: Locator, second: Locator): Promise<boolean> {
  const [a, b] = await Promise.all([first.elementHandle(), second.elementHandle()])
  expect(a, 'the earlier element is on the page').not.toBeNull()
  expect(b, 'the later element is on the page').not.toBeNull()
  if (a === null || b === null) throw new Error('unreachable: asserted above')
  // Node.DOCUMENT_POSITION_FOLLOWING is 4: the second node follows the first.
  // These specs typecheck with no DOM lib, correct because they run in node
  // and only this callback runs in the browser, so the one method it needs is
  // reached through a locally typed view of the handles.
  return first.page().evaluate(
    ([x, y]) => {
      const earlier = x as unknown as { compareDocumentPosition: (n: unknown) => number }
      return (earlier.compareDocumentPosition(y) & 4) !== 0
    },
    [a, b] as const,
  )
}

async function signInAsInvitee(page: Page): Promise<void> {
  await signIn(page, INVITEE_SUB, 'Sana', INVITEE_EMAIL)
}

test.describe('AC-172: where the invite list lives', () => {
  test('AC-172: My Day carries it above everything else, on an ordinary load', async ({
    page,
  }) => {
    await signInAsInvitee(page)
    await page.goto(routes.myDay)

    const row = page.getByText(ROW)
    await expect(
      row,
      'spec 9.8: each row reads "Hassan invited you to Wedding", so the seeded invite from ' +
        'Hassan to Groceries reads this way. 6 Q12 is non-empty for this account, which is ' +
        'the whole condition the ruling attached the list to',
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Accept' }),
      'spec 9.8: Accept and Decline buttons on each row',
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Decline' }),
      'spec 9.8: Accept and Decline buttons on each row',
    ).toBeVisible()

    expect(
      await precedes(row, page.getByRole('heading', { name: /Carried over|Today|My Day/ }).first()),
      'spec 9.8 as ruled: the list is a section of My Day above everything else on that page. ' +
        'Asserted as document order because the ruling declined the banner reading, a band ' +
        'over every page being global chrome 9.1 does not name',
    ).toBe(true)
  })

  test('AC-172: it survives a reload, being standing rather than one-shot', async ({
    page,
  }) => {
    await signInAsInvitee(page)
    await page.goto(routes.myDay)
    await expect(page.getByText(ROW), 'the list is there on the first load').toBeVisible()

    await page.reload()
    await expect(
      page.getByText(ROW),
      'spec 9.8 as ruled: the list is there whenever Q12 is non-empty rather than only on the ' +
        'load that followed a callback. A one-shot surface leaves anyone who reloads before ' +
        'answering with no invite in front of them, which is the case "before anything else" ' +
        'was written against',
    ).toBeVisible()
  })

  test('AC-172: the People screen carries it too', async ({ page }) => {
    await signInAsInvitee(page)
    await page.goto(routes.people)

    await expect(
      page.getByText(ROW),
      'spec 9.8 as ruled: the People screen carries the list as well, that being the screen ' +
        'this section gives the rest of this subject',
    ).toBeVisible()
  })

  test('AC-172: answering the last invite empties it from both pages', async ({ page }) => {
    await signInAsInvitee(page)
    await page.goto(routes.myDay)
    await expect(page.getByText(ROW), 'the invite is pending before it is answered').toBeVisible()

    // Declined through the row's own control, which is the path 9.8 gives a
    // person. 5.2 makes declined terminal, so Q12 empties and the list has
    // nothing to render.
    await clickControl(
      page.getByRole('button', { name: 'Decline' }),
      'spec 9.8: each row carries Accept and Decline',
    )

    await expect(
      page.getByText(ROW),
      'spec 9.8 as ruled: the list empties itself as each invite is answered, which is why the ' +
        'standing reading needs no dismissal and no state of its own',
    ).toHaveCount(0)

    await page.goto(routes.people)
    await expect(
      page.getByText(ROW),
      'spec 6 Q12: the same predicate feeds both pages, so an answered invite is gone from ' +
        'the People screen too',
    ).toHaveCount(0)

    await page.goto(routes.myDay)
    await expect(
      page.getByText(ROW),
      'and it stays gone across a fresh load, the invite being terminal rather than dismissed',
    ).toHaveCount(0)
  })
})
