/*
AC-256: given each of the four templates, then its one action link lands where
item 32 rules for it: both invitations on the application's start URL, the
share grant on the shared folder's own page, and the reminder on the task's.

**This is the half of item 32 most easily lost, and it says so.** Every
template landed on `${appOrigin}/app` before this package, because
`actionLink()` was one function that took no argument: there was nothing at
the seam that could carry a folder id or a task id, so there was nothing a
destination could be computed from. The payload widening is what makes a
destination possible at all, which is why this criterion is about the payload
as much as about the string.

**Three addresses for four destinations, and the reason is recorded rather
than assumed.** Both invitations land on 10.6's start URL because 9.8's invite
gate has no path of its own: it renders in place of the application whenever
Q12 is non-empty, over whatever /app route is beneath it, so "the invites
view" is an address only in the sense that arriving anywhere in the
application reaches it. `routes.ts` says so in its own header, listing the
gate among the three surfaces that deliberately have no path. The share grant
and the reminder do have addresses, `/app/folders/:id` and `/app/tasks/:id`,
both rows of 9.1's table (RFC 0005 change control item 34).

**The ids are asserted against the fixture's own rows**, not merely against a
shape, so a template that built a plausible URL from the wrong id would fail.
That is the failure worth catching: a link to somebody else's folder is a
worse bug than a link to none.

**And the action label is asserted with the destination**, because item 32
rules them as a pair: "Open {folder}" naming the folder it opens is the one
label that carries data, and a button reading "Open Dana" over a link to a
folder would be a half-enacted ruling that no destination assertion alone
would notice.

Spec: 10.6 (the start URL), 9.1 (the route table), 9.8 (the gate with no
path), 10.7 (one action link each), 11.8; RFC 0005 change control item 32.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp, visibleText } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  EmailCast,
  folderUrl,
  linksIn,
  renderedOf,
  startUrl,
  taskUrl,
  urlsIn,
} from './email-harness.js'

let app: AuthTestApp
const cast = new EmailCast('links')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-256: each template lands where item 32 sends it', () => {
  test('AC-256: both invitations land on the start URL, where the 9.8 gate meets the recipient', async () => {
    const staged = await cast.of(app)
    for (const email of [staged.folderInvite, staged.connectionInvite]) {
      const parts = renderedOf(email)
      expect(
        linksIn(parts.html)[0],
        `item 32: "Review invitation" to the invites view, which 9.8's gate reaches from 10.6's start URL (${email.template})`,
      ).toBe(startUrl)
      expect(
        urlsIn(parts.text)[0],
        `and the text part carries the same address (${email.template})`,
      ).toBe(startUrl)
      expect(
        visibleText(parts.html),
        `item 32 rules the label with the destination (${email.template})`,
      ).toContain('Review invitation')
    }
  })

  test('AC-256: the share grant lands on that folder, and names it on the button', async () => {
    const staged = await cast.of(app)
    const parts = renderedOf(staged.shareGrant)
    expect(
      linksIn(parts.html)[0],
      'item 32: "Open {folder}" to that folder, which is 9.1\'s /app/folders/:id',
    ).toBe(folderUrl(staged.folderId))
    expect(
      urlsIn(parts.text)[0],
      'and the text part carries the same address',
    ).toBe(folderUrl(staged.folderId))
    expect(
      visibleText(parts.html),
      'item 32: the one action label that carries data is this one',
    ).toContain(`Open ${staged.folderName}`)
  })

  test('AC-256: the reminder lands on that task', async () => {
    const staged = await cast.of(app)
    const parts = renderedOf(staged.reminder)
    expect(
      linksIn(parts.html)[0],
      "item 32: \"Open task\" to that task, which is 9.1's /app/tasks/:id",
    ).toBe(taskUrl(staged.taskId))
    expect(
      urlsIn(parts.text)[0],
      'and the text part carries the same address',
    ).toBe(taskUrl(staged.taskId))
    expect(visibleText(parts.html), 'with item 32\'s label').toContain(
      'Open task',
    )
  })

  test('AC-256 adversarial: no two templates land on one address any more', async () => {
    const staged = await cast.of(app)
    const destinations = staged.all.map(
      (email) => linksIn(renderedOf(email).html)[0] ?? '',
    )
    expect(
      new Set(destinations).size,
      'four templates, three addresses: the two invitations share the start URL and nothing else may collapse onto it (RFC 0005 change control item 34)',
    ).toBe(3)
    expect(
      destinations.filter((address) => address === startUrl).length,
      'and the pair that shares it is the two invitations',
    ).toBe(2)
  })

  test('AC-256 adversarial: the id in the link is the fixture’s own row', async () => {
    const staged = await cast.of(app)
    expect(
      linksIn(renderedOf(staged.shareGrant).html)[0],
      'a share grant pointing at a folder the recipient was not granted would be worse than one pointing nowhere',
    ).toContain(staged.folderId)
    expect(
      linksIn(renderedOf(staged.reminder).html)[0],
      'and a reminder must open the task that fired, not another of the same assignee’s',
    ).toContain(staged.taskId)
  })
})
