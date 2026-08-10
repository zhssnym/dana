/*
AC-159 (proposed): given the landing page at /, then it describes the
shipping product with one "Continue with Google" button and privacy and
terms links, and makes no AI claim anywhere.

**The number is provisional**, authored on this branch with its test for the
mid-package change control, from AC-154 onward because P7 is concurrently
proposing AC-144 to AC-153 and merges first. See `ac-154-quick-add-row.spec.ts`.

9.2 is one paragraph and four rules, and section 12 reaches the section
exactly once, at AC-008, which asserts the rejection page 9.2 also carries
and never renders the landing page at all. The public page is the only
surface an unauthenticated person ever sees.

**The no-AI-claim rule is the one worth a criterion.** Section 13 item 14
records the final wording as the designer's under that rule, so the copy
will change after this branch and the rule will not; a criterion is how a
constraint survives the copy it constrains. It is also the kind of rule that
is broken by addition rather than by omission, which no test of what the
page does contain would catch.

**The button is asserted as exactly one.** 9.2 says a single "Continue with
Google" button, and a landing page with the same call to action in a hero
and again in a footer is the ordinary way that becomes two.

The page is loaded in a fresh context with no session, because that is who
it is for, and because a client redirecting signed-in visitors away from /
would otherwise hide the whole surface from this file.

Spec: 9.2 (the landing page), 9.1's route table (/ is the landing page),
section 13 item 14, 11.1 (the server serves the landing page).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  routes,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * The claim 9.2 forbids, in the spellings a marketing sentence makes it in.
 * Deliberately not matching "smart" or "intelligent", which are ordinary
 * English about a to-do list; what section 13 item 14 rules out is the
 * claim, and these are what it is written as.
 */
const AI_CLAIM = /\bAI\b|\bA\.I\.|artificial intelligence|machine learning|\bLLM\b|\bGPT\b|AI-powered/i

test.describe('AC-159 (proposed): the landing page of 9.2', () => {
  test('AC-159: one Continue with Google button, privacy and terms links', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(routes.landing)

    await expect(
      page.getByRole('button', { name: 'Continue with Google' }).or(
        page.getByRole('link', { name: 'Continue with Google' }),
      ),
      'spec 9.2: a single "Continue with Google" button, and 9.1\'s addressing sentence makes ' +
        'the name what a screen reader announces. Exactly one: the same call to action in a ' +
        'hero and again in a footer is two, which is how a single button becomes several',
    ).toHaveCount(1)

    await expect(
      page.getByRole('link', { name: /privacy/i }),
      'spec 9.2: privacy and terms links. They are the page\'s only obligation to a visitor ' +
        'who has not signed in yet',
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: /terms/i }),
      'spec 9.2: privacy and terms links',
    ).toBeVisible()

    await context.close()
  })

  test('AC-159: the page describes the shipping product and claims no AI', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(routes.landing)

    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')

    expect(
      text,
      'spec 9.2: one screen describing the shipping product, collaborative to-do lists in ' +
        'shareable folders. A landing page that names neither is describing something else',
    ).toMatch(/folder/i)
    expect(text, 'spec 9.2: the product is collaborative and says so').toMatch(
      /share|shared|shareable|together|collaborat/i,
    )

    expect(
      AI_CLAIM.test(text),
      'spec 9.2: no AI claim anywhere in v1 copy, which section 13 item 14 records as the ' +
        'rule the designer\'s final wording is written under. This is a rule broken by ' +
        `addition, so nothing about what the page does say would catch it. The page reads: ${text.slice(0, 400)}`,
    ).toBe(false)

    await context.close()
  })

  test('AC-159: the landing page is public', async ({ browser }) => {
    // 7.0 makes every endpoint but the auth ones require a session, and 11.1
    // has the server serve this page itself. A landing page behind a session
    // is a product nobody can sign up for, and it is the kind of thing a
    // catch-all route added for the SPA can cause without anyone noticing,
    // every developer being signed in already.
    const context = await browser.newContext()
    const page = await context.newPage()
    const response = await page.goto(routes.landing)

    expect(
      response?.status(),
      'spec 9.2: the landing page is public, so it answers a request carrying no session',
    ).toBe(200)
    await expect(
      page.getByRole('button', { name: 'Continue with Google' }).or(
        page.getByRole('link', { name: 'Continue with Google' }),
      ),
      'the sign-in path is on the page for someone who has never signed in',
    ).toBeVisible()

    await context.close()
  })
})
