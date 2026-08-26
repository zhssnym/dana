/*
AC-254: given either invitation, then it carries the orientation footer item
32 rules for it; and given the share grant or the reminder, then neither does,
each closing with "Sent by Dana" instead.

**The boundary is a deliverability rule, not a matter of taste, and that is
why it is a criterion.** Item 32 puts it plainly: the transactional exemptions
in CAN-SPAM and PECR, and a mailbox provider's own promotional
classification, turn on whether a message is functional; promotional content
can pull in an unsubscribe requirement, and an unsubscribe link would be a
**second** link, which 10.7's unchanged "one action link each" forbids. So a
footer on the wrong message is not a cosmetic slip, it is the first step of a
chain that ends with a template that cannot meet 10.7 at all.

**The discriminator is whether the recipient knows what Dana is.** An
invitation goes to a bare email address that may hold no account, so the line
is orientation the reader needs before deciding to click. A share grant
reaches an existing connection and a reminder reaches the person who set it;
the same line there is filler that makes a functional message look like a
marketing one.

**The footer is asserted verbatim from the text part rather than from the
HTML.** The ruled sentence contains an em dash and a typographic apostrophe,
and an HTML part may serve either as an entity; the text part is what a person
reads unescaped, so it is where an exact comparison means what it says. The
HTML part is asserted to carry the line's distinguishing clause, which is all
an escaping-independent assertion can honestly claim.

**And the footer is not a link**, checked here rather than left to AC-251's
count, because that is the specific way this line would break 10.7: an
orientation sentence with "learn more" attached to it is a second action.

Spec: 10.7 (one action link each), 11.8; RFC 0005 change control item 32.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  EmailCast,
  ORIENTATION_FOOTER,
  linksIn,
  renderedOf,
} from './email-harness.js'

let app: AuthTestApp
const cast = new EmailCast('footer')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** The clause that distinguishes the orientation footer from every other
 * sentence in these templates, and that no escaping choice can alter. */
const FOOTER_CLAUSE = 'no password to create'

describe('AC-254: the orientation footer rides the invitations and nothing else', () => {
  test('AC-254: both invitations carry it, verbatim', async () => {
    const staged = await cast.of(app)
    for (const email of [staged.folderInvite, staged.connectionInvite]) {
      const parts = renderedOf(email)
      expect(
        parts.text,
        `item 32: the ${email.template} goes to an address that may hold no account, so it carries the orientation line`,
      ).toContain(ORIENTATION_FOOTER)
      expect(
        parts.html,
        `and the HTML part carries the same line (${email.template})`,
      ).toContain(FOOTER_CLAUSE)
      expect(
        parts.text,
        'the line replaces "Sent by Dana" on an invitation rather than sitting beside it',
      ).not.toContain('Sent by Dana')
    }
  })

  test('AC-254: the share grant and the reminder carry none of it', async () => {
    const staged = await cast.of(app)
    for (const email of [staged.shareGrant, staged.reminder]) {
      const parts = renderedOf(email)
      expect(
        parts.text,
        `item 32: a ${email.template} reaches somebody who already knows what Dana is, where the orientation line is filler that makes a functional message look promotional`,
      ).not.toContain(FOOTER_CLAUSE)
      expect(
        parts.html,
        `and the HTML part carries none of it either (${email.template})`,
      ).not.toContain(FOOTER_CLAUSE)
      expect(
        parts.text,
        `${email.template} closes with the neutral line instead`,
      ).toContain('Sent by Dana')
    }
  })

  test('AC-254 adversarial: the footer is prose and never a second action', async () => {
    const staged = await cast.of(app)
    for (const email of [staged.folderInvite, staged.connectionInvite]) {
      const parts = renderedOf(email)
      expect(
        linksIn(parts.html),
        `10.7: one action link each, and the orientation line on ${email.template} must not become a second one`,
      ).toHaveLength(1)
      const footerStart = parts.html.indexOf(FOOTER_CLAUSE)
      expect(footerStart, 'the footer must be in the HTML part').toBeGreaterThan(-1)
      expect(
        parts.html.slice(footerStart).includes('<a '),
        'nothing after the orientation line is a link, an unsubscribe or a "learn more" being exactly the second link 10.7 forbids',
      ).toBe(false)
    }
  })
})
