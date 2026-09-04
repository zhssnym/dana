/*
AC-226: given an account holding no folder but Desk and no task, then Desk
offers the starter workflows; when one is chosen, then its folder arrives with
its tasks and with a page whose first block tells the person the example is
theirs to delete, and the offer is not drawn again.

Authored at S13 on 2026-08-24, the package that added 9.13, and numbered
additively after AC-225. The section arrived with the package because ADD-1
had been a bullet in `v2-pricing.md` and nothing else; this file is what stops
it being a section with no check.

**Every account here is provisioned by this file**, never a seed one.
Freshness is the criterion's whole antecedent, and both seeded accounts carry
folders and tasks, so a spec that signed in as one of them could assert the
offer's absence and never once see it. `signIn` with an unused sub provisions
through the callback's own transaction, so what is under test is a real first
run.

**The strings are transcribed from 9.13 and not imported from the client.**
The harness's own rule, and the reason for it: a suite that reads the string
it asserts out of the code under test asserts that the code equals itself.

**The deletion paragraph is asserted on the folder's page over section 7 and
not in the rendered page**, and that is deliberate rather than a shortcut.
9.13 requires the sentence to be on the folder's page; 9.6's block rendering
is S12's and does not exist yet, so a test looking for it in the document
would be red for a reason that is not this criterion's. Asserting the block
through GET /folders/:id/page pins exactly what 9.13 fixes, which is that the
starter carries the sentence, and leaves the drawing of it to the criterion
that will own the folder page. The file records this so the assertion is
raised to the document when S12 lands, rather than left weaker than it needs
to be forever.

**Watched failing before it was trusted**, on DES-157's discipline, which is
worth the minute for a criterion nobody has ever seen red. Two strings were
changed in the client, the offer's heading and the deletion paragraph, and the
file was rerun: 3 failed and 1 passed. The one that passed is the third case
below, which asserts an absence and so cannot tell a missing offer from a
renamed one. That is exactly why the other three exist, and it is written here
so that a later reader does not mistake the third for the load-bearing one.

Spec: 9.13 (the offer, freshness, the deletion paragraph), 7.16 (the import
the offer posts), 9.1's route table (/app renders Desk).

**The `waitForApiIdle` calls that are left in this file follow a navigation
and not an act (2026-09-04, issue #159).** Where an act is what precedes the
read — pressing a starter, pressing the dismissal — the barrier is
`watchCommit`, taken before the press, because quiet is also what a page looks
like in the window between a press and the request it causes and the reads
here are all of an absence. Where a `page.goto` is what precedes it, there is
no commit to count and quiet is the whole of what can be waited for. The
dismissal case is neither: it looked like a write with no barrier at all, the
sweep gave it one, and `watchCommit` then said in terms that the page had sent
nothing -- which is right, the dismissal living in `localStorage` on purpose.
The barrier came back out and the reason is written where it was.

*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  routes,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchCommit,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 9.13's copy table, transcribed. */
const OFFER = {
  heading: 'Start with an example',
  body:
    'Import a worked example to see how Dana holds a real piece of work. ' +
    'Nothing here is fixed: change anything, or delete it all.',
  dismiss: 'No thanks',
  deletable:
    'This is an example, and it is yours now. Change anything you like, or ' +
    'delete the whole folder from its menu when you are done with it.',
} as const

interface PageBlock {
  readonly kind: string
  readonly position: number
  readonly text: string
}

test.describe('AC-226: the starter workflows of 9.13', () => {
  test('AC-226: a fresh account is offered the starters, and choosing one lands it', async ({
    page,
  }) => {
    await signIn(page, `s13-starter-${caseTitle('lands')}`)
    await page.goto(routes.myDay)
    await waitForApiIdle(page, 'Desk and the All view both settle before the offer is judged')

    const offer = page.getByRole('region', { name: OFFER.heading })
    await expect(
      offer,
      'spec 9.13: a fresh account is offered the starter workflows beneath Desk. Fresh is ' +
        'no folder but Desk and no task anywhere, which is this account exactly',
    ).toBeVisible()
    await expect(
      offer.getByText(OFFER.body, { exact: true }),
      "spec 9.13's copy table, which is normative",
    ).toBeVisible()

    const starter = offer.getByRole('button', { name: 'Plan a trip' })
    await expect(
      starter,
      'spec 9.13: the offer presents starters to choose from, each a worked example',
    ).toBeVisible()
    /* Before the press (2026-09-04, issue #159). What follows is a read of
       7.4 and 7.16 on Playwright's own HTTP client, so quiet returning in the
       window before the import request leaves the browser would find no folder
       named 'Plan a trip' — which is what a starter that drew a heading and
       imported nothing would leave, and is the defect this asserts against. */
    const imported = watchCommit(page)
    await starter.click()

    // 9.13: the starter is an ordinary 7.16 import, so what arrives is a
    // folder with the file's tasks, owned by the person who pressed.
    await expect(
      page.getByRole('heading', { name: 'Plan a trip' }).first(),
      'spec 9.13: choosing a starter creates its folder, and the person is taken into it',
    ).toBeVisible()
    await imported.settled('the import reaches the server before 7.4 is asked what it made')

    const folders = await page.request.get('/api/v1/folders')
    expect(folders.status()).toBe(200)
    const list = (await folders.json()) as Array<{ id: string; name: string; is_default: boolean }>
    const created = list.find((folder) => folder.name === 'Plan a trip')
    expect(
      created,
      'spec 7.16: the import creates the file\'s folder, which is what 9.13 rides',
    ).toBeDefined()

    const pageResponse = await page.request.get(`/api/v1/folders/${created?.id ?? ''}/page`)
    expect(pageResponse.status()).toBe(200)
    const body = (await pageResponse.json()) as { blocks: PageBlock[] }
    expect(
      body.blocks[0]?.text,
      'spec 9.13: every starter says in its own page that it can be deleted, as the first ' +
        "paragraph block, because the offer's copy is gone the moment it is answered and " +
        'the page is what the person still has',
    ).toBe(OFFER.deletable)
    expect(body.blocks[0]?.kind).toBe('paragraph')
  })

  test('AC-226: the offer does not return once a starter has landed', async ({ page }) => {
    await signIn(page, `s13-starter-${caseTitle('once')}`)
    await page.goto(routes.myDay)
    await waitForApiIdle(page, 'the offer is drawn before it is answered')

    const offer = page.getByRole('region', { name: OFFER.heading })
    await expect(offer).toBeVisible()
    /* Before the press (2026-09-04, issue #159): Desk is asked again below and
       the answer turns on the import having landed, so a barrier that can
       return before the request went out would reload an account that is still
       fresh and see the offer it expects to be gone. */
    const landed = watchCommit(page)
    await offer.getByRole('button', { name: 'Learn something new' }).click()
    await landed.settled('the import reaches the server before Desk is asked again')

    await page.goto(routes.myDay)
    await waitForApiIdle(page, 'Desk settles, so an absent offer is absence and not latency')
    await expect(
      page.getByRole('region', { name: OFFER.heading }),
      'spec 9.13: the offer stops being drawn the moment the account stops being fresh, ' +
        'which includes the moment an import lands, and it does not return. Asking a ' +
        'second time is the product failing to notice it was already answered',
    ).toBeHidden()
  })

  test('AC-226: an account that is not fresh is never offered a starter', async ({ page }) => {
    /*
    The other half of the antecedent, and the one a spec that only ever signs
    in fresh would never reach. A seeded account carries folders and tasks, so
    the offer must be absent on its very first Desk load rather than absent
    after being answered.
    */
    await signIn(page, 'seed-google-sub-hassan')
    await page.goto(routes.myDay)
    await waitForApiIdle(page, 'Desk settles for the seeded account')

    await expect(
      page.getByRole('region', { name: OFFER.heading }),
      'spec 9.13: fresh means no folder but Desk and no task anywhere. An account with ' +
        'either has left first run and is not asked',
    ).toBeHidden()
  })

  test('AC-226: dismissing the offer removes it', async ({ page }) => {
    await signIn(page, `s13-starter-${caseTitle('dismiss')}`)
    await page.goto(routes.myDay)
    await waitForApiIdle(page, 'the offer is drawn before it is dismissed')

    const offer = page.getByRole('region', { name: OFFER.heading })
    await expect(offer).toBeVisible()
    /* No commit barrier on the dismissal, and it is worth saying why because
       the #159 sweep tried to add one and was wrong (2026-09-04). The
       dismissal is a client-only value: `onboarding/StarterOffer.tsx` keeps
       it in `localStorage` under `dana.starters.dismissed`, deliberately and
       with its reason beside it, because a dismissal is not something the
       account owes anybody. `watchCommit` failed here saying the page had
       sent nothing at all, which was true and correct. That is the fifth of
       `waitForApiIdle`'s rules in the harness, "where the value read is the
       client's own" -- a rule that did not exist until this barrier was tried
       here, and which this case is half the reason for. */
    await offer.getByRole('button', { name: OFFER.dismiss }).click()

    await expect(
      page.getByRole('region', { name: OFFER.heading }),
      "spec 9.13: a person who dismisses the offer has left first run. The account is " +
        'still fresh, so the dismissal is what has to be remembered',
    ).toBeHidden()

    await page.goto(routes.myDay)
    await waitForApiIdle(page, 'Desk settles again after the reload')
    await expect(
      page.getByRole('region', { name: OFFER.heading }),
      'spec 9.13: a dismissal survives a reload, which is what makes it an answer rather ' +
        'than a flinch',
    ).toBeHidden()
  })
})
