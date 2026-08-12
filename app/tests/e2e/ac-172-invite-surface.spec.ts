/*
AC-172: given an account holding a pending invite, then a request for any
/app path renders the invite gate of 9.8 in place of the application, with no
sidebar and no page beneath it, and each invite's row carries Accept and
Decline; given the last invite answered, then the same path renders the
application; and the People screen lists pending invites for as long as any
exist.

Rewritten by RFC 0002, Accepted 2026-08-13, which replaces this criterion's
text rather than deleting it. The sentence above is that RFC's Replace unit
transcribed unchanged, and it becomes section 12's own text when the delta
merges. What moved is where the list lives: it was a section of My Day above
everything else on that page, chosen at the second P8 change control over a
band across every page and over a one-shot surface after callback, and the
owner's ruling of 2026-08-13 makes it a full-screen gate. 9.8's own reasoning
for the change is that "before anything else" is only true of a section for a
person who happens to be looking at that page.

**"In place of the application" is asserted as the absence of the sidebar,
which is what makes the gate a gate.** 9.1 calls the sidebar the
application's only chrome and 9.8 says the sidebar, the page beneath and the
rest of the chrome are not rendered, so a client that renders the list inside
the shell satisfies every assertion about the rows and none about the gate.
That is exactly the implementation the replaced text asked for, so it is the
one this file must be able to fail against.

**"Any /app path" is asserted across four of them**, including one that is
not My Day, one that is a folder page and one that is Settings. A gate
implemented on the landing route alone, or on My Day alone, passes a case
that only visits /app; and the folder path matters most, because it is the
one a person reaches from a link in the invitation email they have not
answered yet.

**Two invites, so "the last" means something.** The seed carries one invite to
this address and this file creates a second, so answering one is asserted to
leave the gate standing and answering the other is asserted to end it. With a
single invite, a client that ends the gate on the first answer and a client
that ends it on the last are indistinguishable.

**The third clause is escalated and is not asserted below.** This criterion
ends "and the People screen lists pending invites for as long as any exist",
which the amended 9.8 also says in its own words, and its first clause makes
every /app path render the gate in place of the application while Q12 is
non-empty. /app/people is an /app path. So for as long as any invite exists
the People screen is exactly what cannot be reached, and the two clauses of
one criterion cannot both be observed by any client that satisfies either.
The People path is asserted below as one of the four the gate covers, which
is the reading the criterion's own first clause forces; the second reading,
that the People screen is exempt from the gate, would falsify that clause and
is not this file's to choose. Routed to the Integration Steward with both
readings.

**The rows are addressed by their own sentence.** 9.8's gate is a region the
ruling deliberately left unnamed, because 9.1's sections rule takes a name
from a heading or from a generating datum and this list has neither: it is
one list rather than one per folder. Its rows carry "Hassan invited you to
Groceries", which tells a reader and a test which Accept belongs to which
invite, and that is what the sentence is for.

This file answers the seeded invite, which is a mutation of a seeded row and
the one place in this leg that makes one. It is safe because no other spec
reads that invite: rendered-halves invites a different address, AC-158 uses
an account of its own, and the invite is addressed to nobody who signs in
anywhere else. It is stated because the harness's rule is otherwise never to
touch a seeded row, and this is the exception with its reason.

Spec: 9.8 (the invite gate, its rows, and what is not rendered beside it),
6 Q12, 9.1 (the sidebar as the only chrome, the route table), frozen 7.5 (the
invite and the decline), 7.4.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  csrfToken,
  routes,
  seedIds,
  seedSubs,
  sidebar,
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
const SEEDED_ROW = 'Hassan invited you to Groceries'
/** The folder this file shares so the gate holds two invites and not one. */
const SECOND_FOLDER = 'ac-172 second invited folder'
const SECOND_ROW = `Hassan invited you to ${SECOND_FOLDER}`

async function signInAsInvitee(page: Page): Promise<void> {
  await signIn(page, INVITEE_SUB, 'Sana', INVITEE_EMAIL)
}

/**
 * A second pending invite to the same address, sent by the seeded inviter so
 * both rows read the same way and differ only in the folder.
 *
 * Created through section 7 with Hassan's own session, which is the transport
 * a client uses; idempotent across runs against the shared database, because
 * 7.5 refuses a duplicate pending invite to one folder and the folder itself
 * may already exist from an earlier run.
 */
async function ensureSecondInvite(page: Page): Promise<void> {
  const token = await csrfToken(page.context())
  const list = await page.request.get('/api/v1/folders')
  expect(
    list.status(),
    `GET /folders answered ${list.status()}: ${await list.text()}`,
  ).toBe(200)
  const existing = ((await list.json()) as { id: string; name: string }[]).find(
    (folder) => folder.name === SECOND_FOLDER,
  )
  let id = existing?.id
  if (id === undefined) {
    const created = await page.request.post('/api/v1/folders', {
      data: { name: SECOND_FOLDER },
      headers: { 'X-CSRF-Token': token },
    })
    expect(
      created.status(),
      `POST /folders answered ${created.status()}: ${await created.text()}`,
    ).toBe(201)
    id = ((await created.json()) as { id: string }).id
  }
  const invited = await page.request.post('/api/v1/invites', {
    data: { email: INVITEE_EMAIL, folder_id: id },
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    [201, 409].includes(invited.status()),
    `POST /invites answered ${invited.status()}: ${await invited.text()}. A 409 is 7.5 ` +
      'refusing a duplicate pending invite, which is this fixture already in place',
  ).toBe(true)
}

/** Signs the inviter in on a context of its own and sends the second invite. */
async function seedSecondInvite(page: Page): Promise<void> {
  await signIn(page, seedSubs.hassan)
  await ensureSecondInvite(page)
}

test.describe('AC-172: the invite gate of 9.8', () => {
  test('AC-172: every /app path renders the gate in place of the application', async ({
    browser,
  }) => {
    const inviterContext = await browser.newContext()
    await seedSecondInvite(await inviterContext.newPage())
    await inviterContext.close()

    const context = await browser.newContext()
    const page = await context.newPage()
    await signInAsInvitee(page)

    for (const path of [
      routes.myDay,
      routes.tasks,
      routes.settings,
      routes.people,
      routes.folder(seedIds.groceries),
    ]) {
      await page.goto(path)

      await expect(
        page.getByText(SEEDED_ROW),
        `spec 9.8 at ${path}: the pending invites render in place of the application, so the ` +
          'gate is what any /app path answers with while Q12 is non-empty. A folder path ' +
          'matters most, being the one a person follows from the invitation itself',
      ).toBeVisible()
      await expect(
        sidebar(page),
        `spec 9.8 at ${path}: "the sidebar, the page beneath and the rest of the chrome are ` +
          'not rendered". 9.1 makes the sidebar the application\'s only chrome and 9.1\'s roles ' +
          'table makes it a navigation landmark, so its absence is what separates a gate from ' +
          'the section this criterion used to assert',
      ).toHaveCount(0)
      await expect(
        page.getByRole('heading', { name: 'Invitations' }),
        `spec 9.8 at ${path}: the gate is one screen headed "Invitations"`,
      ).toBeVisible()
    }

    await expect(
      page.getByText(SECOND_ROW),
      'spec 6 Q12: the gate carries every pending invite for this address, not the first of them',
    ).toBeVisible()
    await context.close()
  })

  test('AC-172: each row carries Accept and Decline', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await signInAsInvitee(page)
    await page.goto(routes.myDay)

    const row = page
      .getByRole('listitem')
      .or(page.getByRole('row'))
      .filter({ hasText: SEEDED_ROW })
    await expect(
      row,
      'spec 9.8: the gate carries each invite as a row reading "Hassan invited you to Wedding", ' +
        'which is what tells a reader and a test which Accept belongs to which invite',
    ).toBeVisible()
    await expect(
      row.getByRole('button', { name: 'Accept' }),
      'spec 9.8: each row carries Accept and Decline. Asserted inside the row rather than on ' +
        'the page, because the gate holds more than one invite and a control found anywhere ' +
        'answers for none of them in particular',
    ).toBeVisible()
    await expect(
      row.getByRole('button', { name: 'Decline' }),
      'spec 9.8: each row carries Accept and Decline',
    ).toBeVisible()
    await context.close()
  })

  test('AC-172: the gate stands until the last invite is answered', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await signInAsInvitee(page)
    await page.goto(routes.tasks)

    const first = page
      .getByRole('listitem')
      .or(page.getByRole('row'))
      .filter({ hasText: SEEDED_ROW })
    await clickControl(
      first.getByRole('button', { name: 'Decline' }),
      'spec 9.8: each row carries Accept and Decline, and 5.2 makes declined terminal',
    )

    await expect(
      page.getByText(SEEDED_ROW),
      'spec 6 Q12: an answered invite leaves the list, the predicate being pending invites for ' +
        'this address',
    ).toHaveCount(0)
    await expect(
      page.getByText(SECOND_ROW),
      'spec 9.8: the gate ends when the last invite is answered, so one answer of two leaves it ' +
        'standing. A client ending the gate on the first answer is indistinguishable from a ' +
        'correct one while only a single invite exists, which is why this file sends a second',
    ).toBeVisible()
    await expect(
      sidebar(page),
      'spec 9.8: and the application is still not rendered behind it',
    ).toHaveCount(0)

    const second = page
      .getByRole('listitem')
      .or(page.getByRole('row'))
      .filter({ hasText: SECOND_ROW })
    await clickControl(
      second.getByRole('button', { name: 'Decline' }),
      'spec 9.8: the last invite is answered through its own row',
    )

    await expect(
      sidebar(page),
      'spec 9.8: "answering the last invite ends the gate", so the same path now renders the ' +
        "application, and 9.1's sidebar is what the application is",
    ).toBeVisible()
    await page.goto(routes.tasks)
    await expect(
      page.getByRole('heading', { name: 'Invitations' }),
      'spec 6 Q12: the gate is a standing condition on the account rather than a moment, so an ' +
        'account holding no invite never meets it again',
    ).toHaveCount(0)
    await context.close()
  })

})
